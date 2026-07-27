(function(){
  const STORAGE_KEY='baoyan_pdf_builder_projects_v1';
  const ACTIVE_KEY='baoyan_pdf_builder_active_v1';
  let state={projects:[],activeId:null,logos:[]};
  let previewUrl='';
  let saveTimer=null;
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const uid=(p='id')=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clone=o=>JSON.parse(JSON.stringify(o));
  const currentYear=()=>new Date().getFullYear();
  const profileDefault={name:'李新',undergraduateSchool:'重庆师范大学',undergraduateMajor:'物理学',targetMajor:'理论物理',phone:'15123577446',email:'xinliphy@126.com'};

  function defaultMaterials(){return [
    material('个人简历',1,true),material('成绩单',1,true),material('学习成绩排名证明',2,true),material('英语水平证明',1,true),material('身份证明',1,false),material('专家推荐信',1,false),material('科研/论文/项目证明',1,false),material('获奖证明',1,false),material('个人陈述/研究计划',1,false),material('其他补充材料',1,false)
  ];}
  function material(title,level=1,required=false){return {id:uid('mat'),title,level,required,include:true,files:[]};}
  function materialFromNoticeItem(item){
    return {id:uid('mat'),title:String(item?.title||item?.raw_text||'未命名材料').trim(),level:Number(item?.level)||1,required:item?.required!==false,include:item?.include!==false,rawText:item?.raw_text||'',files:[]};
  }
  function structuredMaterials(seed={}){
    const items=seed.materialItems||seed.noticeMaterialItems||[];
    return Array.isArray(items)&&items.length?items.map(materialFromNoticeItem):null;
  }
  function newProject(seed={}){
    const route=seed.route||'预推免',school=seed.school||'',college=seed.college||'',year=Number(seed.year)||currentYear();
    const importedMaterials=seed.materials?clone(seed.materials):structuredMaterials(seed);
    return {
      id:uid('project'),name:seed.name||`${school||'未命名院校'} ${route}申请材料`,sourceNoticeId:seed.sourceNoticeId||'',noticeImported:Boolean(seed.sourceNoticeId),
      school,college,route,year,degree:seed.degree||'',sourceScope:seed.sourceScope||'',materialConfidence:seed.materialConfidence||'',publishedAt:seed.publishedAt||'',deadline:seed.deadline||'',sourceUrl:seed.sourceUrl||'',noticeMaterials:seed.noticeMaterials||'',noticeMaterialItems:clone(seed.materialItems||seed.noticeMaterialItems||[]),
      coverTitle:seed.coverTitle||'',headerText:seed.headerText||`${school}${college}${route}
申请材料`,sizeLimitMb:Number(seed.sizeLimitMb)||20,pageMode:'fit',
      includeCover:true,includeToc:true,includeHeader:true,includePageNumbers:true,logoPreset:'generic',logoPath:'../assets/logos/generic-university.svg',logoDataUrl:'',
      profile:clone(seed.profile||profileDefault),materials:importedMaterials||defaultMaterials(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    };
  }
  function loadState(){
    try{state.projects=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');}catch{state.projects=[];}
    state.activeId=localStorage.getItem(ACTIVE_KEY)||state.projects[0]?.id||null;
    if(!state.projects.length){const p=newProject();state.projects=[p];state.activeId=p.id;saveNow();}
    if(!state.projects.some(p=>p.id===state.activeId))state.activeId=state.projects[0].id;
  }
  function saveNow(){const p=activeProject();if(p)p.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(state.projects));localStorage.setItem(ACTIVE_KEY,state.activeId||'');}
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,180);}
  function activeProject(){return state.projects.find(p=>p.id===state.activeId)||state.projects[0];}
  function selectProject(id){state.activeId=id;saveNow();renderAll();}

  function renderProjectSelect(){const sel=$('#projectSelect');sel.innerHTML=state.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===state.activeId?'selected':''}>${esc(p.name)}</option>`).join('');}
  function bindForms(){
    $$('[data-project]').forEach(el=>{
      el.addEventListener(el.type==='checkbox'?'change':'input',()=>{const p=activeProject(),key=el.dataset.project;p[key]=el.type==='checkbox'?el.checked:(el.type==='number'?Number(el.value):el.value);if(key==='school'||key==='college'||key==='route')autoFillHeader(p);scheduleSave();renderStats();validateProject();});
      if(el.tagName==='SELECT')el.addEventListener('change',()=>{const p=activeProject(),key=el.dataset.project;p[key]=el.value;scheduleSave();renderStats();validateProject();});
    });
    $$('[data-profile]').forEach(el=>el.addEventListener('input',()=>{activeProject().profile[el.dataset.profile]=el.value;scheduleSave();validateProject();}));
  }
  function populateForms(){
    const p=activeProject();
    $$('[data-project]').forEach(el=>{const v=p[el.dataset.project];if(el.type==='checkbox')el.checked=Boolean(v);else el.value=v??'';});
    $$('[data-profile]').forEach(el=>el.value=p.profile?.[el.dataset.profile]??'');
    const importedCount=(p.noticeMaterialItems||[]).length;$('#noticeState').textContent=p.noticeImported?(importedCount>=3?`已从院系通知导入 · ${importedCount}项材料`:'旧/校级通知项目 · 材料未锁定'):'手动项目';
    $('#openNoticeLink').href=p.sourceUrl||'#';$('#openNoticeLink').style.visibility=p.sourceUrl?'visible':'hidden';
    $('#logoPreset').value=p.logoPreset||'custom';renderLogoPreview();
  }
  function autoFillHeader(p){if(!p.headerText||/申请材料$/.test(p.headerText.replace(/\n/g,'')))p.headerText=`${p.school||''}${p.college||''}${p.route||''}\n申请材料`;}

  function numbering(materials){let main=0,sub=0;return materials.map(m=>{if(Number(m.level)===2){if(!main)main=1;sub++;return `${main}.${sub}`;}main++;sub=0;return String(main);});}
  function renderMaterials(){
    const p=activeProject(),list=$('#materialList'),nums=numbering(p.materials||[]);list.innerHTML='';
    (p.materials||[]).forEach((m,i)=>{
      const card=document.createElement('article');card.className=`material-card level-${m.level}`;card.draggable=true;card.dataset.id=m.id;
      const totalPages=(m.files||[]).reduce((s,f)=>s+(Number(f.pages)||1),0);const totalSize=(m.files||[]).reduce((s,f)=>s+(Number(f.size)||0),0);
      card.innerHTML=`
        <div class="drag-handle" title="拖拽排序">${esc(nums[i])}</div>
        <div class="material-main">
          <div class="material-title-row"><input class="material-title" value="${esc(m.title)}" aria-label="材料名称"></div>
          <div class="material-meta">
            <select class="level-select"><option value="1" ${m.level===1?'selected':''}>一级目录</option><option value="2" ${m.level===2?'selected':''}>二级目录</option></select>
            <select class="required-select"><option value="required" ${m.required?'selected':''}>必交</option><option value="optional" ${!m.required?'selected':''}>选交</option></select>
            <label class="check-row"><input class="include-toggle" type="checkbox" ${m.include?'checked':''}>合并</label>
            <span class="material-chip ${m.files?.length?'ok':(m.required?'warn':'')}">${m.files?.length?`${m.files.length} 个文件 · ${totalPages} 页 · ${PdfBuilder.formatBytes(totalSize)}`:(m.required?'待上传':'未上传')}</span>
          </div>
        </div>
        <div class="material-files">
          <label class="upload-zone">上传 PDF / JPG / PNG<input class="file-input" type="file" accept="application/pdf,image/png,image/jpeg" multiple hidden></label>
          <div class="file-list">${(m.files||[]).map(f=>`<div class="file-row"><span class="file-name" title="${esc(f.name)}">${esc(f.name)}</span><span class="file-info">${esc(f.pages||1)} 页 · ${PdfBuilder.formatBytes(f.size)}</span><button class="icon-btn remove-file" data-file-id="${esc(f.id)}" type="button">删除</button></div>`).join('')}</div>
        </div>
        <div class="material-actions"><button class="move-up" type="button" title="上移">↑</button><button class="move-down" type="button" title="下移">↓</button><button class="duplicate" type="button" title="复制">⧉</button><button class="delete delete-material" type="button" title="删除材料">×</button></div>`;
      bindMaterialCard(card,m,i);list.appendChild(card);
    });
    $('#emptyMaterials').hidden=Boolean(p.materials?.length);initDrag();
  }
  function bindMaterialCard(card,m,index){
    card.querySelector('.material-title').addEventListener('input',e=>{m.title=e.target.value;scheduleSave();validateProject();});
    card.querySelector('.level-select').addEventListener('change',e=>{m.level=Number(e.target.value);scheduleSave();renderMaterials();});
    card.querySelector('.required-select').addEventListener('change',e=>{m.required=e.target.value==='required';scheduleSave();renderMaterials();renderStats();validateProject();});
    card.querySelector('.include-toggle').addEventListener('change',e=>{m.include=e.target.checked;scheduleSave();renderStats();validateProject();});
    card.querySelector('.file-input').addEventListener('change',e=>handleFiles(m,[...e.target.files]));
    card.querySelectorAll('.remove-file').forEach(b=>b.addEventListener('click',()=>removeFile(m,b.dataset.fileId)));
    card.querySelector('.move-up').addEventListener('click',()=>moveMaterial(index,-1));card.querySelector('.move-down').addEventListener('click',()=>moveMaterial(index,1));
    card.querySelector('.duplicate').addEventListener('click',()=>{const copy=clone(m);copy.id=uid('mat');copy.title=m.title+'（副本）';copy.files=[];activeProject().materials.splice(index+1,0,copy);scheduleSave();renderAll();});
    card.querySelector('.delete-material').addEventListener('click',()=>deleteMaterial(m));
  }
  function initDrag(){
    let dragged=null;
    $$('.material-card').forEach(card=>{
      card.addEventListener('dragstart',()=>{dragged=card;card.classList.add('dragging');});card.addEventListener('dragend',()=>{card.classList.remove('dragging');dragged=null;});
      card.addEventListener('dragover',e=>{e.preventDefault();if(!dragged||dragged===card)return;const box=card.getBoundingClientRect(),before=e.clientY<box.top+box.height/2;card.parentNode.insertBefore(dragged,before?card:card.nextSibling);});
      card.addEventListener('drop',()=>{const ids=$$('.material-card').map(x=>x.dataset.id),p=activeProject();p.materials=ids.map(id=>p.materials.find(m=>m.id===id));scheduleSave();renderMaterials();});
    });
  }
  function moveMaterial(i,delta){const p=activeProject(),j=i+delta;if(j<0||j>=p.materials.length)return;[p.materials[i],p.materials[j]]=[p.materials[j],p.materials[i]];scheduleSave();renderMaterials();}
  async function deleteMaterial(m){if(!confirm(`删除材料“${m.title}”及其本地文件？`))return;for(const f of m.files||[])await BuilderDB.deleteFile(f.id);const p=activeProject();p.materials=p.materials.filter(x=>x.id!==m.id);saveNow();renderAll();}

  async function readFileMeta(file){
    if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
      if(!window.PDFLib)throw new Error('PDF 组件未加载，暂时无法读取页数。');
      let doc;try{doc=await PDFLib.PDFDocument.load(await file.arrayBuffer(),{ignoreEncryption:false});}catch{throw new Error(`“${file.name}”无法读取，可能已加密或损坏。`);}return {pages:doc.getPageCount(),type:'application/pdf'};
    }
    if(/^image\/(png|jpeg)$/.test(file.type)||/\.(png|jpe?g)$/i.test(file.name))return {pages:1,type:file.type||(/png$/i.test(file.name)?'image/png':'image/jpeg')};
    throw new Error(`不支持“${file.name}”的格式，请先转换为 PDF/JPG/PNG。`);
  }
  async function handleFiles(m,files){
    if(!files.length)return;setBuildBusy(true,'正在读取上传文件……',5);
    try{
      for(let i=0;i<files.length;i++){
        const file=files[i],meta=await readFileMeta(file),id=uid('file');
        await BuilderDB.putFile({id,projectId:activeProject().id,materialId:m.id,name:file.name,type:meta.type,size:file.size,pages:meta.pages,blob:file,createdAt:new Date().toISOString()});
        m.files.push({id,name:file.name,type:meta.type,size:file.size,pages:meta.pages});setProgress(Math.round((i+1)/files.length*100),`已读取 ${i+1}/${files.length}`);
      }
      saveNow();renderAll();
    }catch(err){alert(err.message||err);}finally{setBuildBusy(false);}
  }
  async function removeFile(m,id){const f=m.files.find(x=>x.id===id);if(!f||!confirm(`删除文件“${f.name}”？`))return;await BuilderDB.deleteFile(id);m.files=m.files.filter(x=>x.id!==id);saveNow();renderAll();}

  function renderStats(){
    const p=activeProject(),all=(p.materials||[]).flatMap(m=>m.files||[]),size=all.reduce((s,f)=>s+(f.size||0),0),pages=(p.materials||[]).filter(m=>m.include).flatMap(m=>m.files||[]).reduce((s,f)=>s+(f.pages||1),0),required=(p.materials||[]).filter(m=>m.required),done=required.filter(m=>m.files?.length).length;
    $('#statUploaded').textContent=all.length;$('#statSize').textContent=PdfBuilder.formatBytes(size);$('#statPages').textContent=pages;$('#statRequired').textContent=`${done} / ${required.length}`;
  }
  function validateProject(){
    const p=activeProject(),items=[];const add=(type,text)=>items.push({type,text});
    if(!p.school)add('error','尚未填写申请学校。');if(!p.college)add('warn','尚未填写学院/研究所，封面和页眉可能不完整。');if(!p.profile?.name)add('error','尚未填写姓名。');if(!p.profile?.undergraduateSchool)add('error','尚未填写本科院校。');
    if(p.noticeImported){
      const exact=/具体通知/.test(String(p.sourceScope||'')),count=(p.noticeMaterialItems||[]).length;
      if(!exact||count<3)add('error','当前项目不是从院系/研究所具体通知的完整材料清单创建，禁止直接生成。请返回通知监控页选择“材料可生成”的具体通知。');
    }
    const included=(p.materials||[]).filter(m=>m.include);if(!included.length)add('error','没有选择任何需要合并的材料。');
    included.filter(m=>m.required&&!m.files?.length).forEach(m=>add('error',`必交材料“${m.title}”尚未上传。`));
    included.filter(m=>!m.title?.trim()).forEach(()=>add('error','存在未命名材料条目。'));
    const duplicate=included.map(m=>m.title.trim()).filter((v,i,a)=>v&&a.indexOf(v)!==i);if(duplicate.length)add('warn',`存在重名材料：${[...new Set(duplicate)].join('、')}。`);
    const totalSize=included.flatMap(m=>m.files||[]).reduce((s,f)=>s+(f.size||0),0),limit=(Number(p.sizeLimitMb)||0)*1024*1024;if(limit&&totalSize>limit)add('warn',`原始文件总大小 ${PdfBuilder.formatBytes(totalSize)} 已超过设置上限 ${p.sizeLimitMb} MB；最终 PDF 大小仍需生成后确认。`);
    if(p.includeCover&&!p.logoDataUrl&&!p.logoPath)add('warn','封面未设置院校徽标。');if(p.includeHeader&&!p.headerText?.trim())add('warn','已启用页眉，但页眉文字为空。');if(!window.PDFLib)add('error','PDF 组件尚未加载；请检查网络后刷新页面。');
    if(!items.length)add('ok','基础核验通过，可以生成 PDF。');
    const counts={error:items.filter(x=>x.type==='error').length,warn:items.filter(x=>x.type==='warn').length,ok:items.filter(x=>x.type==='ok').length};
    $('#validationSummary').innerHTML=`<span class="validation-badge ${counts.error?'error':'ok'}">错误 ${counts.error}</span><span class="validation-badge ${counts.warn?'warn':'ok'}">警告 ${counts.warn}</span><span class="validation-badge ok">${counts.error?'需要修正':'可生成'}</span>`;
    $('#validationList').innerHTML=items.map(x=>`<li class="${x.type}">${esc(x.text)}</li>`).join('');
    return {items,hasError:counts.error>0};
  }

  async function parseMaterialsFromNotice(replace=false){
    const p=activeProject(),raw=(p.noticeMaterials||'').trim();
    let found=(p.noticeMaterialItems||[]).map(materialFromNoticeItem);
    if(!found.length){
      if(!raw){alert('该项目没有院系具体材料清单。请返回通知监控页，选择已标记“材料可生成”的具体通知。');return;}
      const rules=[
        ['申请表/报名表',/(申请表|报名表|自述表)/],['个人简历',/(个人简历|简历)/],['个人陈述/自述',/(个人陈述|个人自述|自述)/],['研究计划',/(研究计划|科研计划|攻博计划)/],['成绩单',/(成绩单|学习成绩)/],['学习成绩排名证明',/(排名证明|专业排名|成绩排名)/],['推免资格/在读证明',/(推免资格|在读证明|学籍证明)/],['英语水平证明',/(英语|四级|六级|CET|雅思|托福)/i],['身份证明',/(身份证|学生证|证件)/],['专家推荐信',/(推荐信|专家推荐)/],['科研/论文/项目证明',/(论文|科研成果|学术成果|项目证明|专利)/],['获奖证明',/(获奖|奖学金|荣誉|竞赛证书)/],['思想政治/政审材料',/(思想政治|政审|现实表现)/],['其他补充材料',/(其他材料|补充材料)/]
      ];
      found=rules.filter(([,re])=>re.test(raw)).map(([title])=>material(title,1,!/其他|获奖|科研/.test(title)));
      if(!found.length){const chunks=raw.split(/[；;。\n]+/).map(x=>x.replace(/^\s*[（(]?\d+[）).、]?\s*/, '').trim()).filter(x=>x.length>=2&&x.length<=90).slice(0,20);chunks.forEach(x=>found.push(material(x,1,true)));}
    }
    if(!found.length){alert('没有识别出明确材料名称，请手动添加。');return;}
    if(replace||confirm(`识别出 ${found.length} 项材料。
“确定”替换当前清单；“取消”将识别结果追加到末尾。`)){
      for(const m of p.materials||[])for(const f of m.files||[])await BuilderDB.deleteFile(f.id);
      p.materials=found;
    }else{
      const old=new Set(p.materials.map(m=>m.title));p.materials.push(...found.filter(m=>!old.has(m.title)));
    }
    saveNow();renderAll();
  }

  async function loadLogos(){
    try{const r=await fetch('../assets/logos/manifest.json',{cache:'no-store'});const data=await r.json();state.logos=data.logos||[];}catch{state.logos=[{id:'generic',name:'通用院校徽标',path:'../assets/logos/generic-university.svg'}];}
    $('#logoPreset').innerHTML=state.logos.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')+'<option value="custom">自定义上传</option>';
  }
  function renderLogoPreview(){const p=activeProject(),src=p.logoDataUrl||p.logoPath||'';$('#logoPreview').innerHTML=src?`<img src="${esc(src)}" alt="院校徽标">`:'';}
  async function handleLogo(file){if(!file)return;if(!/^image\//.test(file.type)){alert('请选择图片文件。');return;}const reader=new FileReader();reader.onload=()=>{const p=activeProject();p.logoDataUrl=reader.result;p.logoPath='';p.logoPreset='custom';saveNow();populateForms();};reader.readAsDataURL(file);}

  function renderAll(){renderProjectSelect();populateForms();renderMaterials();renderStats();validateProject();}
  function setProgress(percent,text){$('#progressBar').style.width=`${percent}%`;$('#progressText').textContent=text||'';}
  function setBuildBusy(busy,text='正在处理……',percent=0){$('#progressShell').hidden=!busy;['#previewBtn','#buildBtn','#validateBtn'].forEach(s=>$(s).disabled=busy);if(busy)setProgress(percent,text);}
  async function buildPdf(download){
    const check=validateProject();if(check.hasError){alert('存在必须修正的错误，请先查看“生成前核验”。');return;}
    setBuildBusy(true,'准备生成 PDF',1);$('#buildResult').className='build-result';$('#buildResult').textContent='';
    try{
      const result=await PdfBuilder.buildApplicationPdf(clone(activeProject()),{download,onProgress:(n,t)=>setProgress(n,t)});
      if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(result.blob);$('#pdfPreview').src=previewUrl;$('#previewPlaceholder').hidden=true;
      const limit=(Number(activeProject().sizeLimitMb)||0)*1024*1024,over=limit&&result.size>limit;$('#buildResult').className=`build-result ${over?'error':'success'}`;$('#buildResult').textContent=`已生成：${result.filename}｜总页数 ${result.pageCount}｜正文 ${result.bodyPages} 页｜文件大小 ${result.formattedSize}${over?`，超过 ${activeProject().sizeLimitMb} MB 限制`:''}`;
    }catch(err){console.error(err);$('#buildResult').className='build-result error';$('#buildResult').textContent=err.message||String(err);alert(err.message||err);}finally{setBuildBusy(false);}
  }

  async function importNoticeFromQuery(){
    const params=new URLSearchParams(location.search),noticeId=params.get('noticeId');let seed=null;
    if(noticeId){
      try{
        const r=await fetch('../data/notices.json',{cache:'no-store'}),d=await r.json(),x=(d.notices||[]).find(v=>String(v.id)===String(noticeId));
        if(x)seed={
          sourceNoticeId:x.id,name:`${x.school}${x.college||''} ${x.route}${x.degree?`·${x.degree}`:''}申请材料`,school:x.school,college:x.college,route:x.route,degree:x.degree||'',year:d.meta?.admission_year||d.meta?.publish_year||currentYear(),publishedAt:x.published_at,deadline:x.deadline_display||x.deadline,sourceUrl:x.url,
          noticeMaterials:x.materials_text||x.materials||'',materialItems:x.material_items||[],sourceScope:x.source_scope||'',materialConfidence:x.material_confidence||'',profile:clone(profileDefault)
        };
      }catch(err){console.warn('通知数据读取失败',err);}
    }else if(params.get('school'))seed={sourceNoticeId:params.get('sourceId')||uid('static'),name:`${params.get('school')||''}${params.get('college')||''} ${params.get('route')||'预推免'}申请材料`,school:params.get('school')||'',college:params.get('college')||'',route:params.get('route')||'预推免',year:Number(params.get('year'))||currentYear(),publishedAt:params.get('publishedAt')||'',deadline:params.get('deadline')||'',sourceUrl:params.get('sourceUrl')||'',noticeMaterials:params.get('materials')||'',profile:clone(profileDefault)};
    if(!seed)return;

    const existing=state.projects.find(p=>p.sourceNoticeId===seed.sourceNoticeId);
    if(existing){
      const hasUploaded=(existing.materials||[]).some(m=>m.files?.length);
      Object.assign(existing,{name:seed.name,school:seed.school,college:seed.college,route:seed.route,degree:seed.degree||'',year:seed.year,publishedAt:seed.publishedAt||'',deadline:seed.deadline||'',sourceUrl:seed.sourceUrl||'',noticeMaterials:seed.noticeMaterials||'',noticeMaterialItems:clone(seed.materialItems||[]),sourceScope:seed.sourceScope||'',materialConfidence:seed.materialConfidence||'',noticeImported:true});
      const incoming=structuredMaterials(seed)||[];
      if(incoming.length){
        if(!hasUploaded){existing.materials=incoming;}
        else{
          const oldTitles=new Set((existing.materials||[]).map(m=>m.title));
          existing.materials.push(...incoming.filter(m=>!oldTitles.has(m.title)));
        }
      }
      state.activeId=existing.id;saveNow();history.replaceState({},'',location.pathname);renderAll();return;
    }

    const p=newProject(seed);state.projects.push(p);state.activeId=p.id;
    if(!(seed.materialItems||[]).length&&p.noticeMaterials){p.materials=[];await parseMaterialsFromNotice(true);}
    saveNow();history.replaceState({},'',location.pathname);renderAll();
  }

  function exportProject(){const p=clone(activeProject());p.materials.forEach(m=>m.files=[]);const blob=new Blob([JSON.stringify({format:'baoyan-builder-project-v1',project:p},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=PdfBuilder.safeName(p.name)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function importProject(file){try{const d=JSON.parse(await file.text());const raw=d.project||d;if(!raw.id||!raw.materials)throw new Error('不是有效的项目配置。');raw.id=uid('project');raw.name=(raw.name||'导入项目')+'（导入）';raw.materials.forEach(m=>{m.id=uid('mat');m.files=[];});state.projects.push(raw);state.activeId=raw.id;saveNow();renderAll();}catch(err){alert(err.message||err);}}

  function bindButtons(){
    $('#projectSelect').addEventListener('change',e=>selectProject(e.target.value));
    $('#newProjectBtn').addEventListener('click',()=>{const p=newProject({profile:clone(activeProject().profile||profileDefault)});state.projects.push(p);selectProject(p.id);});
    $('#renameProjectBtn').addEventListener('click',()=>{const p=activeProject(),v=prompt('项目名称',p.name);if(v?.trim()){p.name=v.trim();saveNow();renderProjectSelect();}});
    $('#deleteProjectBtn').addEventListener('click',async()=>{if(state.projects.length===1){alert('至少保留一个项目。');return;}const p=activeProject();if(!confirm(`删除项目“${p.name}”及其全部本地文件？`))return;await BuilderDB.deleteProjectFiles(p.id);state.projects=state.projects.filter(x=>x.id!==p.id);state.activeId=state.projects[0].id;saveNow();renderAll();});
    $('#exportProjectBtn').addEventListener('click',exportProject);$('#importProjectInput').addEventListener('change',e=>{if(e.target.files[0])importProject(e.target.files[0]);e.target.value='';});
    $('#parseMaterialsBtn').addEventListener('click',()=>parseMaterialsFromNotice(false));
    $('#addMaterialBtn').addEventListener('click',()=>{activeProject().materials.push(material('新材料',1,false));saveNow();renderAll();});$('#addSubMaterialBtn').addEventListener('click',()=>{activeProject().materials.push(material('新子材料',2,false));saveNow();renderAll();});
    $('#validateBtn').addEventListener('click',validateProject);$('#previewBtn').addEventListener('click',()=>buildPdf(false));$('#buildBtn').addEventListener('click',()=>buildPdf(true));
    $('#logoPreset').addEventListener('change',e=>{const p=activeProject(),item=state.logos.find(x=>x.id===e.target.value);p.logoPreset=e.target.value;p.logoDataUrl='';p.logoPath=item?.path||'';saveNow();renderLogoPreview();});
    $('#logoInput').addEventListener('change',e=>{handleLogo(e.target.files[0]);e.target.value='';});$('#clearLogoBtn').addEventListener('click',()=>{const p=activeProject();p.logoDataUrl='';p.logoPath='';p.logoPreset='custom';saveNow();populateForms();});
  }

  async function init(){loadState();await loadLogos();bindForms();bindButtons();await BuilderDB.openDb();await importNoticeFromQuery();renderAll();window.addEventListener('beforeunload',saveNow);}
  document.addEventListener('DOMContentLoaded',init);
})();
