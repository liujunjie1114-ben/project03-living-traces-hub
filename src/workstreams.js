const tracks = new Map(WORKSTREAMS.map(profile => [profile.id, profile]));
const mcpVersion = '2026-07-28';
function getProfile(id) {
  const profile=tracks.get(id);
  if(!profile) throw fail('未找到工作项',404);
  return profile;
}
function routeFor(origin,id) {return origin+'/?work='+encodeURIComponent(id);}
function initialState(profile) {
  const {status,summary,next,blocker}=profile;
  return {revision:0,status,summary,next,blocker,updatedAt:null};
}
function stateFrom(row,profile) {
  return row?{...JSON.parse(row.state),revision:row.revision,updatedAt:row.happened_at}:initialState(profile);
}
async function workList(env,origin) {
  const {results}=await env.DB.prepare(
    'SELECT h.* FROM workstream_history h JOIN (SELECT work_id,MAX(revision) revision FROM workstream_history GROUP BY work_id) latest ON h.work_id=latest.work_id AND h.revision=latest.revision'
  ).all();
  const states=new Map(results.map(row=>[row.work_id,row]));
  return WORKSTREAMS.map(profile=>({id:profile.id,name:profile.name,label:profile.label,number:profile.number,version:profile.version,url:routeFor(origin,profile.id),...stateFrom(states.get(profile.id),profile)}));
}
async function workDetail(env,origin,id,limit=30) {
  const profile=getProfile(id);
  const [history,changes,catalog]=await Promise.all([
    env.DB.prepare('SELECT * FROM workstream_history WHERE work_id=? ORDER BY revision DESC LIMIT ?').bind(id,limit).all(),
    env.DB.prepare('SELECT record_id,action,title,happened_at FROM project_changes WHERE work_id=? ORDER BY happened_at DESC LIMIT ?').bind(id,limit).all(),
    getCatalog(env)
  ]);
  const resources=catalog.records.filter(record=>id===record.workId||profile.resources.includes(record.id))
    .map(record=>({...record,downloadUrl:record.hasFile?origin+'/api/files/'+encodeURIComponent(record.id):null}));
  const events=[
    ...history.results.map(row=>({kind:'progress',note:row.note,channel:row.channel,revision:row.revision,time:row.happened_at,state:JSON.parse(row.state)})),
    ...changes.results.map(row=>({kind:'resource',note:row.action+' · '+row.title,recordId:row.record_id,time:row.happened_at}))
  ].sort((a,b)=>b.time.localeCompare(a.time)).slice(0,limit);
  return {profile,state:stateFrom(history.results[0],profile),resources,events,url:routeFor(origin,id),exportUrl:origin+'/handoff/'+id+'.md'};
}
async function writeProgress(env,id,input,channel) {
  const profile=getProfile(id);
  const previous=await env.DB.prepare('SELECT * FROM workstream_history WHERE work_id=? ORDER BY revision DESC LIMIT 1').bind(id).first();
  const current=stateFrom(previous,profile);
  if(!Number.isInteger(input.expected_revision) || input.expected_revision!==current.revision) throw fail('版本已更新，请先重新读取当前交接，再保存。当前版本 '+current.revision,409);
  const note=clean(input.note,3000);
  const state={
    status:clean(input.status??current.status,100),
    summary:clean(input.summary??current.summary,3000),
    next:clean(input.next??current.next,2000),
    blocker:clean(input.blocker??current.blocker,2000)
  };
  if(!note || !state.status || !state.summary || !state.next) throw fail('请填写状态、当前进度、下一步和本次记录');
  const revision=current.revision+1, time=now();
  const result=await env.DB.prepare('INSERT OR IGNORE INTO workstream_history (work_id,revision,state,note,channel,happened_at) VALUES (?,?,?,?,?,?)')
    .bind(id,revision,JSON.stringify(state),note,channel,time).run();
  if(result.meta.changes!==1) throw fail('有其他更新先保存了，请重新读取交接。',409);
  return {id,...state,revision,updatedAt:time};
}
function handoffMarkdown(data) {
  const {profile,state,resources,events,url}=data;
  const previous=events.slice(0,12).map(event=>'- '+event.time+' · '+event.note).join('\n')||'- 现有交付快照，尚无本站更新记录。';
  const material=resources.map(x=>'- '+x.id+' · '+x.title+(x.version?' · '+x.version:'')+((x.downloadUrl||x.url)?' · '+(x.downloadUrl||x.url):'')+(x.note?' — '+x.note:'')).join('\n');
  return [
    '# 项目三｜'+profile.name+' · GPT 交接',
    '独立工作页：'+url,'快照时间（UTC）：'+now(),'基准：'+profile.version,'记录版本：'+state.revision,
    '## 请接手这项工作',
    '先使用 LIVING TRACES 项目站插件的 get_handoff 读取 '+profile.id+' 最新状态。未连接时，以本文件快照开始，并将需要的私有附件一并上传给当前聊天。实际推进后，使用 record_progress 回写状态、下一步和操作记录；没有连接时，在工作页点击「更新进度」。',
    '## 当前状态',state.status,state.summary,
    '## 下一步',state.next,
    '## 卡点或待确认',state.blocker||'当前未登记。',
    '## 工作阶段',...profile.steps.map(([title,note])=>'- '+title+'：'+note),
    '## 最近记录',previous,
    '## 对应资料',material||'- 暂无'
  ].join('\n\n')+'\n';
}
const workIdSchema={type:'string',enum:WORKSTREAMS.map(x=>x.id),description:'工作项编号'};
const toolSpecs=[
  {name:'list_workstreams',description:'列出 LIVING TRACES 的四项工作、最新状态、下一步和独立链接。',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{}}},
  {name:'get_handoff',description:'接手一项工作前，读取最新版本、当前进度、卡点、下一步、最近记录和关联资料。',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{work_id:workIdSchema},required:['work_id']}},
  {name:'read_resource',description:'按资料编号读取 Markdown、TXT、JSON 或 CSV 的前 24 KiB。其它类型返回下载入口。',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{record_id:{type:'string'}},required:['record_id']}},
  {name:'record_progress',description:'完成用户委托的实际操作后，保存此工作项的当前状态和本次操作记录。先读取 get_handoff，使用返回的 state.revision 作为 expected_revision。',annotations:{readOnlyHint:false,destructiveHint:false},inputSchema:{type:'object',properties:{
    work_id:workIdSchema,expected_revision:{type:'integer',minimum:0},status:{type:'string',description:'当前状态'},summary:{type:'string',description:'实际进度'},next:{type:'string',description:'下一步可执行动作'},blocker:{type:'string',description:'卡点或待确认项'},note:{type:'string',description:'本次执行、结果和验证证据'}
  },required:['work_id','expected_revision','note']}},
  {name:'add_resource_link',description:'把本次工作产生或使用的在线资料链接登记到相应工作项，并记入操作历史。',annotations:{readOnlyHint:false,destructiveHint:false},inputSchema:{type:'object',properties:{
    work_id:workIdSchema,title:{type:'string'},url:{type:'string'},version:{type:'string'},status:{type:'string'},note:{type:'string'}
  },required:['work_id','title','url']}}
];
async function callSiteTool(env,origin,name,input) {
  if(name==='list_workstreams') return {workstreams:await workList(env,origin)};
  if(name==='get_handoff') return workDetail(env,origin,input.work_id,15);
  if(name==='record_progress') return writeProgress(env,input.work_id,input,'gpt');
  if(name==='add_resource_link'){
    const profile=getProfile(input.work_id);
    if(!input.url) throw fail('需要填写在线链接');
    const category={portfolio:'视觉作品集',modeling:'建模制造',fabrication:'建模制造',hardware:'硬件与采集'}[profile.id];
    const body=details({...input,category,workId:profile.id});
    const id='P03-U-'+crypto.randomUUID();
    await save(env,id,body,null,'GPT 登记资料链接');
    return {id,...body,url:body.url,workUrl:routeFor(origin,profile.id)};
  }
  if(name==='read_resource'){
    const {row,record}=await lookup(env,clean(input.record_id,120));
    if(!record) throw fail('未找到资料编号',404);
    const answer={record,downloadUrl:row?.object_key?origin+'/api/files/'+encodeURIComponent(record.id):null};
    if(row?.object_key&&/\.(md|txt|json|csv)$/i.test(row.file_name)){
      const limit=Math.min(24*1024,row.byte_size);
      const object=await env.BUCKET.get(row.object_key,{range:{offset:0,length:limit}});
      if(object){answer.text=await object.text();answer.truncated=row.byte_size>limit;}
    }
    return answer;
  }
  throw fail('未知工具',404);
}
async function siteMcp(request,env,url) {
  if(request.method==='GET') return new Response(null,{status:405,headers:{allow:'POST'}});
  if(request.method!=='POST'||!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({error:'JSON-RPC only'},415);
  let rpc;
  try{rpc=await request.json();}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});}
  if(!rpc||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string') return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}});
  if(rpc.id===undefined) return new Response(null,{status:202});
  const reply=result=>json({jsonrpc:'2.0',id:rpc.id,result});
  switch(rpc.method){
    case 'server/discover':return reply({supportedVersions:[mcpVersion],capabilities:{tools:{}},serverInfo:{name:'living-traces-project-hub',version:'2.0.0'}});
    case 'initialize':return reply({protocolVersion:rpc.params?.protocolVersion||mcpVersion,capabilities:{tools:{}},serverInfo:{name:'living-traces-project-hub',version:'2.0.0'}});
    case 'ping':return reply({});
    case 'tools/list':return reply({tools:toolSpecs});
    case 'tools/call':
      try{
        const value=await callSiteTool(env,url.origin,rpc.params?.name,rpc.params?.arguments||{});
        return reply({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
      }catch(error){
        if(!error.status)console.error(error.message);
        return reply({isError:true,content:[{type:'text',text:error.status?error.message:'暂时无法执行此工具'}]});
      }
    default:return json({jsonrpc:'2.0',id:rpc.id,error:{code:-32601,message:'Method not found'}});
  }
}

