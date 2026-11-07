const content=document.querySelector('#content');
const editor=document.querySelector('#edit');
const detail=document.querySelector('#detail');
const form=document.querySelector('#record-form');
const names={home:'项目概览',library:'资料库',status:'状态与交接',diff:'版本差异',r2:'R2 包内索引',changes:'操作记录'};
const chunks=8*1024*1024;
const filter={query:'',category:'',status:'',r2query:''};
let catalog, active='home', editId='', pendingId='', busy=false, toastTimer;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const record=id=>catalog.records.find(entry=>entry.id===id);
const file=(id,preview=false)=>'/api/files/'+encodeURIComponent(id)+(preview?'?preview=1':'');
const external=(url,label)=>url?'<a class="button" target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(label)+' ↗</a>':'';
const cls=status=>/已验|现行|可访问/.test(status)?'good':/待|需/.test(status)?'wait':/参考/.test(status)?'ref':'';
const badge=status=>'<span class="badge '+cls(status)+'">'+esc(status)+'</span>';
const button=(attribute,value,label,kind='link')=>'<button class="'+kind+'" data-'+attribute+'="'+esc(value)+'">'+esc(label)+'</button>';
const sized=value=>value>=1048576?(value/1048576).toFixed(1)+' MB':value>=1024?(value/1024).toFixed(1)+' KB':value+' B';
const date=value=>new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Shanghai'}).format(new Date(value));
const options=(values,selected,blank)=>'<option value="">'+esc(blank)+'</option>'+values.map(value=>'<option'+(value===selected?' selected':'')+'>'+esc(value)+'</option>').join('');
const headers=values=>'<thead><tr>'+values.map(s=>'<th scope="col">'+esc(s)+'</th>').join('')+'</tr></thead>';
const row=values=>'<tr>'+values.map(value=>'<td>'+value+'</td>').join('')+'</tr>';
const table=(titles,rows)=>rows.length?'<div class="table"><table>'+headers(titles)+'<tbody>'+rows.join('')+'</tbody></table></div>':'<p class="panel empty">没有符合条件的记录。</p>';
const page=(code,title,note)=>'<p class="eyebrow">'+esc(code)+'</p><h1>'+esc(title)+'</h1><p class="subtitle">'+esc(note)+'</p>';
const article=(id,label='查看资料')=>button('record',id,label);
async function api(path,method='GET',body){
  const isJson=body!==undefined && !(body instanceof Blob);
  const response=await fetch(path,{method,credentials:'same-origin',headers:isJson?{'Content-Type':'application/json'}:undefined,body:isJson?JSON.stringify(body):body});
  if(!response.ok){
    const error=await response.json().catch(()=>({}));
    throw new Error(error.error||'请求失败（'+response.status+'）');
  }
  return response.json();
}
async function refresh(){catalog=await api('/api/catalog');}
function notify(message){
  const el=document.querySelector('#feedback');
  el.hidden=false;
  el.textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.hidden=true,4300);
}
function home(){
  const image=record('P03-V02');
  const cover=image?.hasFile?'<div class="hero-image"><img src="'+file(image.id,true)+'" alt="LIVING TRACES V01 装置外观候选图"></div>':'';
  const links=['P03-S01','P03-M03'].map((id,i)=>external(record(id)?.url,i?'建模工作台':'Studio 演示')).join('');
  const stats=[['library',catalog.records.length,'条资料'],['status',catalog.status.length,'条进展记录'],['r2',catalog.r2.length,'个 R2 包内文件']];
  const mini=catalog.status.filter(x=>['03','04','05','06','07','08'].includes(x.id));
  return '<section class="hero"><div class="hero-copy"><p class="eyebrow">PROJECT 03 / LIVING TRACES</p><h1>项目资料站</h1><p class="subtitle">统一查找装置建模、声光交互、作品集和研究资料。版本与交接记录随项目继续更新。</p><div class="action-row">'+links+'</div></div>'+cover+'</section>'+
    '<div class="stats">'+stats.map(([view,count,label])=>'<button class="stat" data-view="'+view+'"><strong>'+count+'</strong><span>'+esc(label)+'</span></button>').join('')+'</div>'+
    '<section><div class="section-head"><h2>项目状态</h2>'+button('view','status','查看全部')+'</div><div class="version-grid">'+mini.map(x=>'<article class="panel mini"><small>'+esc(x.version)+'</small><h3>'+esc(x.title)+'</h3><p>'+badge(x.status)+'</p><p>'+esc(x.note)+'</p>'+(x.recordId?article(x.recordId):'')+'</article>').join('')+'</div></section>';
}
function libraryTable(){
  const query=filter.query.trim().toLowerCase();
  const rows=catalog.records.filter(x=>(!filter.category||x.category===filter.category)&&(!filter.status||x.status===filter.status)&&(!query||[x.title,x.id,x.category,x.version,x.note,x.fileName].join(' ').toLowerCase().includes(query)));
  return '<p class="recordcount">'+rows.length+' 条资料</p>'+table(['资料','分类','版本','状态','说明','操作'],rows.map(x=>row([
    '<strong>'+esc(x.title)+'</strong><small class="mono">'+esc(x.id)+'</small>',esc(x.category),esc(x.version||'—'),badge(x.status),esc(x.note),
    '<div class="row-actions">'+article(x.id,'查看')+(x.hasFile?'<a href="'+file(x.id)+'">下载</a>':x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">访问</a>':'')+'</div>'
  ])));
}
function library(){
  const status=[...new Set(catalog.records.map(x=>x.status))];
  return page('02 / LIBRARY','资料库','查找、下载或调整资料分类。新增资料可上传文件，也可登记网址和说明。')+
  '<div class="filters"><input id="search" type="search" aria-label="搜索资料" placeholder="搜索名称、编号、版本或说明" value="'+esc(filter.query)+'"><select id="category" aria-label="筛选分类">'+options(catalog.categories,filter.category,'所有分类')+'</select><select id="state" aria-label="筛选状态">'+options(status,filter.status,'所有状态')+'</select></div><div id="result">'+libraryTable()+'</div>';
}
function statuses(){
  return page('03 / HANDOFF','状态与交接','区分现行基准、历史交付、软件验证和实物验收。')+table(
    ['工作线','版本','状态','交接方向','证据与下一步','关联资料'],catalog.status.map(x=>row([
      '<strong>'+esc(x.title)+'</strong>',esc(x.version),badge(x.status),esc(x.area),esc(x.note),x.recordId?article(x.recordId):external(x.url,'打开')
    ])));
}
function diff(){
  return page('04 / VERSIONS','版本差异','用来源和处理规则说明同一资料在不同版本中的差别。')+table(
    ['字段','来源差异','状态','处理规则','关联资料'],catalog.diff.map(x=>row([
      '<strong>'+esc(x.title)+'</strong><small>'+esc(x.id)+'</small>',esc(x.source),badge(x.status),esc(x.note),x.recordId?article(x.recordId):external(x.url,'打开')
    ])));
}
function r2Table(){
  const needle=filter.r2query.trim().toLowerCase();
  const list=catalog.r2.filter(x=>[x.title,x.category,x.status].join(' ').toLowerCase().includes(needle));
  return '<p class="recordcount">'+list.length+' 个包内文件</p>'+table(['原包相对路径','分类','大小','核验'],list.map(x=>row([
    '<span class="mono">'+esc(x.title)+'</span>',esc(x.category),sized(x.size),esc(x.status)
  ])));
}
function r2(){
  const archive=record('P03-IN-03');
  return page('05 / R2 ARCHIVE','R2 包内索引','按原包相对路径查询。这里保留 124 个条目，其中 123 项通过包内 SHA256 核对。')+
    '<div class="filters"><input id="r2search" type="search" aria-label="搜索包内文件" placeholder="搜索包内路径，例如 BOM 或 parts/A01" value="'+esc(filter.r2query)+'">'+(archive?.hasFile?'<a class="button" href="'+file(archive.id)+'">下载 R2 原包</a>':'')+'</div><div id="result">'+r2Table()+'</div>';
}
function changes(){
  return page('06 / ACTIVITY','操作记录','查看本站新增的资料、附件和分类更新。')+(catalog.changes.length?table(['时间（北京时间）','动作','资料','入口'],catalog.changes.map(x=>row([
    esc(date(x.happened_at)),esc(x.action),esc(x.title),article(x.record_id)
  ]))):'<p class="panel empty">本站还没有新增或编辑操作。现有项目进度见「状态与交接」。</p>');
}
const renderers={home,library,status:statuses,diff,r2,changes};
function render(view=active){
  if(!catalog) return;
  active=names[view]?view:'home';
  document.querySelector('#view-name').textContent=names[active];
  for(const el of document.querySelectorAll('#nav button')){
    if(el.dataset.view===active) el.setAttribute('aria-current','page');
    else el.removeAttribute('aria-current');
  }
  content.innerHTML=renderers[active]();
}
function navigate(view){
  if(location.hash.slice(1)===view) render(view);
  else location.hash=view;
}
function showRecord(id){
  const item=record(id);
  if(!item) return;
  const img=item.hasFile && /\.(png|jpg|jpeg|gif|webp)$/i.test(item.fileName)?'<img class="preview" alt="'+esc(item.title)+'" src="'+file(id,true)+'">':'';
  const download=item.hasFile?'<a class="button" href="'+file(id)+'">下载附件 · '+sized(item.size)+'</a>':'';
  const preview=item.hasFile&&/\.(pdf|md|txt|csv|json)$/i.test(item.fileName)?'<a class="button" target="_blank" rel="noopener" href="'+file(id,true)+'">查看原文 ↗</a>':'';
  document.querySelector('#detail-body').innerHTML='<div class="dialog-head"><div><p class="eyebrow">'+esc(item.id)+' / '+esc(item.category)+'</p><h2>'+esc(item.title)+'</h2></div><button class="icon" aria-label="关闭" data-close="detail">×</button></div><p>'+badge(item.status)+' <span class="muted">'+esc(item.version||'')+'</span></p>'+img+
    '<p class="detail-note">'+esc(item.note||'暂无说明')+'</p>'+(item.fileName?'<p class="muted">'+esc(item.fileName)+'</p>':'')+
    (item.sha256?'<p class="sha mono">SHA256 '+esc(item.sha256)+'</p>':'')+
    '<div class="action-row">'+download+preview+external(item.url,'访问网址')+button('edit-record',item.id,'编辑资料','button')+'</div>';
  detail.showModal();
}
function edit(item){
  editId=item?.id||'';
  pendingId='';
  form.reset();
  document.querySelector('#edit-title').textContent=item?'编辑资料':'新增资料';
  form.elements.category.innerHTML=catalog.categories.map(x=>'<option>'+esc(x)+'</option>').join('');
  form.elements.category.value=item?.category||filter.category||'待归档';
  for(const key of ['title','version','status','note','url']) form.elements[key].value=item?.[key]||'';
  document.querySelector('#attach-field').hidden=Boolean(item?.hasFile);
  document.querySelector('#upload-state').hidden=true;
  document.querySelector('#form-error').hidden=true;
  editor.showModal();
}
function progress(percent,message){
  const el=document.querySelector('#upload-state');
  el.hidden=false;
  el.querySelector('progress').value=percent;
  el.querySelector('p').textContent=message;
}
async function upload(id,blob){
  const meta={fileName:blob.name,size:blob.size};
  const root='/api/upload/'+encodeURIComponent(id);
  if(blob.size<=chunks){
    progress(20,'正在上传附件…');
    const query=new URLSearchParams({name:blob.name,size:blob.size});
    await api(root+'?'+query,'PUT',blob);
    progress(100,'附件已保存');
    return;
  }
  const session=await api(root+'/init','POST',meta), parts=[];
  const query=new URLSearchParams(session);
  for(let offset=0;offset<blob.size;offset+=chunks){
    progress(Math.floor(offset/blob.size*100),'正在上传第 '+(parts.length+1)+' 段…');
    parts.push(await api(root+'/part/'+(parts.length+1)+'?'+query,'PUT',blob.slice(offset,offset+chunks)));
  }
  await api(root+'/finish','POST',{...meta,...session,parts});
  progress(100,'附件已保存');
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy) return;
  const errorEl=document.querySelector('#form-error');
  errorEl.hidden=true;
  const data=new FormData(form);
  const attachment=data.get('file');
  const payload=Object.fromEntries([...data].filter(([key])=>key!=='file'));
  if(attachment?.size>256*1024*1024){
    errorEl.textContent='单文件最大 256 MB。';
    errorEl.hidden=false;
    return;
  }
  busy=true;
  const save=form.querySelector('button[type=submit]');
  save.disabled=true;
  try{
    let id=editId||pendingId;
    if(id) await api('/api/records/'+id,'PATCH',payload);
    else {
      ({id}=await api('/api/records','POST',payload));
      pendingId=id;
    }
    if(attachment?.size && !document.querySelector('#attach-field').hidden) await upload(id,attachment);
    await refresh();
    editor.close();
    pendingId='';
    navigate('library');
    notify('资料已保存');
  }catch(error){
    errorEl.textContent=error.message+(pendingId?'。资料记录已保存，可以重试附件上传。':'');
    errorEl.hidden=false;
  }finally{busy=false;save.disabled=false;}
});
document.addEventListener('click',event=>{
  const target=event.target.closest('button');
  if(!target) return;
  const d=target.dataset;
  if(d.view) navigate(d.view);
  else if(d.record) showRecord(d.record);
  else if(d.editRecord){detail.close();edit(record(d.editRecord));}
  else if(d.close && !busy) document.getElementById(d.close).close();
  else if(target.id==='new-record' && catalog) edit();
});
editor.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
content.addEventListener('input',event=>{
  if(event.target.id==='search'){filter.query=event.target.value;document.querySelector('#result').innerHTML=libraryTable();}
  if(event.target.id==='r2search'){filter.r2query=event.target.value;document.querySelector('#result').innerHTML=r2Table();}
});
content.addEventListener('change',event=>{
  if(event.target.id==='category') filter.category=event.target.value;
  else if(event.target.id==='state') filter.status=event.target.value;
  else return;
  document.querySelector('#result').innerHTML=libraryTable();
});
window.addEventListener('hashchange',()=>render(location.hash.slice(1)));
try{await refresh();render(location.hash.slice(1));}
catch(error){content.innerHTML='<p class="error">读取资料失败。'+esc(error.message)+' 请刷新后重试。</p>';}

