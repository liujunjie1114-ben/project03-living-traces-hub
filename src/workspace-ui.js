const workKey=new URLSearchParams(location.search).get('work')||'';
let trackList=[], activeWork=null, progressRevision=0, historyLimit=30;
const workUrl=id=>'/?work='+encodeURIComponent(id);
const defaultCategory={portfolio:'视觉作品集',modeling:'建模制造',fabrication:'建模制造',hardware:'硬件与采集'};
function workHome(){
  const cards=trackList.map(track=>
    '<article class="work-card panel"><div class="work-code"><span>'+esc(track.number)+'</span><span>'+esc(track.label)+'</span></div><h2><a href="'+workUrl(track.id)+'">'+esc(track.name)+'</a></h2><p>'+badge(track.status)+'</p><p class="work-card-next"><b>下一步</b><br>'+esc(track.next)+'</p><footer><a class="primary" href="'+workUrl(track.id)+'">进入工作 ↗</a><a class="handoff-link" href="/handoff/'+esc(track.id)+'.md">导出交接</a></footer></article>'
  ).join('');
  return '<div class="project-heading">'+page('PROJECT 03 / LIVING TRACES','项目工作台','选择一项工作，查看做到哪、接下来做什么，以及需要交给 GPT 的资料。')+'</div>'+
    '<div class="work-grid">'+cards+'</div>'+
    '<section class="panel workflow-note"><h2>在网页与 GPT 之间接力</h2><p>打开工作页，点「复制 GPT 接力指令」并发给已连接项目站插件的 GPT。也可以下载交接 Markdown，随所需附件一起发送。网页保存与插件回写都会出现在该工作页的历史里。</p>'+
    '<div class="action-row">'+external(record('P03-S01')?.url,'Studio 演示')+external(record('P03-M03')?.url,'原建模工作台')+button('view','library','浏览全部资料','button')+'</div></section>';
}
function resourceRows(resources){
  return table(['名称','版本','状态','入口'],resources.map(x=>row([
    '<strong>'+esc(x.title)+'</strong><small class="mono">'+esc(x.id)+'</small>',esc(x.version||'—'),badge(x.status),
    '<div class="row-actions">'+article(x.id,'查看')+(x.hasFile?'<a href="'+file(x.id)+'">下载</a>':x.url?'<a target="_blank" rel="noopener noreferrer" href="'+esc(x.url)+'">访问</a>':'')+'</div>'
  ])));
}
function timeline(events){
  if(!events.length) return '<p class="empty">目前显示项目已有的交付快照。第一次保存进度或新增资料后，这里会出现记录。</p>';
  return '<ol class="timeline">'+events.map(event=>{
    const title=event.kind==='progress'?(event.channel==='gpt'?'GPT 回写':'网页更新')+' · 版本 '+event.revision:'资料操作';
    const more=event.kind==='progress'?'<details><summary>展开当时状态</summary><dl><dt>状态</dt><dd>'+esc(event.state.status)+'</dd><dt>进度</dt><dd>'+esc(event.state.summary)+'</dd><dt>下一步</dt><dd>'+esc(event.state.next)+'</dd></dl></details>':article(event.recordId);
    return '<li><div><strong>'+esc(title)+'</strong><time>'+esc(date(event.time))+'</time></div><p>'+esc(event.note)+'</p>'+more+'</li>';
  }).join('')+'</ol>';
}
function showWork(data){
  const {profile,state,resources,events}=data;
  document.querySelector('#view-name').textContent=profile.name;
  document.title=profile.name+'｜LIVING TRACES';
  document.querySelector('[data-work-nav="'+profile.id+'"]').setAttribute('aria-current','page');
  content.innerHTML=
    '<header class="work-header"><div><p class="eyebrow">PROJECT 03 / '+esc(profile.number)+' / '+esc(profile.label)+'</p><h1>'+esc(profile.name)+'</h1><p class="work-version">'+esc(profile.version)+' · 记录版本 '+state.revision+' '+(state.updatedAt?'· '+esc(date(state.updatedAt)):'· 初始快照')+'</p></div>'+
    '<div class="action-row">'+button('progress','yes','更新进度','primary')+'</div></header>'+
    '<section class="panel work-current"><div><p class="eyebrow">当前状态</p><h2>'+esc(state.status)+'</h2><p>'+esc(state.summary)+'</p></div><div class="work-next"><p class="eyebrow">下一步</p><strong>'+esc(state.next)+'</strong>'+(state.blocker?'<p><b>待确认</b> '+esc(state.blocker)+'</p>':'')+'</div></section>'+
    '<section class="panel handoff"><div><h2>交给 GPT 接着做</h2><p>连接项目站插件后，GPT 可读取实时状态并回写。也可以直接发送 Markdown 快照。</p></div><div class="action-row">'+button('copy-work','prompt','复制 GPT 接力指令','primary')+'<a class="button" href="/handoff/'+esc(profile.id)+'.md">下载交接 Markdown</a>'+button('copy-work','link','复制本页链接','button')+'</div></section>'+
    '<section class="section"><div class="section-head"><h2>工作阶段</h2></div><div class="version-grid work-steps">'+profile.steps.map(([title,note],i)=>'<article class="panel mini"><small>STEP '+String(i+1).padStart(2,'0')+'</small><h3>'+esc(title)+'</h3><p>'+esc(note)+'</p></article>').join('')+'</div></section>'+
    '<section class="section"><div class="section-head"><h2>相关资料</h2>'+button('add-work-resource','yes','＋ 给这项工作加资料','button')+'</div>'+resourceRows(resources)+'</section>'+
    '<section class="section"><div class="section-head"><h2>操作历史</h2><span class="muted">网页与 GPT 更新</span></div><div class="panel">'+timeline(events)+(events.length>=historyLimit&&historyLimit<200?button('more-history','yes','查看更多记录','button history-more'):'')+'</div></section>';
}
async function loadWork(onlyChanged=false){
  const next=await api('/api/workstreams/'+encodeURIComponent(workKey)+'?limit='+historyLimit);
  if(onlyChanged&&activeWork&&JSON.stringify(next)===JSON.stringify(activeWork)) return;
  activeWork=next;
  const map=new Map(catalog.records.map(x=>[x.id,x]));
  for(const item of next.resources) map.set(item.id,item);
  catalog.records=[...map.values()];
  showWork(next);
}
function openProgress(){
  if(!activeWork) return;
  const modal=document.querySelector('#work-editor');
  const editorForm=document.querySelector('#progress-form');
  editorForm.reset();
  const {profile,state}=activeWork;
  progressRevision=state.revision;
  document.querySelector('#progress-work').textContent=profile.name+' / 记录版本 '+state.revision;
  for(const key of ['status','summary','next','blocker']) editorForm.elements[key].value=state[key]||'';
  document.querySelector('#progress-error').hidden=true;
  modal.showModal();
}
function gptPrompt(){
  const {profile,state,url}=activeWork;
  return '请接手 LIVING TRACES 项目三的「'+profile.name+'」。工作页：'+url+'。\n\n如果当前聊天已连接这个项目站的插件，请先调用 get_handoff，work_id='+profile.id+'，用它返回的最新状态、资料和下一步作为依据。需要文档时用 read_resource。每完成一次可核查的操作，用 record_progress 记录结果、证据和下一步，expected_revision 使用刚读取的 state.revision。新的资料链接用 add_resource_link 登记。\n\n如果当前聊天无法连接插件，请按我附上的交接 Markdown 快照继续，并在结束时输出可粘贴回工作页的进度、下一步和本次记录。当前网页版本 '+state.revision+'。';
}
async function copyWork(text){
  try {await navigator.clipboard.writeText(text);notify('已复制');}
  catch {
    const temp=document.createElement('textarea');
    temp.value=text;
    temp.className='copy-temp';
    document.body.append(temp);
    temp.select();
    const copied=document.execCommand('copy');
    temp.remove();
    if(copied) notify('已复制');
    else window.prompt('请手动复制',text);
  }
}
function wireWorkUi(){
  const form=document.querySelector('#progress-form');
  const dialog=document.querySelector('#work-editor');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(busy) return;
    const error=document.querySelector('#progress-error');
    const save=form.querySelector('button[type=submit]');
    error.hidden=true;
    busy=true;
    save.disabled=true;
    try{
      await api('/api/workstreams/'+workKey,'POST',{...Object.fromEntries(new FormData(form)),expected_revision:progressRevision});
      dialog.close();
      await loadWork();
      notify('已保存进度并记录历史');
    }catch(reason){error.textContent=reason.message;error.hidden=false;}
    finally{busy=false;save.disabled=false;}
  });
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  document.addEventListener('click',event=>{
    const data=event.target.closest('button')?.dataset;
    if(!data) return;
    if(data.progress) openProgress();
    if(data.copyWork&&activeWork) copyWork(data.copyWork==='link'?activeWork.url:gptPrompt());
    if(data.addWorkResource) edit();
    if(data.moreHistory){historyLimit=Math.min(200,historyLimit+30);loadWork().catch(reason=>notify(reason.message));}
  });
  async function refreshVisible(){
    if(document.hidden||busy||document.querySelector('dialog[open]')) return;
    if(workKey) await loadWork(true);
    else if(active==='home'){
      const updated=await api('/api/workstreams');
      if(JSON.stringify(updated)!==JSON.stringify(trackList)){trackList=updated;render('home');}
    }
  }
  const update=()=>refreshVisible().catch(()=>{});
  window.addEventListener('focus',update);
  setInterval(update,15000);
}

