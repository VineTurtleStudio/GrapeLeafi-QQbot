// console/page/06-tabs-cards.js —— 抽奖池与卡包编辑器 tab：含 esc/selOpts 与卡包内卡面、概率、作品、角色编辑器
// 由 src/console/page.js 按固定顺序拼接进 PAGE；请勿单独运行。
// 注意：本文件里的 \\ 是原本就有的字面反斜杠，别再删。
export default `function renderLottery(m){
  const lot=state.content.lottery;
  const w=el('div');
  const r=el('div','row');r.append(el('label',null,{textContent:'图片目录（F 盘抽签图）'}));
  const dir=el('input','',{type:'text',value:lot.dir,style:'width:520px'});dir.oninput=()=>lot.dir=dir.value;
  const info=el('pre',null);
  const scan=el('button','mini',{textContent:'扫描预览'});
  scan.onclick=async()=>{const d=await api('/api/lottery?dir='+encodeURIComponent(lot.dir));info.textContent=d.length?('共 '+d.length+' 张：\\n'+d.map(x=>x.name+(x.level?' ['+x.level+']':'')).join('\\n')):'该目录下没有找到图片';};
  w.append(r,dir,el('div','row',{}),scan,info);
  m.append(card('抽签图片',w));
}
const CRARE=['SSR','SR','R','N'];
const DEFAULT_RATES={work:{ssr:0.03,sr:0.12,r:0.3,ssrPity:90,srPity:10},char:{ssr:0.05,sr:0.15,r:0.3,ssrPity:40,srPity:10}};
let cardsScan={};
let cardsTblRefresh={};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function selOpts(list,cur){var s='';for(var i=0;i<list.length;i++){var v=list[i];s+='<option value="'+esc(v)+'"'+(String(v)===String(cur)?' selected':'')+'>'+esc(v)+'</option>';}return s}
async function renderCards(m){
  if(!state.cardsMeta){
    try{
      const d=await api('/api/cards');
      state.cardsMeta=d.meta;
      cardsScan={};
    }catch(e){m.append(el('pre',null,{textContent:'读取卡库失败：'+e.message}));return;}
  }
  const meta=state.cardsMeta;
  const saveNote=el('span','qtip',{textContent:''});
  const gw=el('div');
  const dec=meta.decay||(meta.decay={});
  const drow=el('div','row');
  for(let i=0;i<CRARE.length;i++){
    const r=CRARE[i];
    const inp=el('input','',{type:'number',value:(dec[r]!=null?dec[r]:''),style:'width:80px'});
    inp.oninput=(function(rr){return function(){if(inp.value==='')delete dec[rr];else dec[rr]=Number(inp.value)}})(r);
    drow.append(el('label',null,{textContent:r+' 分解返还(光玉)'}),inp);
  }
  drow.append(el('span','qtip',{textContent:'（空=用默认 N1/R5/SR20/SSR50）'}));
  const ex=meta.exchange||(meta.exchange={});
  const exin=el('input','',{type:'number',value:(ex.rate!=null?ex.rate:1),style:'width:80px'});
  exin.oninput=function(){ex.rate=exin.value?Number(exin.value):1};
  const exr=el('div','row');
  exr.append(el('label',null,{textContent:'积分 → 光玉兑换倍率'}),exin);
  gw.append(drow,exr);
  const tool=el('div','row');
  const save=el('button','act',{textContent:'保存卡库并生效'});
  save.onclick=async function(){
    saveNote.textContent='保存中…';
    try{
      await api('/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({meta:meta})});
      saveNote.textContent='已保存并热生效';
      cardsScan={};
    }catch(e){saveNote.textContent='保存失败：'+e.message;}
  };
  const reload=el('button','mini',{textContent:'放弃修改(重读)'});
  reload.onclick=async function(){
    try{const d=await api('/api/cards');state.cardsMeta=d.meta;cardsScan={};saveNote.textContent='已重新读取';render();}
    catch(e){saveNote.textContent='读取失败：'+e.message;}
  };
  tool.append(save,reload,saveNote);
  const sec=[];
  const gcard=anchor(card('全局设置（所有卡包通用）',gw),'cardglobal');
  sec.push(gcard);
  // 原来写的是 el('div',null,{},tool)：el(tag,cls,attrs) 只有三个参数，
  // 第四个参数会被直接丢掉，tool 里装着的「保存 / 放弃修改 / 保存状态」三个节点
  // 一个都没进页面——抽卡管理页看上去就没有保存按钮（实际靠右上角全局保存兜住了，
  // 所以不容易发现）。tool 本身已经是 div.row，直接 append 就行。
  m.append(gcard,tool);
  if(!Array.isArray(meta.packs))meta.packs=[];
  for(let i=0;i<meta.packs.length;i++){
    const cd=packCardUI(meta,i);
    sec.push(anchor(cd,'pack'+i));
    m.append(cd);
  }
  const ncard=anchor(newPackUI(meta),'cardnew');
  sec.push(ncard);
  m.append(ncard);
  jumpBarFor(m,sec.map((cd,i)=>({id:cd.id,label:i===0?'全局设置':(i===sec.length-1?'新增卡包':(meta.packs[i-1].name||meta.packs[i-1].id))})));
}
function newPackUI(meta){
  const w=el('div');
  const row=el('div','row');
  const id=el('input','',{type:'text',placeholder:'id(英文小写，如 abow)',style:'width:140px'});
  const name=el('input','',{type:'text',placeholder:'名称(如 ABOW)',style:'width:140px'});
  const com=el('input','',{type:'text',placeholder:'公社/公司(如 Key)',style:'width:110px'});
  const root=el('input','',{type:'text',placeholder:'素材根目录(绝对路径)',style:'width:360px'});
  const add=el('button','act',{textContent:'+ 创建卡包'});
  add.onclick=function(){
    const pid=String(id.value||'').trim();
    if(!pid){alert('需要填写卡包 id');return;}
    if(meta.packs.some(function(p){return p.id===pid})){alert('卡包 id 已存在：'+pid);return;}
    const pk={id:pid,name:name.value||pid,com:com.value||'',assetRoot:root.value||'',currencyName:'光玉',price:5,works:{},characters:{},cards:{}};
    meta.packs.push(pk);
    render();
  };
  row.append(el('label',null,{textContent:'新增卡包：'}),id,name,com,root,add);
  w.append(row,el('p','qtip',{textContent:'创建后展开该卡包完善信息：填包名/公社/素材路径，用「扫描」把卡号并入卡库，再补 作品、角色、稀有度。'}));
  return card('卡包管理',w);
}
function packCardUI(meta,pi){
  const pack=meta.packs[pi];
  const body=el('div');
  const counts=el('p','qtip',{textContent:'作品 '+Object.keys(pack.works||{}).length+' ｜ 角色 '+Object.keys(pack.characters||{}).length+' ｜ 卡牌 '+Object.keys(pack.cards||{}).length+' 张'});
  const nrow=el('div','row');const nm=el('input','',{type:'text',value:pack.name||'',style:'width:160px'});nm.oninput=function(){pack.name=nm.value;updateTitle()};
  const crow=el('div','row');const cm=el('input','',{type:'text',value:pack.com||'',style:'width:160px'});cm.oninput=function(){pack.com=cm.value;updateTitle()};
  const rrow=el('div','row');const rt=el('input','',{type:'text',value:pack.assetRoot||'',style:'width:480px'});rt.oninput=function(){pack.assetRoot=rt.value};
  const c1=el('input','',{type:'text',value:pack.currencyName||'光玉',style:'width:90px'});c1.oninput=function(){pack.currencyName=c1.value};
  const p1=el('input','',{type:'number',value:pack.price!=null?pack.price:5,style:'width:80px'});p1.oninput=function(){pack.price=p1.value?Number(p1.value):5};
  const c1r=el('div','row');c1r.append(el('label',null,{textContent:'货币名'}),c1,el('label',null,{textContent:'单抽价'}),p1);
  const del=el('button','mini danger',{textContent:'删除卡包'});
  del.onclick=function(){if(meta.packs.length<=1){alert('至少保留一个卡包');return;}if(!confirm('删除卡包 '+pack.id+'？（卡牌数据会一并删除）'))return;meta.packs.splice(pi,1);render()};
  nrow.append(el('label',null,{textContent:'包名'}),nm);
  crow.append(el('label',null,{textContent:'公社'}),cm,del);
  rrow.append(el('label',null,{textContent:'素材路径'}),rt);
  body.append(counts,nrow,crow,rrow,c1r);
  body.append(renderRatesUI(pack));
  body.append(scanUI(meta,pi,pack,counts));
  body.append(renderWorksUI(pack));
  body.append(renderCharsUI(pack));
  const tbl=el('div');
  body.append(el('h3',null,{style:'margin:8px 0 2px',textContent:'卡牌管理（数据库在线编辑）'}));
  body.append(renderCardsTbl(meta,pi,pack,tbl));
  const box=el('div','card');
  box.append(el('h2',null,{textContent:'卡包 '+pack.id+' ｜ '+pack.name+' ｜ '+pack.com}),body);
  function updateTitle(){box.querySelector('h2').textContent='卡包 '+pack.id+' ｜ '+pack.name+' ｜ '+pack.com}
  return box;
}
function rateInput(pack,kind,field,curDef){
  const rates=pack.rates||(pack.rates={});
  const rk=rates[kind]||(rates[kind]={});
  const inp=el('input','',{type:'number',step:'any',value:(rk[field]!=null?rk[field]:''),style:'width:74px'});
  inp.oninput=function(){if(inp.value===''||inp.value==null)delete rk[field];else rk[field]=Number(inp.value)};
  inp.title='默认 '+(curDef!=null?curDef:'');
  return inp;
}
function renderRatesUI(pack){
  const w=el('div');
  w.append(el('p','qtip',{textContent:'保底/概率覆盖（留空=默认；作品池 SSR 3%·10 连保底 SR·90 连保底 SSR｜角色池 SSR 5%·40 连保底 SSR）'}));
  const line=el('div','row');
  line.append(el('label',null,{textContent:'作品池'}),rateInput(pack,'work','ssr',0.03),el('label',null,{textContent:'ssr'}),rateInput(pack,'work','sr',0.12),el('label',null,{textContent:'sr'}),rateInput(pack,'work','r',0.3),el('label',null,{textContent:'r'}),rateInput(pack,'work','srPity',10),el('label',null,{textContent:'sr保'}),rateInput(pack,'work','ssrPity',90),el('label',null,{textContent:'ssr保'}));
  const line2=el('div','row');
  line2.append(el('label',null,{textContent:'角色池'}),rateInput(pack,'char','ssr',0.05),el('label',null,{textContent:'ssr'}),rateInput(pack,'char','sr',0.15),el('label',null,{textContent:'sr'}),rateInput(pack,'char','r',0.3),el('label',null,{textContent:'r'}),rateInput(pack,'char','srPity',10),el('label',null,{textContent:'sr保'}),rateInput(pack,'char','ssrPity',40),el('label',null,{textContent:'ssr保'}));
  w.append(line,line2);
  return card('概率与保底',w);
}
function renderWorksUI(pack){
  const w=el('div');
  const rows=el('div');
  Object.keys(pack.works||{}).forEach(function(k){
    const wr=el('div','row');
    wr.append(el('label',null,{textContent:k}));
    const nm=el('input','',{type:'text',value:(pack.works[k].name||''),style:'width:160px'});nm.oninput=function(){pack.works[k].name=nm.value};
    const al=el('input','',{type:'text',value:((pack.works[k].aliases||[]).join(',')),style:'width:200px',placeholder:'别名(逗号分隔)'});al.oninput=function(){pack.works[k].aliases=al.value.split(',').map(function(s){return s.trim()}).filter(Boolean)};
    wr.append(el('label',null,{textContent:'名称'}),nm,el('label',null,{textContent:'别名'}),al);
    rows.append(wr);
  });
  const add=el('div','row');
  const k2=el('input','',{type:'text',placeholder:'key(如 sp)',style:'width:100px'});
  const n2=el('input','',{type:'text',placeholder:'作品名',style:'width:160px'});
  const btn=el('button','mini',{textContent:'+ 作品'});
  btn.onclick=function(){
    const k=String(k2.value||'').trim();if(!k){alert('需要作品 key');return;}
    const ws=pack.works||(pack.works={});
    if(ws[k]){alert('已存在 '+k);return;}
    ws[k]={name:n2.value||k,aliases:[]};
    render();
  };
  add.append(el('label',null,{textContent:'新增'}),k2,n2,btn);
  w.append(rows,add);
  return card('作品（卡池）',w);
}
function renderCharsUI(pack){
  const w=el('div');
  const rows=el('div');
  Object.keys(pack.characters||{}).forEach(function(k){
    const cr=el('div','row');
    cr.append(el('label',null,{textContent:k}));
    const nm=el('input','',{type:'text',value:(pack.characters[k].name||''),style:'width:120px'});nm.oninput=function(){pack.characters[k].name=nm.value};
    const en=el('input','',{type:'text',value:(pack.characters[k].en||''),style:'width:120px'});en.oninput=function(){pack.characters[k].en=en.value};
    const wk=el('input','',{type:'text',value:(pack.characters[k].work||''),style:'width:80px',placeholder:'作品key'});wk.oninput=function(){pack.characters[k].work=wk.value};
    const al=el('input','',{type:'text',value:((pack.characters[k].aliases||[]).join(',')),style:'width:150px',placeholder:'别名'});al.oninput=function(){pack.characters[k].aliases=al.value.split(',').map(function(s){return s.trim()}).filter(Boolean)};
    cr.append(el('label',null,{textContent:'名'}),nm,el('label',null,{textContent:'en'}),en,el('label',null,{textContent:'作品'}),wk,el('label',null,{textContent:'别名'}),al);
    rows.append(cr);
  });
  const add=el('div','row');
  const k2=el('input','',{type:'text',placeholder:'key(如 sp)!',style:'width:110px'});
  const n2=el('input','',{type:'text',placeholder:'角色名',style:'width:120px'});
  const wk2=el('input','',{type:'text',placeholder:'作品key',style:'width:90px'});
  const btn=el('button','mini',{textContent:'+ 角色'});
  btn.onclick=function(){
    const k=String(k2.value||'').trim();if(!k){alert('需要角色 key');return;}
    const cs=pack.characters||(pack.characters={});
    if(cs[k]){alert('已存在 '+k);return;}
    cs[k]={name:n2.value||k,work:wk2.value||'',aliases:[]};
    render();
  };
  add.append(el('label',null,{textContent:'新增'}),k2,n2,wk2,btn);
  w.append(rows,add);
  return card('角色',w);
}
function scanUI(meta,pi,pack,countsEl){
  const w=el('div');
  w.append(el('p','qtip',{textContent:'素材分三类图（在素材根的 Icon / Card / Detail 子目录，编号 001~999）：Icon=抽卡结算小图，Card=卡面原图，Detail=卡牌详情大图。'}));
  const row=el('div','row');
  const root=el('input','',{type:'text',value:pack.assetRoot||'',style:'width:420px',placeholder:'素材根目录（留空则图鉴与出图不可用）'});
  const scan=el('button','mini',{textContent:'开始扫描'});
  row.append(root,scan);
  const pills=el('div','row');
  function pill(label){
    const p=el('span',null,{style:'font-size:12px;padding:4px 10px;border-radius:8px;border:1px solid var(--line);background:#0d1015;color:var(--dim)'});
    p.textContent=label+'：未扫描';
    pills.appendChild(p);
    return p;
  }
  const ic=pill('Icon 结算小图'),cd=pill('Card 卡面原图'),dt=pill('Detail 详情大图');
  function up(p,label,st2){
    p.textContent=label+'：'+(st2&&st2.files?st2.dirs+' 个目录 / '+st2.files+' 张':'未找到该目录');
    p.style.color=(st2&&st2.files)?'var(--ok)':'var(--bad)';
  }
  const info=el('p','qtip',{textContent:'点「开始扫描」识别三大类里编号一致的卡，再把新卡并入「卡牌表」，去卡牌表补 角色 与 稀有度。'});
  const bill=el('button','mini',{textContent:'并入卡牌表'});
  bill.disabled=true;
  bill.onclick=function(){
    const sc=cardsScan[pi];if(!sc||!sc.cards)return;
    const ws=pack.works||{};const fw=Object.keys(ws)[0]||'';
    const cards=pack.cards||(pack.cards={});
    let added=0;
    sc.cards.forEach(function(s){
      if(!cards[s.id]){cards[s.id]={character:'',work:fw,rarity:'N'};added++;}
    });
    info.textContent='已并入 '+added+' 张新卡。现在到下方「卡牌表」给它们选 角色 与 稀有度（可批量设置）。';
    bill.disabled=true;
    if(countsEl)countsEl.textContent='作品 '+Object.keys(pack.works||{}).length+' ｜ 角色 '+Object.keys(pack.characters||{}).length+' ｜ 卡牌 '+Object.keys(pack.cards||{}).length+' 张';
    const rf=cardsTblRefresh[pack.id];if(typeof rf==='function')rf();
  };
  scan.onclick=async function(){
    try{
      const d=await api('/api/cards/scan?root='+encodeURIComponent(root.value||''));
      if(!d.ok){info.textContent=d.error||'扫描失败';return;}
      cardsScan[pi]=d;
      const st=d.stats||{};
      up(ic,'Icon 结算小图',st.icon);
      up(cd,'Card 卡面原图',st.card);
      up(dt,'Detail 详情大图',st.detail);
      const cards=pack.cards||{};
      let inDb=0,missing=0;
      d.cards.forEach(function(s){if(cards[s.id])inDb++;else missing++;});
      info.textContent='识别到 '+d.count+' 张编号卡：卡库已有 '+inDb+' 张，新发现 '+missing+' 张。';
      if(missing>0){bill.disabled=false;bill.textContent='把 '+missing+' 张新卡并入卡牌表';}
      else{bill.disabled=true;bill.textContent='卡库已包含全部识别到的卡';}
    }catch(e){info.textContent='扫描失败：'+e.message;}
  };
  const actRow=el('div','row');
  actRow.append(bill,info);
  w.append(row,pills,actRow);
  return card('素材扫描',w);
}
function renderCardsTbl(meta,pi,pack,tblBox){
  const w=el('div');
  const PER=60;
  let page=1;
  const f=el('div','row');
  const fr=el('select',null);
  const fa=['','SSR','SR','R','N'];
  fa.forEach(function(v){fr.append(el('option',null,{value:v,textContent:v||'稀有度(全部)'}))});
  const fc=el('select',null);
  const ca=[''];
  Object.keys(pack.characters||{}).forEach(function(k){ca.push(k)});
  ca.forEach(function(v){fc.append(el('option',null,{value:v,textContent:v||'角色(全部)'}))});
  const fq=el('input','',{type:'text',placeholder:'号码/区间 如 001-050',style:'width:150px'});
  const fg=el('button','mini',{textContent:'筛选'});
  const bulkSel=el('select',null);
  const bOpts=['N','R','SR','SSR'];
  bOpts.forEach(function(v){bulkSel.append(el('option',null,{value:v,textContent:v}))});
  const bulk=el('button','mini',{textContent:'批量把筛选结果设为'});
  const box=el('div',null,{style:'max-height:560px;overflow:auto;border:1px solid var(--line);border-radius:8px'});
  const nav=el('div','row');
  const info=el('span','qtip',{textContent:''});
  f.append(fr,fc,fq,fg,el('span','qtip',{textContent:'批量：'}),bulkSel,bulk,info);
  function assetUrl(id,kind){return '/api/cards/asset?token='+encodeURIComponent(window.__CONSOLE_TOKEN__||'')+'&root='+encodeURIComponent(pack.assetRoot||'')+'&id='+encodeURIComponent(id)+'&kind='+(kind||'icon');}
  function ids(){
    const cards=pack.cards||{};
    const ra=fr.value,ca2=fc.value,q=String(fq.value||'').trim();
    let lo=null,hi=null;
    if(q){
      const m=/^(\\d{1,3})\\s*-\\s*(\\d{1,3})$/.exec(q);
      if(m){lo=Number(m[1]);hi=Number(m[2]);}
      else if(/^\\d{1,3}$/.test(q)){lo=Number(q);hi=Number(q);}
    }
    return Object.keys(cards).filter(function(id){
      const c=cards[id];
      if(ra&&String((c.rarity||'N').toUpperCase())!==ra)return false;
      if(ca2&&String(c.character||'')!==ca2)return false;
      const n=Number(id);
      if(q&&!isNaN(n)){if(lo!=null&&n<lo)return false;if(hi!=null&&n>hi)return false;}
      else if(q&&!String(id).includes(q))return false;
      return true;
    }).sort(function(a,b){return Number(a)-Number(b)});
  }
  function refresh(){
    const list=ids();
    const total=list.length;
    const pages=Math.max(1,Math.ceil(total/PER));
    if(page<1)page=1;
    if(page>pages)page=pages;
    const slice=list.slice((page-1)*PER,page*PER);
    let rows='';
    slice.forEach(function(id){
      const c=pack.cards[id];
      rows+='<tr><td>'+esc(id)+'</td><td><img data-img="'+esc(id)+'" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:6px;background:#10141c"></td>'
        +'<td><select data-cc="'+esc(id)+'">'+selOpts(ca,c.character||'')+'</select></td>'
        +'<td><select data-rr="'+esc(id)+'">'+selOpts(bOpts,(c.rarity||'N'))+'</select></td>'
        +'<td><button class="mini" data-view="'+esc(id)+'">预览 / 编辑</button></td></tr>';
    });
    box.innerHTML=rows?'<table class="ctbl"><tr><th>卡号</th><th>卡面</th><th>角色</th><th>稀有度</th><th></th></tr>'+rows+'</table>':'<p class="qtip">没有匹配的卡。</p>';
    Array.prototype.forEach.call(box.querySelectorAll('img[data-img]'),function(im){
      im.src=assetUrl(im.getAttribute('data-img'),'icon');
      im.onerror=function(){im.removeAttribute('src');im.title='素材缺失';};
    });
    box.onchange=function(e){
      const t=e.target;
      if(!t||!t.tagName||t.tagName!=='SELECT')return;
      const id=String(t.getAttribute('data-cc')||t.getAttribute('data-rr')||'');
      if(!id||!pack.cards[id])return;
      if(t.hasAttribute('data-cc'))pack.cards[id].character=t.value;
      if(t.hasAttribute('data-rr'))pack.cards[id].rarity=t.value;
    };
    box.onclick=function(e){
      const b=e.target;
      if(!b||!b.getAttribute)return;
      const id=b.getAttribute('data-view');
      if(id)openCardEditor(meta,pi,pack,id);
    };
    info.textContent='筛选结果 '+total+' 张（每页 '+PER+'）';
    nav.innerHTML='';
    function navBtn(label,fn,dis){
      const b=el('button','mini',{textContent:label});
      if(dis)b.disabled=true;
      b.onclick=fn;
      nav.appendChild(b);
    }
    navBtn('‹ 上页',function(){page-=1;refresh()},page<=1);
    nav.appendChild(el('span','qtip',{textContent:'  第 '+page+'/'+pages+' 页  '}));
    navBtn('下页 ›',function(){page+=1;refresh()},page>=pages);
  }
  cardsTblRefresh[pack.id]=refresh;
  fr.onchange=function(){page=1;refresh()};
  fc.onchange=function(){page=1;refresh()};
  fg.onclick=function(){page=1;refresh()};
  bulk.onclick=function(){
    const list=ids();
    if(!list.length){alert('当前筛选没有卡');return;}
    list.forEach(function(id){pack.cards[id].rarity=bulkSel.value});
    refresh();
  };
  w.append(f,box,nav);
  refresh();
  tblBox.innerHTML='';
  tblBox.append(w);
  return w;
}
function openCardEditor(meta,pi,pack,id){
  const c=pack.cards[id];
  if(!c)return;
  const root=pack.assetRoot||'';
  const ov=el('div',null,{style:'position:fixed;inset:0;background:rgba(5,8,16,.62);z-index:300;display:flex;align-items:center;justify-content:center;padding:12px'});
  const bx=el('div',null,{style:'background:var(--card);border:1px solid var(--line);border-radius:14px;max-width:880px;width:96%;max-height:94vh;overflow:auto;padding:18px'});
  const h=el('div','row');
  const close=el('button','mini danger',{textContent:'关闭'});
  close.onclick=function(){ov.remove()};
  h.append(el('b',null,{textContent:'卡牌详情 · 卡号 '+id+' ｜ '+pack.name+'/'+pack.id}),close);
  bx.appendChild(h);
  const imgs=el('div','row');
  const kinds=[['icon','Icon 结算小图'],['card','Card 卡面原图'],['detail','Detail 详情大图']];
  kinds.forEach(function(k){
    const cell=el('div',null,{style:'flex:1;min-width:140px'});
    cell.appendChild(el('div','qtip',{textContent:k[1]}));
    const im=el('div',null,{style:'aspect-ratio:3/4;display:flex;align-items:center;justify-content:center;background:#10141c;border-radius:10px;overflow:hidden;border:1px solid var(--line)'});
    const img=el('img','',{style:'max-width:100%;max-height:100%;object-fit:contain'});
    const miss=el('div','qtip',{textContent:'（素材缺失）'});
    miss.style.display='none';
    im.appendChild(img);im.appendChild(miss);
    img.onerror=function(){img.style.display='none';miss.style.display='';};
    img.src='/api/cards/asset?token='+encodeURIComponent(window.__CONSOLE_TOKEN__||'')+'&root='+encodeURIComponent(root)+'&id='+encodeURIComponent(id)+'&kind='+k[0];
    cell.appendChild(im);
    imgs.appendChild(cell);
  });
  bx.appendChild(imgs);
  const fields=el('div','row');
  const charSel=el('select',null);
  const caL=[''].concat(Object.keys(pack.characters||{}));
  caL.forEach(function(v){charSel.append(el('option',null,{value:v,textContent:v||'(未分配)'}))});
  charSel.value=c.character||'';
  const rarSel=el('select',null);
  ['N','R','SR','SSR'].forEach(function(v){rarSel.append(el('option',null,{value:v,textContent:v}))});
  rarSel.value=(c.rarity||'N');
  const workIn=el('input','',{type:'text',value:c.work||'',style:'width:100px',placeholder:'作品key'});
  fields.append(el('label',null,{textContent:'角色'}),charSel,el('label',null,{textContent:'稀有度'}),rarSel,el('label',null,{textContent:'作品'}),workIn);
  bx.appendChild(fields);
  bx.appendChild(el('div','qtip',{textContent:'素材根目录：'+(root||'(未设置)')+' ｜ 素材文件按「范围目录/编号」自动查找（Icon: {id}i.*、Card: {id}.*、Detail: {id}d.*）。'}));
  const sb=el('div','row');
  const save=el('button','act',{textContent:'保存此卡修改'});
  save.onclick=function(){
    c.character=charSel.value;
    c.rarity=rarSel.value;
    c.work=String(workIn.value||'').trim();
    ov.remove();
    const rf=cardsTblRefresh[pack.id];if(typeof rf==='function')rf();
    scheduleSave();
  };
  sb.appendChild(save);
  bx.appendChild(sb);
  ov.appendChild(bx);
  document.body.appendChild(ov);
  ov.onclick=function(e){if(e.target===ov)ov.remove()};
}
`;
