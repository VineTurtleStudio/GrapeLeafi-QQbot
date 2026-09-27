// console/page/08-tabs-misc.js —— 生日 / 定时提醒 / 运行状态 tab + 页面尾部闭合标签与 render() 首次调用
// 由 src/console/page.js 按固定顺序拼接进 PAGE；请勿单独运行。
// 编号 08：这个分片带着 </script></body></html> 收尾，必须排在最后；
// 它前面曾经叫 07-tabs-misc.js，内置指令页拆出去以后才改成 08，别再按旧名字找。
// 注意：本文件里的 \\ 是原本就有的字面反斜杠，别再删。
export default `// ——— 生日条目管理 ———
// 内置 Key 社生日一上来就有 136 条（src/birthdays.js 的 RAW）。原来是一条一个 div.card 全铺开，
// 页面能拉到几千行高，想找「CLANNAD 里 7 月的」只能 Ctrl+F 硬翻。
// 这里改成和抽卡管理一致的做法：搜索 + 筛选 + 排序 + 分页 + 滚动区 + 批量操作，另外支持粘贴批量导入。
const BD_PER=60;
// 校验并归一 MM-DD。比后端 birthdays.js 的 validateBirthdayDate 多查了「每月真实天数」：
// 导入是批量场景，02-30、04-31 这种笔误必须当场挑出来，不能混进去等推送那天才发现。
function bdNormDate(s){
  const m=/^(\\d{1,2})-(\\d{1,2})$/.exec(String(s==null?'':s).trim());
  if(!m)return null;
  const mo=Number(m[1]),d=Number(m[2]);
  if(mo<1||mo>12)return null;
  const dim=[31,29,31,30,31,30,31,31,30,31,30,31][mo-1];
  if(d<1||d>dim)return null;
  return String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
// 解析一行导入文本。刻意不从「名字 日期 作品」按固定列去切，而是先在整行里找日期：
// 日文/中文名里本身带空格（「霧島 聖」「西园美鸟」），按空格切列会把名字切碎。
function bdParseLine(line){
  const s=String(line||'').trim();
  if(!s)return {ok:false,why:'空行'};
  if(s[0]==='#'||/^\\/\\//.test(s))return {ok:false,why:'注释行'};
  // 全写日期 2001-12-24：先摘掉，避免被后面的 MM-DD 规则从中间截成「11-05」
  // 注意要取「月-日」而不是「年-月」：full[2]/full[3] 才是月和日。
  // 写成 full[1]+'-'+full[2] 会把 2001-03-30 变成 2001-03，
  // 后面再按 MM-DD 匹配就从「2001-03」里截出 01-03，
  // 结果是日期错、名字还被吃成「西园美鸟 20」——错得毫无提示。
  let work=s;
  const full=/[,，\\t\\s]*(\\d{4})-(\\d{1,2})-(\\d{1,2})\\s*/.exec(work);
  if(full){
    work=work.replace(full[0],' '+full[2]+'-'+full[3]+' ');
  }
  const m=/^(.*?)[\\s,，、\\t]*(\\d{1,2})\\s*-\\s*(\\d{1,2})[\\s,，、\\t]*(.*)$/.exec(work);
  if(!m)return {ok:false,why:'没找到 MM-DD 日期'};
  const name=String(m[1]||'').trim();
  const date=bdNormDate(m[2]+'-'+m[3]);
  const series=String(m[4]||'').trim();
  if(!name)return {ok:false,why:'日期前面没有名字'};
  if(!date)return {ok:false,why:'日期「'+m[2]+'-'+m[3]+'」不存在（月份或天数非法）'};
  return {ok:true,name,date,series};
}
// 筛出当前要显示的条目。搜索同时匹配名字和作品——找「Summer Pockets 的角色」时很常用。
function bdFilter(items,f){
  const q=String(f.q||'').trim().toLowerCase();
  const kind=f.kind||'';
  return items.filter(function(it){
    if(kind==='builtin'&&!it.builtin)return false;
    if(kind==='custom'&&it.builtin)return false;
    if(q){
      const hay=((it.name||'')+' '+(it.series||'')).toLowerCase();
      if(hay.indexOf(q)<0)return false;
    }
    return true;
  });
}
function bdSort(list,by){
  const arr=list.slice();
  if(by==='name')arr.sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''),'zh')});
  else if(by==='series')arr.sort(function(a,b){return String(a.series||'').localeCompare(String(b.series||''),'zh')||String(a.date||'').localeCompare(String(b.date||''))});
  else arr.sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'zh')});
  return arr;
}
function renderBirthdayItems(bd,m){
  if(!Array.isArray(bd.items))bd.items=[];
  const items=bd.items;

  // ---- 批量导入 ----
  const iw=el('div');
  const ta=el('textarea',null);
  ta.placeholder='一行一条，名字/日期/作品之间用空格、逗号或制表符隔开都行：\\n古河 渚 12-24 CLANNAD\\n藤川 みあ,04-02,LOOPERS\\n西园美鸟 03-30 Little Busters!\\n（也认 2001-12-24 这种全写日期，会自动取 MM-DD）';
  ta.style.minHeight='104px';
  const info=el('div','qtip');
  const badBox=el('div');
  const impBtn=el('button','mini',{textContent:'确认导入'});
  impBtn.disabled=true;
  const parseBtn=el('button','mini',{textContent:'解析并预览'});
  const fileIn=el('input','',{type:'file',accept:'.txt,text/plain'});
  fileIn.style.display='none';
  let parsed=[];
  // 同名同日期只留一条。内置里已有的（霧島 聖 01-03）也算在内，
  // 否则主人粘贴一整份名单下来，会得到 136 条内置 + 一堆重复项，推送时同一天连着念两遍。
  function keyOf(name,date){return String(name||'').trim()+'|'+String(date||'')}
  function doParse(text){
    const lines=String(text==null?'':text).split(/\\r?\\n/);
    const seen=new Set(items.filter(Boolean).map(it=>keyOf(it.name,it.date)));
    const good=[],bad=[];
    lines.forEach(function(raw,idx){
      const line=String(raw==null?'':raw).trim();
      if(!line)return;
      const r=bdParseLine(line);
      if(!r.ok){bad.push('第 '+(idx+1)+' 行：'+r.why);return}
      const k=keyOf(r.name,r.date);
      if(seen.has(k)){bad.push('第 '+(idx+1)+' 行：'+r.name+' '+r.date+' 已存在，跳过');return}
      seen.add(k);
      good.push(r);
    });
    parsed=good;
    info.textContent='解析完成：可导入 '+good.length+' 条'+(bad.length?'，跳过 '+bad.length+' 条（下方列出原因）':'。');
    badBox.innerHTML='';
    if(bad.length){
      badBox.append(el('p','qtip',{textContent:'以下行没有导入：'}));
      badBox.append(el('pre',null,{textContent:bad.slice(0,50).join('\\n')+(bad.length>50?'\\n…还有 '+(bad.length-50)+' 条':'')}));
    }
    impBtn.disabled=!good.length;
  }
  parseBtn.onclick=()=>doParse(ta.value);
  fileIn.onchange=()=>{
    const f=fileIn.files&&fileIn.files[0];
    if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{ta.value=String(rd.result||'');doParse(ta.value)};
    rd.readAsText(f,'utf-8');
  };
  impBtn.onclick=()=>{
    if(!parsed.length)return;
    const n=parsed.length;
    parsed.forEach(function(r){
      items.push({id:'user-'+Date.now()+'-'+items.length,name:r.name,date:r.date,series:r.series,builtin:false,groups:[]});
    });
    parsed=[];
    impBtn.disabled=true;
    render();
    setSaveStatus('已导入 '+n+' 条生日，记得点保存');
  };
  const fileBtn=el('button','mini',{textContent:'从 txt 文件读入'});
  fileBtn.onclick=()=>fileIn.click();
  const rowBtns=el('div','row');
  rowBtns.append(parseBtn,impBtn,fileBtn,fileIn,info);
  iw.append(el('p','qtip',{textContent:'「作品」可以省略；同名同日期的会被自动跳过，不会重复推送。导入只是加进列表，别忘了点保存。'}),ta,rowBtns,badBox);
  m.append(anchor(card('批量导入生日',iw),'bdimport'));

  // ---- 列表：搜索 / 筛选 / 排序 / 分页 / 批量 ----
  const f={q:'',kind:'',by:'date',page:1};
  const box=el('div',null,{style:'max-height:560px;overflow:auto;border:1px solid var(--line);border-radius:8px'});
  const nav=el('div','row');
  const lw=el('div');

  function refresh(){
    const list=bdSort(bdFilter(items,f),f.by);
    const pages=Math.max(1,Math.ceil(list.length/BD_PER));
    if(f.page<1)f.page=1;
    if(f.page>pages)f.page=pages;
    const slice=list.slice((f.page-1)*BD_PER,f.page*BD_PER);
    box.innerHTML='';
    const t=el('table');
    const tr1=el('tr');
    ['来源','名字','日期','作品','仅群','操作'].forEach(h=>tr1.append(el('th',null,{textContent:h})));
    t.append(tr1);
    slice.forEach(function(it){
      const tr=el('tr');
      const nm=el('input','',{type:'text',value:it.name||'',style:'width:170px'});
      nm.oninput=()=>it.name=nm.value;
      const da=el('input','',{type:'text',value:it.date||'',style:'width:66px'});
      da.oninput=()=>{const d=bdNormDate(da.value);it.date=d||da.value};
      const sr=el('input','',{type:'text',value:it.series||'',style:'width:120px'});
      sr.oninput=()=>it.series=sr.value;
      const gs=el('input','',{type:'text',value:Array.isArray(it.groups)&&it.groups.length?it.groups.join(','):'',placeholder:'空=全局',style:'width:140px'});
      gs.oninput=()=>it.groups=gs.value.split(',').map(s=>s.trim()).filter(Boolean);
      const del=el('button','mini danger',{textContent:'删'});
      del.title='删除这一条';
      del.onclick=()=>{
        const i=items.indexOf(it);
        if(i>=0)items.splice(i,1);
        refresh();
      };
      const tag=el('span','',{textContent:it.builtin?'内置':'自定义'});
      tag.className='tag'+(it.builtin?'':' hot');
      const c0=el('td');c0.append(tag);
      [c0,(()=>{const c=el('td');c.append(nm);return c})(),(()=>{const c=el('td');c.append(da);return c})(),(()=>{const c=el('td');c.append(sr);return c})(),(()=>{const c=el('td');c.append(gs);return c})(),(()=>{const c=el('td');c.append(del);return c})()].forEach(c=>tr.append(c));
      t.append(tr);
    });
    if(!slice.length){
      const tr2=el('tr');
      const td=el('td',null,{textContent:items.length?'没有符合条件的条目，换个搜索词或筛选条件':'还没有生日条目，可以用上面的「批量导入」贴一份名单进来'});
      td.colSpan=6;
      tr2.append(td);
      t.append(tr2);
    }
    box.append(t);

    nav.innerHTML='';
    function navBtn(label,fn,dis){
      const b=el('button','mini',{textContent:label});
      if(dis)b.disabled=true;
      b.onclick=fn;
      nav.appendChild(b);
    }
    navBtn('‹ 上页',function(){f.page--;refresh()},f.page<=1);
    nav.appendChild(el('span','qtip',{textContent:' 第 '+f.page+'/'+pages+' 页 · 筛选出 '+list.length+' / 共 '+items.length+' 条 '}));
    navBtn('下页 ›',function(){f.page++;refresh()},f.page>=pages);
    const delAll=el('button','mini danger',{textContent:'删除筛选出的 '+list.length+' 条'});
    delAll.onclick=function(){
      if(!list.length)return;
      if(!confirm('确定删除筛选出的 '+list.length+' 条生日吗？其中内置条目删掉后不会再自动恢复（除非重新导入）。'))return;
      for(let i=items.length-1;i>=0;i--)if(list.indexOf(items[i])>=0)items.splice(i,1);
      f.page=1;
      refresh();
      setSaveStatus('已删除 '+list.length+' 条生日，记得点保存');
    };
    const clrG=el('button','mini',{textContent:'把筛选结果的「仅群」清空（改回全局）'});
    clrG.onclick=function(){
      if(!list.length)return;
      list.forEach(function(it){it.groups=[]});
      refresh();
    };
    const exp=el('button','mini',{textContent:'导出筛选结果为文本'});
    exp.onclick=function(){
      const txt=bdSort(bdFilter(items,f),f.by).map(it=>[it.name,it.date,it.series||''].join(' ')).join('\\n');
      ta.value=txt;
      doParse(txt);
      setSaveStatus('已把 '+list.length+' 条填进上面的导入框（不会自动导入，可改完再导入）');
    };
    nav.append(el('span','qtip',{textContent:' 批量：'}),delAll,clrG,exp);
  }

  const fq=el('input','',{type:'text',placeholder:'搜索名字或作品',style:'width:170px'});
  fq.value=f.q;
  const fk=el('select',null);
  [['','来源(全部)'],['builtin','仅内置'],['custom','仅自定义']].forEach(function(v){fk.append(el('option',null,{value:v[0],textContent:v[1]}))});
  const fo=el('select',null);
  [['date','按日期'],['name','按名字'],['series','按作品']].forEach(function(v){fo.append(el('option',null,{value:v[0],textContent:v[1]}))});
  fo.value=f.by;
  const fg=el('button','mini',{textContent:'筛选'});
  const fres=el('button','mini',{textContent:'重置'});
  const add=el('button','mini',{textContent:'+ 手动加一条'});
  add.onclick=()=>{
    items.push({id:'user-'+Date.now(),name:'新角色',date:'01-01',series:'',builtin:false,groups:[]});
    refresh();
  };
  fg.onclick=()=>{f.q=fq.value;f.kind=fk.value;f.by=fo.value;f.page=1;refresh()};
  fres.onclick=()=>{f.q='';f.kind='';f.by='date';f.page=1;fq.value='';fk.value='';fo.value='date';refresh()};
  fq.onkeydown=(e)=>{if(e.key==='Enter')fg.click()};
  const frow=el('div','row');
  frow.append(fq,fk,fo,fg,fres,el('span','qtip',{textContent:'内置 Key 社生日是代码里写死的，删了不会自动回来；自定义条目随便改。'}),add);
  lw.append(frow,box,nav);
  m.append(anchor(card('生日条目（'+items.length+' 条）',lw),'bditems'));
  refresh();
}
function renderBirthdays(m){
  const bd=state.content.birthdays;
  m.append(el('p',null,{textContent:'生日提醒：内置 Key 社角色生日（AIR/Kanon/CLANNAD/Little Busters/Summer Pockets/Rewrite 等）为全局数据；每天 time 时刻向「已开启群」自动推送生日祝福。群内先用 /生日 开启 打开本群开关（也可在下方维护），再用 /生日 添加 [名字] [MM-DD] 添加仅该群生效的自定义生日。'}));
  const w=el('div');
  const r1=el('div','row');const en=el('input','',{type:'checkbox',checked:bd.enabled!==false});r1.append(en,el('label',null,{textContent:'总开关'})),en.onchange=()=>bd.enabled=en.checked;
  const r2=el('div','row');r2.append(el('label',null,{textContent:'推送时间(每天)'}));const tm=el('input','',{type:'text',value:bd.time||'00:00',style:'width:80px'});tm.oninput=()=>bd.time=tm.value;r2.append(tm);
  const r3=el('div','row');r3.append(el('label',null,{textContent:'推送文案({name}{series}{date} 可用)'}));const nt=el('input','',{type:'text',value:bd.notice,style:'width:480px'});nt.oninput=()=>bd.notice=nt.value;r3.append(nt);
  const r4=el('div','row');r4.append(el('label',null,{textContent:'已开启生日提醒的群(每行一个群号)'}));
  const gr=el('textarea',null);gr.value=(bd.enabledGroups||[]).join('\\n');gr.style.minHeight='52px';gr.oninput=()=>bd.enabledGroups=gr.value.split('\\n').map(s=>s.trim()).filter(Boolean);r4.append(gr);
  w.append(r1,r2,r3,r4);
  m.append(anchor(card('生日提醒设置',w),'bdset'));
  renderBirthdayItems(bd,m);
  jumpBarFor(m,[{id:'bdset',label:'提醒设置'},{id:'bdimport',label:'批量导入'},{id:'bditems',label:'生日条目'}]);
}
// 控制台页用不到 src/levelTitles.js（那是 bot 端的 ESM），所以这里自带一份默认值。
// 想改默认档位文案，两边都要改；不一致也只是「恢复默认」按钮恢复成旧文案，不会出错。
const DEFAULT_LEVEL_TITLES=()=>[
  {min:1,text:'葡家娃娃'},{min:11,text:'葡家在编学生'},{min:21,text:'葡家编外奶爸奶妈'},{min:31,text:'葡家编外辅导员'},
  {min:41,text:'葡家在编奶爸奶妈'},{min:51,text:'葡家在编辅导员'},{min:61,text:'葡家在编守门人'},{min:71,text:'葡家在编守门百夫长'},
  {min:81,text:'葡家长老会成员'},{min:91,text:'葡家分站站长'},
];
function renderTitles(m){
  m.append(el('p',null,{textContent:'葡家等级头衔：默认 10 档、每 10 级一档，头衔会画在等级卡昵称右侧。这里改的是全局表；单个群想改成自己的一套，让群主/管理员在群里 @bot 发 /设置头衔 <起始等级> <文字>（只影响那个群），或 /设置头衔 重置 撤掉该群覆盖。私聊发同样的指令改的是全局表，只有主人能改。'}));
  if(!Array.isArray(state.content.levelTitles))state.content.levelTitles=[];
  const t=el('table');
  const trh=el('tr');['起始等级','头衔文字',''].forEach(h=>trh.append(el('th',null,{textContent:h})));t.append(trh);
  // 每次都从 state.content.levelTitles 现取，不能把数组抓进闭包里：
  // 「恢复默认」是整体替换 state.content.levelTitles（不是原地改），
  // 闭包抓着旧数组的话，点完按钮表格不刷新，之后「+ 加一档」还会写进那个已经没人引用的旧数组，
  // 看着像保存了其实内容没变。
  const cur=()=>state.content.levelTitles;
  const redraw=()=>{ while(t.rows.length>1)t.deleteRow(1); cur().forEach((row,i)=>t.append(titleRow(t,row,cur,redraw,i))); };
  redraw();
  const add=(()=>{const b=el('button',null,{textContent:'+ 加一档'});b.onclick=()=>{cur().push({min:1,text:'新头衔'});redraw();};return b;})();
  const rst=(()=>{const b=el('button',null,{textContent:'恢复默认 10 档'});b.onclick=()=>{state.content.levelTitles=DEFAULT_LEVEL_TITLES().map(x=>({min:x.min,text:x.text}));redraw();};return b;})();
  // 子节点数组要放第三个参数：写成 el('div','row',null,[add,rst]) 会多传一个参数，
  // 数组被忽略，「+ 加一档」「恢复默认 10 档」两个按钮就不会出现在页面上。
  const w=el('div');w.append(t,el('div','row',[add,rst]));
  m.append(anchor(card('葡家等级头衔（全局）',w),'lvtitle'));
  jumpBarFor(m,[{id:'lvtitle',label:'葡家头衔'}]);
}
// 头衔表的一行（起始等级 + 文字 + 删除），抽出来给「恢复默认」后的重绘复用
function titleRow(t,row,cur,redraw,i){
  const tr=el('tr');
  const mi=el('input',null);mi.type='number';mi.value=String(row.min);mi.style.width='90px';
  mi.oninput=()=>{row.min=Math.max(1,parseInt(mi.value,10)||1);};
  const ti=el('input',null);ti.type='text';ti.value=row.text||'';ti.style.width='260px';
  ti.oninput=()=>{row.text=ti.value;};
  const del=(()=>{const b=el('button',null,{textContent:'删除'});b.onclick=()=>{cur().splice(i,1);redraw();};return b;})();
  tr.append(el('td',null,[mi]),el('td',null,[ti]),el('td',null,[del]));
  return tr;
}
function renderSchedule(m){
  m.append(el('p',null,{textContent:'定时提醒：每天 time 时刻向 groups（群号）发一条 message。默认关闭，点「启用」后保存生效。'}));
  const sch=state.content.schedule;
  const t=el('table');const tr1=el('tr');['启用','时间(HH:MM)','目标群(逗号分隔)','内容',''].forEach(h=>tr1.append(el('th',null,{textContent:h})));t.append(tr1);
  sch.forEach((j,i)=>{
    const tr=el('tr');
    const en=el('input','',{type:'checkbox',checked:!!j.enabled});
    const tm=el('input','',{type:'text',value:j.time,style:'width:70px'});
    const gr=el('input','',{type:'text',value:(j.groups||[]).join(','),style:'width:150px'});
    const ms=el('input','',{type:'text',value:j.message,style:'width:340px'});
    const del=el('button','mini danger',{textContent:'删'});
    en.onchange=()=>j.enabled=en.checked;tm.oninput=()=>j.time=tm.value;
    gr.oninput=()=>j.groups=gr.value.split(',').map(s=>s.trim()).filter(Boolean);ms.oninput=()=>j.message=ms.value;
    del.onclick=()=>{deletedIds.push(identOf(state.content.schedule[i],'schedule'));state.content.schedule.splice(i,1);render()};
    [en,tm,gr,ms,del].forEach(x=>{const td=el('td');td.append(x);tr.append(td)});
    t.append(tr);
  });
  const add=el('button','mini',{textContent:'+ 添加定时任务'});
  add.onclick=()=>{state.content.schedule.push({id:'job'+Date.now(),time:'09:00',groups:[],message:'定时内容',enabled:true});render()};
  m.append(card('定时提醒',(s=>{const w=el('div');w.append(t,add);return w})(null)));
}
function renderState(m){
  const w=el('div');
  const r=el('div','row');
  const testTo=el('input','',{type:'text',placeholder:'目标(群号或QQ)',style:'width:120px'});
  const testMsg=el('input','',{type:'text',placeholder:'测试消息(必填)',style:'width:260px'});
  const kind=el('select',null);[['group','群'],['private','私聊']].forEach(([v,l])=>{const o=el('option',null,{value:v,textContent:l});kind.append(o)});
  const btn=el('button','act',{textContent:'发送测试消息'});
  btn.onclick=async()=>{
    if(!testMsg.value){alert('请填测试消息');return}
    const r=await api('/api/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:kind.value,targetId:testTo.value,message:testMsg.value})});
    alert(r.ok?'已入队(ok)':'未入队: '+r.reason);
  };
  r.append(el('label',null,{textContent:'发消息测试：'}),kind,testTo,testMsg,btn);
  const reset=el('button','mini danger',{textContent:'重置风控 / 解除软静默'});
  reset.onclick=async()=>{try{const rr=await api('/api/reset',{method:'POST'});alert('已重置：'+JSON.stringify(rr))}catch(e){alert('重置失败: '+e.message)}};
  r.append(reset);
  const logBox=el('pre',null);
  const refresh=el('button','mini',{textContent:'刷新日志'});
  refresh.onclick=async()=>{try{const d=await api('/api/logs?n=120');logBox.textContent=d.join('\\n')}catch(e){logBox.textContent=e.message}};
  w.append(card('发送测试',r),el('div','row',{}));
  const lc=el('div');lc.append(el('div','row',{}),refresh,logBox);
  w.append(card('运行日志',lc));
  m.append(w);
}
render();
renderTop();
setInterval(renderTop,2000);
</script>
</body>
</html>`;
