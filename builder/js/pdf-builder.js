(function(){
  const A4=[595.28,841.89];
  const CANVAS_W=1240;
  const CANVAS_H=Math.round(CANVAS_W*A4[1]/A4[0]);
  const BODY_TOP=116;
  const BODY_BOTTOM=62;
  const BODY_SIDE=48;

  function ensurePdfLib(){
    if(!window.PDFLib)throw new Error('PDF 组件未加载。请确认网络可访问 jsDelivr，或稍后重试。');
    return window.PDFLib;
  }
  const waitFrame=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  function safeName(s){return String(s||'').replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,' ').trim()||'申请材料';}
  function formatBytes(n){if(!Number.isFinite(n))return '—';if(n<1024)return n+' B';if(n<1024**2)return (n/1024).toFixed(1)+' KB';return (n/1024**2).toFixed(2)+' MB';}
  function createCanvas(){const c=document.createElement('canvas');c.width=CANVAS_W;c.height=CANVAS_H;return c;}
  function wrapText(ctx,text,maxWidth){
    const lines=[];let line='';
    for(const ch of String(text||'')){
      const test=line+ch;
      if(line&&ctx.measureText(test).width>maxWidth){lines.push(line);line=ch;}else line=test;
    }
    if(line)lines.push(line);return lines;
  }
  function drawCenteredLines(ctx,lines,y,lineHeight){for(const line of lines){ctx.fillText(line,CANVAS_W/2,y);y+=lineHeight;}return y;}
  function loadImage(src){return new Promise((resolve,reject)=>{if(!src){resolve(null);return;}const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('徽标图片读取失败'));img.src=src;});}
  function dataUrlToBytes(dataUrl){const b64=dataUrl.split(',')[1];const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return arr;}

  async function renderCover(project){
    const c=createCanvas(),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
    ctx.textAlign='center';ctx.textBaseline='alphabetic';
    const logo=await loadImage(project.logoDataUrl||project.logoPath||'');
    if(logo){const max=540,ratio=Math.min(max/logo.width,max/logo.height);const w=logo.width*ratio,h=logo.height*ratio;ctx.drawImage(logo,(CANVAS_W-w)/2,105,w,h);}
    const school=project.school||'申请院校';const college=project.college||'';
    const title=project.coverTitle?.trim()||`${school}${college}\n${project.route||'夏令营'}申请材料`;
    const titleLines=String(title).split(/\n+/).flatMap(v=>{ctx.font='700 48px "Microsoft YaHei","PingFang SC",sans-serif';return wrapText(ctx,v,980)});
    ctx.fillStyle='#101b1a';ctx.font='700 48px "Microsoft YaHei","PingFang SC",sans-serif';
    let y=logo?720:430;y=drawCenteredLines(ctx,titleLines,y,66);
    const info=[['姓　　名',project.profile?.name],['本科院校',project.profile?.undergraduateSchool],['本科专业',project.profile?.undergraduateMajor],['申请方向',project.profile?.targetMajor],['联系电话',project.profile?.phone]];
    if(project.profile?.email)info.push(['电子邮箱',project.profile.email]);
    y=Math.max(y+100,1040);ctx.font='400 28px "Songti SC","SimSun",serif';ctx.textAlign='left';
    const labelX=380,valueX=610,lineW=330;
    for(const [label,value] of info){ctx.fillStyle='#3e4847';ctx.fillText(`${label}：`,labelX,y);ctx.fillStyle='#151c1b';ctx.fillText(value||'',valueX,y);ctx.strokeStyle='#616b69';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(valueX-10,y+10);ctx.lineTo(valueX+lineW,y+10);ctx.stroke();y+=68;}
    ctx.textAlign='center';ctx.fillStyle='#8a9693';ctx.font='400 20px "Microsoft YaHei",sans-serif';ctx.fillText(`${project.year||new Date().getFullYear()} · ${project.route||'申请材料'}`,CANVAS_W/2,CANVAS_H-70);
    return c.toDataURL('image/png');
  }

  function makeTocEntries(materials){
    let page=1;const entries=[];
    for(const m of materials){
      const count=(m.files||[]).reduce((s,f)=>s+(Number(f.pages)||1),0);
      if(!m.include||count<=0)continue;
      entries.push({id:m.id,title:m.title||'未命名材料',level:Number(m.level)||1,page,count,contentIndex:page-1});
      page+=count;
    }
    return entries;
  }

  function tocPageCapacity(){return 24;}
  function renderTocPages(project,entries){
    const chunks=[];const cap=tocPageCapacity();for(let i=0;i<entries.length;i+=cap)chunks.push(entries.slice(i,i+cap));if(!chunks.length)chunks.push([]);
    return chunks.map((chunk,pageIdx)=>{
      const c=createCanvas(),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.textBaseline='middle';
      ctx.fillStyle='#173f38';ctx.textAlign='center';ctx.font='700 54px "Microsoft YaHei",sans-serif';ctx.fillText('目录',CANVAS_W/2,150);
      ctx.font='400 22px "Microsoft YaHei",sans-serif';ctx.fillStyle='#83908d';ctx.fillText(`${project.school||''}${project.college||''}${project.route||''}申请材料`,CANVAS_W/2,205);
      ctx.strokeStyle='#b8c6c0';ctx.beginPath();ctx.moveTo(110,250);ctx.lineTo(CANVAS_W-110,250);ctx.stroke();
      const links=[];let y=310;const rowH=58;
      chunk.forEach(e=>{
        const indent=e.level===2?70:0;ctx.textAlign='left';ctx.font=`${e.level===1?'700':'400'} 27px "Microsoft YaHei",sans-serif`;ctx.fillStyle=e.level===1?'#173f38':'#3d5550';
        const maxTitle=760-indent;let title=e.title;while(title.length>2&&ctx.measureText(title).width>maxTitle)title=title.slice(0,-1);if(title!==e.title)title=title.slice(0,-1)+'…';
        const x=150+indent;ctx.fillText(title,x,y);const titleW=ctx.measureText(title).width;
        ctx.strokeStyle='#9daaa7';ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(x+titleW+16,y+4);ctx.lineTo(CANVAS_W-180,y+4);ctx.stroke();ctx.setLineDash([]);
        ctx.textAlign='right';ctx.fillStyle='#173f38';ctx.font='700 26px "Microsoft YaHei",sans-serif';ctx.fillText(String(e.page),CANVAS_W-125,y);
        links.push({x:x-6,y:y-rowH/2+4,w:CANVAS_W-x-95,h:rowH-8,targetContentIndex:e.contentIndex,title:e.title,level:e.level});
        y+=rowH;
      });
      ctx.textAlign='center';ctx.fillStyle='#9aa6a3';ctx.font='400 18px sans-serif';ctx.fillText(`目录 ${pageIdx+1} / ${chunks.length}`,CANVAS_W/2,CANVAS_H-55);
      return {dataUrl:c.toDataURL('image/png'),links};
    });
  }

  function renderHeaderOverlay(project,pageNumber){
    const c=createCanvas(),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#777f7d';ctx.font='400 27px "Microsoft YaHei","PingFang SC",sans-serif';
    const lines=String(project.headerText||'').split(/\n+/).filter(Boolean).slice(0,2);
    if(project.includeHeader&&lines.length){const start=lines.length===1?54:38;lines.forEach((line,i)=>ctx.fillText(line,c.width/2,start+i*36));ctx.strokeStyle='#b3bab8';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(34,105);ctx.lineTo(c.width-34,105);ctx.stroke();}
    if(project.includePageNumbers){ctx.fillStyle='#1d2927';ctx.font='400 24px "Times New Roman",serif';ctx.fillText(String(pageNumber),c.width/2,c.height-35);}
    return c.toDataURL('image/png');
  }

  function fitRect(srcW,srcH,dstX,dstY,dstW,dstH){const s=Math.min(dstW/srcW,dstH/srcH);return {x:dstX+(dstW-srcW*s)/2,y:dstY+(dstH-srcH*s)/2,w:srcW*s,h:srcH*s};}

  async function addLinkAnnotation(pdfDoc,page,rect,targetPage){
    try{
      const {PDFName}=ensurePdfLib();const ctx=pdfDoc.context;
      const dest=ctx.obj([targetPage.ref,PDFName.of('Fit')]);
      const ann=ctx.register(ctx.obj({Type:PDFName.of('Annot'),Subtype:PDFName.of('Link'),Rect:[rect.x,rect.y,rect.x+rect.w,rect.y+rect.h],Border:[0,0,0],Dest:dest}));
      let annots=page.node.get(PDFName.of('Annots'));
      if(!annots){annots=ctx.obj([]);page.node.set(PDFName.of('Annots'),annots);}
      annots.push(ann);
    }catch(err){console.warn('目录链接写入失败',err);}
  }

  function addOutlines(pdfDoc,outlineEntries,physicalOffset){
    try{
      const {PDFName,PDFHexString}=ensurePdfLib();const ctx=pdfDoc.context;const pages=pdfDoc.getPages();if(!outlineEntries.length)return;
      const root=ctx.obj({Type:PDFName.of('Outlines')});const rootRef=ctx.register(root);const items=[];
      outlineEntries.forEach(e=>{const target=pages[physicalOffset+e.contentIndex];if(!target)return;const dest=ctx.obj([target.ref,PDFName.of('Fit')]);const dict=ctx.obj({Title:PDFHexString.fromText(e.title),Parent:rootRef,Dest:dest});const ref=ctx.register(dict);items.push({dict,ref});});
      items.forEach((it,i)=>{if(i>0)it.dict.set(PDFName.of('Prev'),items[i-1].ref);if(i<items.length-1)it.dict.set(PDFName.of('Next'),items[i+1].ref);});
      if(items.length){root.set(PDFName.of('First'),items[0].ref);root.set(PDFName.of('Last'),items[items.length-1].ref);root.set(PDFName.of('Count'),ctx.obj(items.length));pdfDoc.catalog.set(PDFName.of('Outlines'),rootRef);pdfDoc.catalog.set(PDFName.of('PageMode'),PDFName.of('UseOutlines'));}
    }catch(err){console.warn('PDF书签写入失败，已跳过',err);}
  }

  async function materialFileRecords(project){
    const records=[];
    for(const material of project.materials||[]){
      if(!material.include)continue;
      for(const meta of material.files||[]){
        const rec=await window.BuilderDB.getFile(meta.id);if(!rec)throw new Error(`文件“${meta.name}”在浏览器本地存储中不存在，请重新上传。`);records.push({material,meta,rec});
      }
    }
    return records;
  }

  async function buildApplicationPdf(project,{download=false,onProgress=()=>{}}={}){
    const {PDFDocument}=ensurePdfLib();onProgress(2,'读取项目配置');await waitFrame();
    const out=await PDFDocument.create();out.setTitle(`${project.school||''}${project.route||''}申请材料`);out.setAuthor(project.profile?.name||'');out.setSubject('保研申请材料');out.setCreator('BAOYAN GALAXY PDF Builder');
    const records=await materialFileRecords(project);const materials=(project.materials||[]).filter(m=>m.include);const tocEntries=makeTocEntries(materials);const tocPages=project.includeToc?renderTocPages(project,tocEntries):[];
    let coverCount=0;if(project.includeCover){onProgress(5,'生成封面');const coverUrl=await renderCover(project);const img=await out.embedPng(dataUrlToBytes(coverUrl));const p=out.addPage(A4);p.drawImage(img,{x:0,y:0,width:A4[0],height:A4[1]});coverCount=1;}
    const tocPdfPages=[];if(project.includeToc){onProgress(8,'生成目录');for(const t of tocPages){const img=await out.embedPng(dataUrlToBytes(t.dataUrl));const p=out.addPage(A4);p.drawImage(img,{x:0,y:0,width:A4[0],height:A4[1]});tocPdfPages.push(p);}}
    const physicalOffset=coverCount+tocPdfPages.length;let bodyNumber=0;let processed=0;const total=Math.max(records.reduce((s,r)=>s+(r.meta.pages||1),0),1);
    for(const entry of records){
      const blob=entry.rec.blob;const type=entry.meta.type||blob.type||'';
      if(type==='application/pdf'||entry.meta.name.toLowerCase().endsWith('.pdf')){
        let src;try{src=await PDFDocument.load(await blob.arrayBuffer(),{ignoreEncryption:false});}catch(err){throw new Error(`无法读取 PDF“${entry.meta.name}”：文件可能损坏或已加密。`);}
        const count=src.getPageCount();
        for(let i=0;i<count;i++){
          bodyNumber++;const srcPage=src.getPage(i);const sw=srcPage.getWidth(),sh=srcPage.getHeight();let page,draw;
          if(project.pageMode==='preserve'){
            page=out.addPage([sw,sh]);const embedded=await out.embedPage(srcPage);draw={x:0,y:0,width:sw,height:sh};page.drawPage(embedded,draw);
          }else{
            page=out.addPage(A4);const embedded=await out.embedPage(srcPage);const r=fitRect(sw,sh,BODY_SIDE,BODY_BOTTOM,A4[0]-BODY_SIDE*2,A4[1]-BODY_TOP-BODY_BOTTOM);page.drawPage(embedded,{x:r.x,y:r.y,width:r.w,height:r.h});
          }
          if(project.includeHeader||project.includePageNumbers){const ov=renderHeaderOverlay(project,bodyNumber);const oi=await out.embedPng(dataUrlToBytes(ov));const [pw,ph]=page.getSize();page.drawImage(oi,{x:0,y:0,width:pw,height:ph});}
          processed++;onProgress(10+Math.round(processed/total*78),`处理 ${entry.meta.name} · ${i+1}/${count}`);if(processed%3===0)await waitFrame();
        }
      }else if(/^image\//.test(type)||/\.(png|jpe?g|webp)$/i.test(entry.meta.name)){
        bodyNumber++;const bytes=new Uint8Array(await blob.arrayBuffer());let image;
        if(type.includes('png')||entry.meta.name.toLowerCase().endsWith('.png'))image=await out.embedPng(bytes);else image=await out.embedJpg(bytes);
        const page=out.addPage(A4);const r=fitRect(image.width,image.height,BODY_SIDE,BODY_BOTTOM,A4[0]-BODY_SIDE*2,A4[1]-BODY_TOP-BODY_BOTTOM);page.drawImage(image,{x:r.x,y:r.y,width:r.w,height:r.h});
        if(project.includeHeader||project.includePageNumbers){const ov=renderHeaderOverlay(project,bodyNumber);const oi=await out.embedPng(dataUrlToBytes(ov));page.drawImage(oi,{x:0,y:0,width:A4[0],height:A4[1]});}
        processed++;onProgress(10+Math.round(processed/total*78),`处理 ${entry.meta.name}`);await waitFrame();
      }else throw new Error(`暂不支持文件“${entry.meta.name}”的格式。请转换为 PDF/JPG/PNG 后上传。`);
    }
    if(project.includeToc){onProgress(90,'写入目录跳转');const finalPages=out.getPages();tocPages.forEach((t,ti)=>{const tocPage=tocPdfPages[ti];t.links.forEach(link=>{const target=finalPages[physicalOffset+link.targetContentIndex];if(!target)return;const sx=A4[0]/CANVAS_W,sy=A4[1]/CANVAS_H;addLinkAnnotation(out,tocPage,{x:link.x*sx,y:A4[1]-(link.y+link.h)*sy,w:link.w*sx,h:link.h*sy},target);});});addOutlines(out,tocEntries,physicalOffset);}
    onProgress(95,'写入 PDF 文件');const bytes=await out.save({useObjectStreams:true,addDefaultPage:false});const blob=new Blob([bytes],{type:'application/pdf'});const filename=safeName(`${project.year||''}_${project.school||''}${project.college||''}_${project.profile?.name||''}_${project.route||''}申请材料`)+'.pdf';
    if(download){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
    onProgress(100,'生成完成');return {bytes,blob,filename,pageCount:out.getPageCount(),bodyPages:bodyNumber,tocPages:tocPdfPages.length,size:blob.size,formattedSize:formatBytes(blob.size)};
  }

  window.PdfBuilder={buildApplicationPdf,formatBytes,makeTocEntries,safeName};
})();
