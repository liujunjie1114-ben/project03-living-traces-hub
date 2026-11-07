const CHUNK = 8 * 1024 * 1024;
const LIMIT = 256 * 1024 * 1024;
const baseRecords = new Map(CATALOG.records.map(record => [record.id, record]));
const categories = ['建模制造','视觉作品集','软件与验证','硬件与采集','研究进展','项目管理','待归档'];
const common = {'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const json = (body, status = 200) => Response.json(body,{status,headers:common});
const fail = (message, status = 400) => Object.assign(new Error(message),{status});
const now = () => new Date().toISOString();
const clean = (value, n) => typeof value === 'string' ? value.trim().slice(0,n) : '';

function recordFrom(row) {
  return {...JSON.parse(row.details), id:row.id, fileName:row.file_name, size:row.byte_size, hasFile:!!row.object_key, updatedAt:row.updated_at};
}
function details(input, current = {}) {
  const category = clean(input.category ?? current.category,30);
  const title = clean(input.title ?? current.title,120);
  const url = clean(input.url ?? current.url,700);
  if (!title || !categories.includes(category)) throw fail('请填写名称并选择资料分类');
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw fail('链接格式有误'); }
    if (!['https:','http:'].includes(parsed.protocol)) throw fail('请使用 HTTP 或 HTTPS 链接');
  }
  return {
    category,title,url,version:clean(input.version ?? current.version,80),
    status:clean(input.status ?? current.status,40)||'待整理',
    note:clean(input.note ?? current.note,3000),sha256:current.sha256||undefined,
    workId:tracks.has(input.workId ?? current.workId)?(input.workId ?? current.workId):undefined
  };
}
async function lookup(env,id) {
  const row = await env.DB.prepare('SELECT * FROM project_records WHERE id = ?').bind(id).first();
  return {row, record:row ? recordFrom(row) : baseRecords.get(id)};
}
async function save(env,id,body,file,action) {
  const date=now();
  const statements = [
    env.DB.prepare('INSERT INTO project_records (id,details,file_name,byte_size,object_key,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET details=excluded.details,file_name=COALESCE(excluded.file_name,project_records.file_name),byte_size=COALESCE(excluded.byte_size,project_records.byte_size),object_key=COALESCE(excluded.object_key,project_records.object_key),updated_at=excluded.updated_at')
      .bind(id,JSON.stringify(body),file?.name??null,file?.size??null,file?.key??null,date)
  ];
  if(action) statements.push(env.DB.prepare('INSERT INTO project_changes (id,record_id,action,title,happened_at,work_id) VALUES (?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),id,action,body.title,date,body.workId??null));
  await env.DB.batch(statements);
}
async function getCatalog(env) {
  const [records, changes] = await Promise.all([
    env.DB.prepare('SELECT * FROM project_records').all(),
    env.DB.prepare('SELECT record_id, action, title, happened_at FROM project_changes ORDER BY happened_at DESC LIMIT 35').all()
  ]);
  const merged = new Map(baseRecords);
  for(const row of records.results) merged.set(row.id,recordFrom(row));
  return {...CATALOG, records:[...merged.values()], changes:changes.results, categories};
}
function fileMeta(input) {
  const name=clean(input.fileName,240);
  const size=Number(input.size);
  if(!name || !Number.isSafeInteger(size) || size<1 || size>LIMIT) throw fail('请选择 1 字节至 256 MB 的文件');
  return {name,size};
}
function uploadKey(id) {return 'files/'+id+'/'+crypto.randomUUID();}
function resume(env,id,key,uploadId) {
  if(!key?.startsWith('files/'+id+'/') || !/^[a-zA-Z0-9\/-]+$/.test(key) || !uploadId) throw fail('上传会话无效');
  return env.BUCKET.resumeMultipartUpload(key,uploadId);
}
const previewTypes = new Map(Object.entries({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',pdf:'application/pdf',md:'text/plain; charset=utf-8',txt:'text/plain; charset=utf-8',json:'text/plain; charset=utf-8',csv:'text/plain; charset=utf-8'}));
async function download(request,env,id,url) {
  const {row}=await lookup(env,id);
  if(!row?.object_key) throw fail('此记录暂无可下载附件',404);
  const isPreview=url.searchParams.has('preview');
  const suffix=row.file_name.split('.').at(-1).toLowerCase();
  const type=isPreview ? previewTypes.get(suffix) : 'application/octet-stream';
  if(!type) throw fail('请下载后打开此文件',415);
  const object=request.method==='HEAD' ? await env.BUCKET.head(row.object_key) : await env.BUCKET.get(row.object_key);
  if(!object) throw fail('附件对象不存在',404);
  return new Response(request.method==='HEAD' ? null : object.body,{headers:{
    ...common, 'content-type':type, 'content-length':String(object.size),
    'content-disposition':(isPreview?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(row.file_name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16)),
    'content-security-policy':"default-src 'none'; sandbox"
  }});
}
function ensureOrigin(request,url) {
  if(request.headers.get('Origin')!==url.origin) throw fail('请从本站发起操作',403);
}
async function api(request,env,url) {
  const {pathname:path,searchParams:q}=url;
  const method=request.method;
  if(method==='GET' && path==='/api/catalog') return json(await getCatalog(env));
  if(method==='GET' && path==='/api/workstreams') return json(await workList(env,url.origin));
  const work=path.match(/^\/api\/workstreams\/([a-z]+)$/);
  if(work&&method==='GET') return json(await workDetail(env,url.origin,work[1],Math.min(200,Math.max(10,Math.trunc(Number(q.get('limit'))||30)))));
  if(work&&method==='POST'){
    ensureOrigin(request,url);
    return json(await writeProgress(env,work[1],await request.json(),'web'));
  }
  const attachment=path.match(/^\/api\/files\/([A-Za-z0-9-]+)$/);
  if(attachment && (method==='GET'||method==='HEAD')) return download(request,env,attachment[1],url);
  if(!['POST','PATCH','PUT'].includes(method)) throw fail('未找到接口',404);
  ensureOrigin(request,url);
  if(method==='POST' && path==='/api/records'){
    const input=await request.json(), id='P03-U-'+crypto.randomUUID();
    const body=details(input);
    await save(env,id,body,null,'新建记录');
    return json({id},201);
  }
  const editable=path.match(/^\/api\/records\/([A-Za-z0-9-]+)$/);
  if(method==='PATCH' && editable){
    const id=editable[1], {record}=await lookup(env,id);
    if(!record) throw fail('未找到这条记录',404);
    await save(env,id,details(await request.json(),record),null,'更新分类或记录');
    return json({id});
  }
  const attach=path.match(/^\/api\/upload\/([A-Za-z0-9-]+)(?:\/(init|finish|part)\/?([0-9]+)?)?$/);
  if(!attach) throw fail('未找到接口',404);
  const [,id,step,num]=attach;
  const {record}=await lookup(env,id);
  if(!record) throw fail('请先建立资料记录',404);
  if(record.hasFile) throw fail('记录已有附件。请为新版本新建记录。',409);
  const seed=baseRecords.has(id);
  if(!step && method==='PUT'){
    const file=fileMeta({fileName:q.get('name'),size:q.get('size')});
    if(file.size>CHUNK) throw fail('请分段上传大文件');
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength!==file.size) throw fail('附件大小与登记值不符');
    const key=uploadKey(id);
    await env.BUCKET.put(key,bytes);
    await save(env,id,details({},record),{...file,key},seed?null:'上传附件');
    return json({id,size:file.size});
  }
  if(step==='init' && method==='POST'){
    fileMeta(await request.json());
    const key=uploadKey(id);
    const upload=await env.BUCKET.createMultipartUpload(key);
    return json({key,uploadId:upload.uploadId});
  }
  if(step==='part' && method==='PUT'){
    const number=Number(num);
    const declared=Number(request.headers.get('content-length'));
    if(!Number.isInteger(number)||number<1||number>32||!Number.isInteger(declared)||declared<1||declared>CHUNK) throw fail('无效的上传分段');
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength!==declared) throw fail('分段大小不符');
    return json(await resume(env,id,q.get('key'),q.get('uploadId')).uploadPart(number,bytes));
  }
  if(step==='finish' && method==='POST'){
    const input=await request.json(), file=fileMeta(input);
    const count=Math.ceil(file.size/CHUNK);
    if(!Array.isArray(input.parts)||input.parts.length!==count||!input.parts.every((p,j)=>p.partNumber===j+1&&typeof p.etag==='string')) throw fail('上传分段尚未齐全');
    const object=await resume(env,id,input.key,input.uploadId).complete(input.parts);
    if(object.size!==file.size) throw fail('附件大小与登记值不符');
    await save(env,id,details({},record),{...file,key:object.key},seed?null:'上传附件');
    return json({id,size:file.size});
  }
  throw fail('未找到接口',404);
}

export default {async fetch(request,env){
  const url=new URL(request.url);
  try {
    if(url.pathname==='/mcp') return await siteMcp(request,env,url);
    const handoff=url.pathname.match(/^\/handoff\/([a-z]+)\.md$/);
    if(handoff&&request.method==='GET'){
      const markdown=handoffMarkdown(await workDetail(env,url.origin,handoff[1],30));
      return new Response(markdown,{headers:{...common,'content-type':'text/markdown; charset=utf-8','content-disposition':'attachment; filename="LIVING-TRACES-'+handoff[1]+'-handoff.md"'}});
    }
    if(url.pathname.startsWith('/api/')) return await api(request,env,url);
    const page={'/':['html','text/html'],'/site.css':['css','text/css'],'/app.js':['app','text/javascript']}[url.pathname];
    if(!page) return new Response('Not found',{status:404});
    return new Response(UI[page[0]],{headers:{...common,'content-type':page[1]+'; charset=utf-8',
      'content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"}});
  }catch(error){
    if(!error.status) console.error(error.message);
    return json({error:error.status?error.message:'暂时无法处理，请稍后重试'},error.status||500);
  }
}};
