// console/page/01-shell.js —— 页面骨架：HTML/CSS + <script> 开头 + 共享运行时（$、state、el、api、card、render、save 等）
// 由 src/console/page.js 按固定顺序拼接进 PAGE；请勿单独运行。
// 注意：本文件里的 \\ 是原本就有的字面反斜杠，别再删。
export default `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<!-- 手机上打开控制台必需：没有它，移动端浏览器会按 980px 虚拟宽度渲染再整体缩小，
     结果字小到点不准、所有输入框都要精确戳。这条是「用手机管理」的前提。 -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>GrapeLeafi 控制台</title>
<style>
:root{--bg:#0f1115;--card:#171b22;--line:#262c36;--tx:#e6e9ef;--dim:#8b93a3;--acc:#4f8cff;--ok:#3ecf8e;--bad:#ff6b6b}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,"Segoe UI",sans-serif;background:var(--bg);color:var(--tx)}
header{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:50;background:var(--bg)}
header h1{font-size:17px;margin:0}
#status{font-size:12px;color:var(--dim)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--dim);margin-right:6px}
.dot.ok{background:var(--ok)}.dot.bad{background:var(--bad)}
nav{display:flex;gap:4px;padding:10px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap}
nav button{background:transparent;border:1px solid var(--line);color:var(--dim);padding:6px 14px;border-radius:8px;cursor:pointer;font-size:13px}
nav button.on{background:var(--acc);border-color:var(--acc);color:#fff}
main{padding:20px;display:flex;flex-direction:column;gap:14px;max-width:980px;margin:0 auto}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.card h2{margin:0 0 12px;font-size:14px;color:var(--dim);font-weight:600}
.row{display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap}
label{font-size:12px;color:var(--dim)}
input,textarea,select{background:#0d1015;border:1px solid var(--line);color:var(--tx);border-radius:8px;padding:7px 9px;font-size:13px}
input[type=text],input[type=number]{width:140px}
textarea{width:100%;min-height:80px;font-family:inherit;resize:vertical}
button.act{background:var(--acc);border:none;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px}
button.mini{background:#242a35;border:1px solid var(--line);color:var(--tx);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px}
button.danger{background:#3a2025;border-color:#5a3a41;color:var(--bad)}
pre{background:#0d1015;border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px;overflow:auto;max-height:280px;margin:0;white-space:pre-wrap;word-break:break-all}
table{border-collapse:collapse;width:100%;font-size:13px}
td,th{border:1px solid var(--line);padding:6px 8px;text-align:left}
th{color:var(--dim);font-weight:600;font-size:12px}
li{font-size:13px}
.card h2{cursor:pointer;user-select:none}
.card.folded>h2~*{display:none}
#saveStatus{font-size:12px;color:var(--dim);margin-left:auto}
.ph{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
.ph button{background:#242a35;border:1px solid var(--line);color:var(--acc);padding:1px 8px;border-radius:6px;cursor:pointer;font-size:12px}
.qtip{font-size:12px;color:var(--dim)}
#nav{position:sticky;top:0;z-index:40;background:var(--bg);border-bottom:1px solid var(--line)}
#nav button{padding:8px 16px;background:none;border:none;color:var(--dim);cursor:pointer;font-size:13px}
#nav button.on{color:var(--acc);border-bottom:2px solid var(--acc);font-weight:bold}
.pv{font-size:12px;color:var(--acc);background:#16202e;border:1px dashed #2f4360;padding:6px 10px;border-radius:6px;margin-top:6px}
.tag{font-size:11px;padding:1px 7px;border-radius:5px;border:1px solid var(--line);color:var(--dim);margin-left:8px;white-space:nowrap}
.tag.hot{border-color:#2f6b4f;color:var(--ok)}
.tag.restart{border-color:#6b532f;color:#e0a458}
.note{font-size:12px;color:var(--dim);margin:0 0 10px;line-height:1.7}
.note code{background:#0d1015;border:1px solid var(--line);border-radius:4px;padding:1px 5px;font-size:11px}
.secretr{display:flex;gap:6px;align-items:center}
.secretr input{flex:1;min-width:200px}
.warnbox{background:#2a1f16;border:1px solid #6b4a2f;color:#e0a458;border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.7;margin-bottom:10px}
.okbox{background:#16281f;border:1px solid #2f6b4f;color:var(--ok);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.7;margin-bottom:10px}
/* 手机访问助手：一条只读地址 + 一个复制按钮 */
.lanrow{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.lanrow input{flex:1;min-width:0;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.lanrow button{flex:0 0 auto}
/* 分类跳转栏：吸顶在 nav 下沿。top 由 JS 按 header+nav 的实际高度算（--sticky-top），避免写死数值 */
.jbar{position:sticky;top:var(--sticky-top,90px);z-index:30;display:flex;gap:6px;overflow-x:auto;padding:8px 0;background:var(--bg);border-bottom:1px solid var(--line);margin-bottom:2px;-webkit-overflow-scrolling:touch}
.jbar button{flex:0 0 auto;background:#242a35;border:1px solid var(--line);color:var(--dim);padding:4px 12px;border-radius:999px;cursor:pointer;font-size:12px;white-space:nowrap}
.jbar button:hover{color:var(--tx)}
.jbar button.on{background:var(--acc);border-color:var(--acc);color:#fff}
/* 被跳转到的分区高亮一下，点了能马上看出滚到哪了 */
.jbar-target{scroll-margin-top:calc(var(--sticky-top,90px) + 14px)}
.jbar-target.flash{animation:jflash 1.1s ease-out}
@keyframes jflash{0%{box-shadow:0 0 0 2px var(--acc)}100%{box-shadow:0 0 0 2px transparent}}
/* 手机适配。控制台本来是按桌面写的，窄屏下三个地方直接没法用：
   1) 没有 viewport（已在 head 里补上）；
   2) 宽表格（内置指令 8 列、定时任务 5 列）会被挤成每格几像素；
   3) 表单是 .row 横排 + 固定 px 宽度，窄屏下输入框溢出屏幕、点不到。
   这里不逐页改 DOM，用一条媒体查询统一兜住：
   表格给最小宽度并让所在卡片横向滚动（保住可读性），表单改成竖排整行铺满。 */
@media (max-width:760px){
  header{flex-wrap:wrap;gap:8px;padding:10px 12px}
  header h1{font-size:16px}
  #status{font-size:11px;width:100%}
  #saveStatus{margin-left:0;width:100%;font-size:11px}
  nav{padding:8px 12px}
  #nav button{padding:8px 12px}
  main{padding:12px}
  .card{padding:12px;overflow-x:auto;-webkit-overflow-scrolling:touch}
  /* 表格保持最小宽度，超出部分在卡片内横向滑动，而不是把字压扁 */
  table{min-width:520px}
  .row{flex-direction:column;align-items:stretch}
  .row>label{margin-bottom:2px}
  /* 复选框/单选框不能跟着铺满整行，否则点哪都是它；其余输入框一律整行铺满。
     用了 !important 是因为很多地方写了 style="width:340px" 这类行内宽度。 */
  input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea{width:100%!important;max-width:100%}
  textarea{min-height:96px}
  .secretr{flex-wrap:wrap}
  .secretr input{min-width:0}
  .lanrow{flex-direction:column;align-items:stretch}
  /* 手机上按钮要够大才好点 */
  button.act,button.mini,.ph button{padding:10px 14px;font-size:14px}
  nav button{padding:9px 14px}
  pre{max-height:200px}
}
</style>
</head>
<body>
<header><h1>GrapeLeafi 控制台</h1><span id="status">连接中…（若持续不动，请按 Ctrl+F5 强制刷新）</span><span id="saveStatus">自动保存开启：修改卡库/内容后停手 2.5 秒即自动保存生效</span><button class="act" id="saveNow" type="button">💾 立即保存</button></header>
<nav id="nav"></nav>
<main id="main"></main>
<script>
window.__CONSOLE_TOKEN__ = '';
// token 已经在服务端注入到 window.__CONSOLE_TOKEN__ 里了，地址栏上那个 ?token= 立刻没用了。
// 不清掉的话它会一直留在浏览器历史里（前进/后退、历史记录、书签都可能翻出来），
// 页面里 <img src="...&token=..."> 也会把它当 Referer 的一部分带出去。
// replaceState 不产生新历史条目，所以清掉不会让用户退不回上一页。
try{
  if(location.search.indexOf('token=')>=0){
    const u=new URL(location.href);
    u.searchParams.delete('token');
    history.replaceState(null,'',u.pathname+(u.search||'')+(u.hash||''));
  }
}catch(e){}
const $=s=>document.querySelector(s);
const state={content:null,__v:0,config:null};
let deletedIds=[];
let curTab='presets';
const NAV=['settings','presets','keywords','builtins','behavior','groups','risk','ai','anime','cards','lottery','birthdays','titles','schedule','state','help'];
  const NAVL={'settings':'设置','presets':'预设指令','keywords':'关键字回复','builtins':'内置指令','behavior':'回复设置','groups':'群门控','risk':'风控/节流','ai':'AI 设置','anime':'二次元图片','cards':'抽卡管理','lottery':'抽签图片','birthdays':'生日','titles':'葡家头衔','schedule':'定时提醒','state':'状态与日志','help':'说明书'};
  // el 不能直接用 Object.assign：dataset / style 在 HTMLElement 上是只有 getter 的访问器，
  // Object.assign 内部走 [[Set]](throw=true) 会直接抛
  // "Cannot set property dataset of #<HTMLElement> which has only a getter"，
  // 整个设置页渲染就断在这里。改成逐属性赋值，并对 dataset / style 对象做专门处理。
  const el=(tag,cls,attrs)=>{
    const n=document.createElement(tag);
    const a=attrs||{};
    // 第三参数传数组时表示「这些子节点」。
    // 以前这里直接 for(const k in a) n[k]=v，数组会走成 n["0"]=节点、
    // n["1"]=节点，节点从来没被插进 DOM，于是 el('div',null,[label,textarea])
    // 渲染成一个空 div——文案框看着像有、实际一个都不显示，还不报错。
    // 现在统一在这里处理，调用点不用改。
    if(Array.isArray(a)){
      for(const c of a)if(c)n.appendChild(c);
      if(cls)n.className=cls;
      return n;
    }
    for(const k in a){
      const v=a[k];
      if(k==='dataset'){if(v)for(const dk in v)n.dataset[dk]=v[dk];continue}
      if(k==='style'&&v&&typeof v==='object'){Object.assign(n.style,v);continue}
      n[k]=v;
    }
    if(cls)n.className=cls;
    return n;
  };
async function api(path,opts){opts=Object.assign({cache:'no-store'},opts||{});const headers=new Headers(opts.headers||{});if(window.__CONSOLE_TOKEN__)headers.set('x-console-token',window.__CONSOLE_TOKEN__);opts.headers=headers;const r=await fetch(path,opts);if(!r.ok){const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{};const err=new Error(j&&j.message?j.message:(t||r.status));err.status=r.status;err.data=j;throw err;}return r.json()}
  const $nav=$('#nav');
  // header 和 nav 是两个各自 sticky 的兄弟节点，都默认 top:0 会叠在一起
  // （header 的 z-index 50 还会把 nav 的 40 盖掉，滚动后 nav 就点不到了）。
  // 所以 sticky 偏移统一算出来：nav 停在 header 下沿，跳转栏再停在 nav 下沿。
  // 原来只在加载时算了一次：窄屏下 header 文字换行、变高，nav 的 top 就对不上了。
  function stickyBase(){
    const hd=$('header');
    return (hd?hd.offsetHeight:0)+($nav?$nav.offsetHeight:0);
  }
  function syncStickyTop(){
    const top=$('header');
    if(top)$nav.style.top=(top.offsetHeight||52)+'px';
    const base=stickyBase();
    // scroll-margin-top 也要跟着走：写死数值的话，窄屏下 header/nav 一变高，
    // 点跳转后分区标题就会被吸顶的三层盖住一截，看着像没跳准。
    const de=document.documentElement;
    if(de&&de.style&&de.style.setProperty)de.style.setProperty('--sticky-top',base+'px');
    for(const b of document.querySelectorAll('.jbar'))b.style.top=base+'px';
  }
  window.addEventListener('resize',syncStickyTop);
  // 页面内的「分类跳转栏」：吸顶一行小按钮，点了滚到对应分区。
  // items: [{id, label}]，id 要和目标分区的 DOM id 对上。
  // 顺便按滚动位置高亮当前所在分区，长页面滚到中间也不会不知道自己在哪一块。
  function jumpBar(items){
    if(!items||!items.length)return null;
    const bar=el('div','jbar');
    const btns=[];
    for(const it of items){
      const b=el('button',null,{textContent:it.label,type:'button',title:'跳到「'+it.label+'」'});
      b.onclick=()=>{
        const t=document.getElementById(it.id);
        if(!t)return;
        t.scrollIntoView({behavior:'smooth',block:'start'});
        for(const x of btns)x.classList.remove('on');
        b.classList.add('on');
        // 高亮一下目标：只 scrollIntoView 的话，分区顶部会被吸顶的 header/nav/jbar 盖住一截，
        // 看着像没跳准。scroll-margin-top 负责留白，这个闪一下只是让人确认落点。
        t.classList.remove('flash');
        void t.offsetWidth;
        t.classList.add('flash');
        setTimeout(()=>t.classList.remove('flash'),1200);
      };
      b._anchorId=it.id;
      btns.push(b);
      bar.appendChild(b);
    }
    // 目标都在 #main 里；重渲染后 #main 被清空，监听要跟着摘掉，否则会累积
    bar._onScroll=()=>{
      let cur=btns[0];
      const line=stickyBase()+24;
      for(const b of btns){
        const t=document.getElementById(b._anchorId);
        if(t&&t.getBoundingClientRect().top<=line)cur=b;
      }
      for(const b of btns)b.classList.toggle('on',b===cur);
    };
    window.addEventListener('scroll',bar._onScroll,{passive:true});
    bar._onResize=()=>{syncStickyTop();bar._onScroll()};
    window.addEventListener('resize',bar._onResize);
    bar._dispose=()=>{
      window.removeEventListener('scroll',bar._onScroll);
      window.removeEventListener('resize',bar._onResize);
    };
    // 这里必须直接给 bar 自己设 top：调用方拿到返回值之后才把它插进 DOM，
    // 而 syncStickyTop() 靠 querySelectorAll('.jbar') 找元素，那时候还找不到。
    // top 没设成的话 position:sticky 退化成 top:auto，整条栏完全不吸顶。
    bar.style.top=stickyBase()+'px';
    curJumpBar=bar;
    syncStickyTop();
    return bar;
  }
  // 每次重渲染 main 都会清空重建，上一页跳转栏挂的 scroll/resize 监听必须解绑，
  // 否则来回切几次 tab 就会累积一堆监听，滚动时越来越卡。
  let curJumpBar=null;
  // 给长页面的分区卡片挂锚点：id 供 jumpBar 跳转，jbar-target 负责留白+闪烁高亮
  function anchor(cd,id){
    if(cd&&id){cd.id=id;if(cd.classList)cd.classList.add('jbar-target')}
    return cd;
  }
  // 长页面统一入口：先收分区，最后在 main 最前面插跳转栏
  // （分区是自上往下追加的，等全部建完才知道有哪些，所以只能在最后插）
  function jumpBarFor(m,parts){
    const items=[];
    for(const p of parts){
      if(!p||!p.id)continue;
      items.push({id:p.id,label:p.label||p.title||p.id});
    }
    if(items.length<2)return;
    const jb=jumpBar(items);
    if(!jb)return;
    if(m&&m.insertBefore)m.insertBefore(jb,m.firstChild);
    else if(m&&m.append)m.append(jb);
  }
function renderNav(){const n=$('#nav');n.innerHTML='';for(const t of NAV){const b=el('button',t===curTab?'on':null,{textContent:NAVL[t]});b.onclick=()=>{curTab=t;render()};n.appendChild(b)}}
function statHtml(k,v){const n=el('div','row');n.append(el('label',null,{textContent:k}),el('input','',{type:'text',value:v,disabled:true}));return n}
function card(title,body){const c=el('div','card');c.append(el('h2',null,{textContent:title}),body);return c}
function identOf(e,kind){
  if(!e)return '';
  if(kind==='commands')return 'cmd:'+(e.name||'').trim();
  if(kind==='keywords')return 'kw:'+(e.match||'').trim()+'|'+(Array.isArray(e.groups)?e.groups:[]).join(',');
  if(kind==='schedule')return 'sch:'+(e.id||e.time||'');
  if(kind==='animeSources')return 'anime:'+(e.id||e.url||'').trim();
  return kind+':'+JSON.stringify(e);
}
async function refreshContent(){
  const d=await api('/api/content');
  state.content=d.content;
  state.__v=d.__v;
  // 内置指令分类表（服务端从 brain-registry 的 CMD_CATEGORY 下发）
  state.cmdCategory=d.cmdCategory||{};
  return d;
}
async function render(){
  renderNav();
  // 设置页只读写 config.json，不依赖 content.json。
  // 而且它在「配置坏了/内容读不出来」时恰恰是最需要能打开的页面（去修配置），
  // 所以这里不因 content 加载失败就把设置页也一起挡掉。
  const needsContent=curTab!=='settings';
  if(needsContent&&!state.content){
    try{
      await refreshContent();
    }catch(e){
      if(curTab==='settings'){
        renderTop();
        const m0=$('#main');m0.innerHTML='';
        try{await renderSettings(m0)}catch(e2){m0.append(el('pre',null,{textContent:'设置页渲染出错：'+e2.message}))}
        return;
      }
      $('#main').innerHTML='';
      $('#main').append(el('pre',null,{textContent:'无法读取配置：'+e.message+'\\n请确认客户端仍在运行，然后刷新本页。'}));
      return;
    }
  }
  renderTop();
  const m=$('#main');m.innerHTML='';
  if(curJumpBar){curJumpBar._dispose&&curJumpBar._dispose();curJumpBar=null}
  syncStickyTop();
  try{
  if(curTab==='settings')await renderSettings(m);
  if(curTab==='presets')renderPresets(m);
    if(curTab==='keywords')renderKeywords(m);
    if(curTab==='builtins')renderBuiltins(m);
    if(curTab==='behavior')renderBehavior(m);
    if(curTab==='groups')renderGroups(m);
    if(curTab==='risk')renderRisk(m);
    if(curTab==='ai')renderAi(m);
    if(curTab==='anime')renderAnime(m);
    if(curTab==='cards')renderCards(m);
    if(curTab==='lottery')renderLottery(m);
    if(curTab==='birthdays')renderBirthdays(m);
    if(curTab==='titles')renderTitles(m);
    if(curTab==='schedule')renderSchedule(m);
    if(curTab==='state')renderState(m);
    if(curTab==='help')renderHelp(m);
  }catch(e){
    m.append(el('pre',null,{textContent:'渲染出错：'+(e&&e.message?e.message:e)}));
  }
}
async function renderTop(){
  const s=$('#status');
  try{
    const st=await api('/api/status');
    s.innerHTML='<span class="dot '+(st.connected?'ok':'bad')+'"></span>'+'协议端:'+(st.connected?'已连接':'未连接')
      +' ｜ 已发:'+st.stats.sent+' 队列:'+(st.stats.queue||0)+' 发送中:'+(st.stats.sending||0)+' 丢弃:'+st.stats.dropped
      +' 今日:'+st.stats.daily+'/'+st.stats.dailyCap+' 惩罚:x'+st.stats.penalty
      +(st.stats.softMuteUntil>Date.now()?' ｜ 软静默ON('+Math.ceil((st.stats.softMuteUntil-Date.now())/1000)+'s)':'')
      +' ｜ 端口:'+st.port+' PID:'+st.pid+' 构建:'+st.build;
  }catch(e){
    s.innerHTML='<span class="dot bad"></span>控制台连接失败：'+e.message+'（客户端可能已退出，或本页是旧版本，请 Ctrl+F5 刷新）';
  }
}
async function postContent(){
  const d=await api('/api/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:state.content,__v:state.__v,deleted:deletedIds})});
  if(d&&typeof d.__v==='number')state.__v=d.__v;
  deletedIds=[];
  return d;
}
  // 保存统一交给右上角的「立即保存」（flushAll：内容 + 卡库一起存）和 2.5 秒自动保存。
  // 原来各页面底部还有一个「立即保存并重载」，它只调 postContent() 不存 cardsMeta——
  // 在抽卡管理页点它，卡库改动其实没落盘，比右上角那个还弱，属于反向误导，已整批删掉。
  let saveTimer=null;
const folded=new Set();
function nowStr(){const d=new Date();const p=(n)=>String(n).padStart(2,'0');return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())}
// 复制一段文本到剪贴板。
// 手机通过局域网 IP 打开控制台时页面是 http，navigator.clipboard 在非安全上下文里
// 通常是 undefined（就算存在，writeText 也会被拒），所以必须留 execCommand 兜底；
// 再兜不住就把按钮文案改成「请长按复制」，别静默失败让人以为复制好了。
function copyText(text,btn){
  const done=function(ok){
    if(!btn)return;
    if(!btn.dataset.oldText)btn.dataset.oldText=btn.textContent;
    btn.textContent=ok?'已复制 ✓':'请长按上方文本复制';
    if(btn._ct)clearTimeout(btn._ct);
    btn._ct=setTimeout(function(){btn.textContent=btn.dataset.oldText||'复制'},1800);
  };
  const fallback=function(){
    let ok=false;
    try{
      const ta=el('textarea',null,{value:text});
      ta.setAttribute('readonly','');
      ta.style.position='fixed';ta.style.left='-9999px';ta.style.top='0';
      document.body.appendChild(ta);
      ta.select();
      try{ok=document.execCommand('copy')}catch(e){ok=false}
      document.body.removeChild(ta);
    }catch(e){ok=false}
    done(ok);
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){done(true)},fallback);
    return;
  }
  fallback();
}
function setSaveStatus(t){const el=$('#saveStatus');if(el)el.textContent=t}
async function flushAll(){
  if(state.content)await postContent();
  if(state.cardsMeta){
    await api('/api/cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({meta:state.cardsMeta})});
  }
}
async function doSave(){
  if(!state.content)return;
  try{
    await flushAll();
    setSaveStatus('已保存 '+nowStr());
  }catch(e){setSaveStatus('保存失败: '+(e.message||''))}
}
(function(){
  const b=document.getElementById('saveNow');
  if(b){
    b.onclick=function(){
      setSaveStatus('保存中…');
      flushAll().then(function(){setSaveStatus('已保存 '+nowStr())},function(e){setSaveStatus('保存失败: '+(e.message||''))});
    };
  }
})();
function scheduleSave(){
  clearTimeout(saveTimer);
  setSaveStatus('…编辑中，2.5 秒后自动保存');
  saveTimer=setTimeout(doSave,2500);
}
document.addEventListener('input',(e)=>{const t=e.target;if(t&&!t.closest('[data-nosave]'))scheduleSave()},true);
document.addEventListener('change',(e)=>{const t=e.target;if(t&&!t.closest('[data-nosave]'))scheduleSave()},true);
document.addEventListener('visibilitychange',async()=>{
  if(document.visibilityState!=='visible'||!state.content)return;
  try{
    const d=await api('/api/content');
    if(d.__v===state.__v)return;
    state.content=d.content;state.__v=d.__v;
    render();
    setSaveStatus('检测到配置已被其他窗口或群内指令更新，已刷新为最新');
  }catch(e){}
});
function foldCard(cd,i,toggle){
  if(toggle){
    if(folded.has(i))folded.delete(i);else folded.add(i);
  }
  if(folded.has(i)){
    cd.classList.add('folded');
    cd.querySelector('h2').textContent='▸ '+cd.querySelector('h2').textContent.replace(/^[▸▾] /,'');
  }else{
    cd.classList.remove('folded');
    cd.querySelector('h2').textContent='▾ '+cd.querySelector('h2').textContent.replace(/^[▸▾] /,'');
  }
}
`;
