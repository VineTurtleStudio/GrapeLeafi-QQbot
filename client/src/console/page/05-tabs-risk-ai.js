// console/page/05-tabs-risk-ai.js —— 风控 / 行为 / AI / 动漫 tab
// 由 src/console/page.js 按固定顺序拼接进 PAGE；请勿单独运行。
// 注意：本文件里的 \\ 是原本就有的字面反斜杠，别再删。
export default `function renderRisk(m){
  const st=state.content.settings||(state.content.settings={});
  st.gates=st.gates||{};st.riskgate=st.riskgate||{};
  m.append(el('p',null,{textContent:'风控/节流参数可视化。上组(节流)控制 bot 回复的间隔，保存后立即生效；下组(发送器运行时)控制群消息每秒/每小时/每天的发送上限与并发等，保存时实时应用到发送器，并随配置文件持久化，重启后自动恢复。留空=用默认值。'}));
  const w=el('div');
  const gw=el('div','card');
  gw.append(el('h2',null,{textContent:'回复节流(毫秒)'}));
  const g1=numRow('群自动回复间隔 groupReplyGapMs',st.gates,'groupReplyGapMs','默认8000');
  const g2=numRow('私聊回复间隔 privateReplyGapMs',st.gates,'privateReplyGapMs','默认10000');
  const g3=numRow('AI 回复间隔 aiReplyGapMs',st.gates,'aiReplyGapMs','默认3000');
  gw.append(g1,g2,g3);
  const rw=el('div','card');
  rw.append(el('h2',null,{textContent:'发送器运行时参数(数值)'}));
  const rows=[
    ['随机延迟下限(毫秒) minDelayMs','minDelayMs'],
    ['随机延迟上限(毫秒) maxDelayMs','maxDelayMs'],
    ['群维度发言间隔(毫秒) groupCooldownMs','groupCooldownMs'],
    ['用户维度发言间隔(毫秒) userCooldownMs','userCooldownMs'],
    ['突发上限(条/秒) burstLimit','burstLimit'],
    ['每小时上限 hourlyCap','hourlyCap'],
    ['每日上限 dailyCap','dailyCap'],
    ['每群每日上限 groupIdDailyCap','groupIdDailyCap'],
    ['队列上限 maxQueueLength','maxQueueLength'],
    ['并发连接数 concurrency','concurrency'],
    ['发送超时(毫秒) sendTimeoutMs','sendTimeoutMs'],
  ];
  rows.forEach(([l,k])=>rw.append(numRow(l,st.riskgate,k,'')));
  w.append(gw,rw);
  m.append(anchor(card('风控/节流',w),'riskgate'));
}
function renderBehavior(m){
  m.append(el('p',null,{textContent:'回复方式：默认「自由回复」，群内检测到关键字/问候词就自动接话；选「仅 @ 回复」后，群内只有被 @ 或喊名字时才回应，避免误触发。私聊始终回复。「关键字长句上限」：0 表示群内任何长度的消息都可以命中 包含/正则 关键字（默认）；填数字 N 则超过 N 字的消息不会再触发这类关键字，用于防止长段文字误触发。「回复时引用原消息」：默认勾选=回复沿用当前协议端的「引用那条消息」样式；取消后所有指令/关键字回复直接发送、不引用（部分协议端更美观，且配合「撤回」更方便）。'}));
  const st=state.content.settings||(state.content.settings={groupReplyMode:'keyword'});
  const w=el('div');
  const r1=el('div','row');
  const a1=el('input','',{type:'radio',name:'rm',checked:st.groupReplyMode!=='mention'});
  a1.onchange=()=>st.groupReplyMode='keyword';
  r1.append(a1,el('label',null,{textContent:'自由回复（默认）：检测到关键字就接话'}));
  const r2=el('div','row');
  const a2=el('input','',{type:'radio',name:'rm',checked:st.groupReplyMode==='mention'});
  a2.onchange=()=>st.groupReplyMode='mention';
  r2.append(a2,el('label',null,{textContent:'仅 @ 回复：群内只有被 @ 或喊我名字时才回应'}));
  const r3=el('div','row');
  r3.append(el('label',null,{textContent:'关键字长句上限(0=不限制)'}));
  const kwl=el('input','',{type:'number',value:((st.keywordMaxLen===undefined||st.keywordMaxLen===null)?0:st.keywordMaxLen),style:'width:90px'});
  kwl.oninput=()=>{st.keywordMaxLen=kwl.value?+kwl.value:0};
  r3.append(kwl);
  const r4=el('div','row');
  const qa=el('input','',{type:'checkbox',checked:st.replyQuote!==false});
  qa.onchange=()=>{st.replyQuote=qa.checked};
  r4.append(qa,el('label',null,{textContent:'回复时引用原消息（勾选=回复附带「回复」那条消息；取消=直接发送不引用）'}));
  w.append(r1,r2,r3,r4);
  m.append(anchor(card('群内回复方式',w),'behreply'));
  const ge=state.content.settings.groupEnabled||(state.content.settings.groupEnabled={});
  const gw=el('div');
  gw.append(el('p',null,{textContent:'群指令开关：每行 「key: 群号,群号」；key 形如 cat:小游戏 / cmd:钓鱼。有该列表的仅列出的群可用；生日类默认在 defaultOff，未开启的群不可用。群内 /开启 X、/关闭 X 也会自动维护这里。'}));
  const gta=el('textarea',null);gta.value=Object.keys(ge).map(k=>k+': '+ge[k].join(',')).join('\\n');gta.style.minHeight='90px';
  gta.oninput=()=>{const st=state.content.settings;st.groupEnabled={};gta.value.split('\\n').map(s=>s.trim()).filter(Boolean).forEach(line=>{const i=line.indexOf(':');if(i<0)return;const k=line.slice(0,i).trim();const v=line.slice(i+1).split(',').map(x=>x.trim()).filter(Boolean);if(k)st.groupEnabled[k]=v})};
  const dff=el('input','',{type:'text',value:(state.content.settings.defaultOff||[]).join(','),style:'width:220px'});
  dff.oninput=()=>state.content.settings.defaultOff=dff.value.split(',').map(s=>s.trim()).filter(Boolean);
  const dr=el('div','row');dr.append(el('label',null,{textContent:'默认关闭的指令/类型(逗号分隔)'}),dff);
  gw.append(gta,dr);
  m.append(anchor(card('群指令开关',gw),'behgate'));
  // 事件键必须和 brain-notice.js 的 NOTICE_DEFAULTS 完全一致，写错一个字母就静默不生效。
  // 对应关系：welcome=group_increase / leave=group_decrease / poke=notify(sub_type=poke)
  //           essence=group_essence / admin=group_admin / ban=group_ban / friend=friend_add
  // friend_add 是私聊事件，没有「启用群」的概念，所以不画 enabledGroups 输入框。
  const ev=(state.content.settings.events)||(state.content.settings.events={});
  const evEnsure=(k)=>{
    if(!ev[k]||typeof ev[k]!=='object')ev[k]={enabledGroups:[],text:'',cooldownSec:0};
    if(!Array.isArray(ev[k].enabledGroups))ev[k].enabledGroups=[];
    if(typeof ev[k].cooldownSec!=='number')ev[k].cooldownSec=0;
    return ev[k];
  };
  const evWelcome=evEnsure('welcome');
  const evLeave=evEnsure('leave');
  const evPoke=evEnsure('poke');
  const evEssence=evEnsure('essence');
  const evAdmin=evEnsure('admin');
  const evBan=evEnsure('ban');
  const evFriend=evEnsure('friend');
  const ew=el('div');
  ew.append(el('p',null,{textContent:'群事件回应（默认全关）：在「启用群」里填群号（逗号分隔）即对该群启用，留空=不启用。加好友是私聊事件，没有启用群，填了文案就会自动回复。'}));
  ew.append(el('p',null,{textContent:'文案占位符：{qq} 成员QQ、{nick} 事件里的目标人、{title} 消息或事件标题、{action} 动作描述（如「被禁言 10 分钟」）、{at} @该成员。冷却填 0 表示不限制。'}));
  const evRow=(label,map,withCooldown)=>{
    const row=el('div');row.style.marginBottom='8px';
    const t=el('b',null,{textContent:label});row.append(t);
    const ga=el('input','',{type:'text',value:(map.enabledGroups||[]).join(','),style:'width:200px',placeholder:'启用群号(逗号分隔，留空=所有群)'});
    ga.oninput=()=>map.enabledGroups=ga.value.split(',').map(s=>s.trim()).filter(Boolean);
    row.append(ga);
    if(withCooldown!==false){
      const cl=el('label',null,{textContent:'冷却(秒)'});cl.style.marginLeft='8px';
      const cd=el('input','',{type:'number',min:'0',value:(map.cooldownSec>0?map.cooldownSec:0),style:'width:70px'});
      cd.oninput=()=>map.cooldownSec=Math.max(0,+cd.value||0);
      row.append(cl,cd);
    }
    return row;
  };
  const textRow=(map,placeholder)=>{
    const ta=el('textarea','');ta.value=map.text||'';ta.placeholder=placeholder;ta.style.minHeight='46px';
    ta.oninput=()=>map.text=ta.value;
    return ta;
  };
  const imgRow=(map)=>{
    const row=el('div');row.style.marginBottom='8px';
    const ia=el('input','',{type:'text',value:map.image||'',style:'width:320px',placeholder:'图片URL或本地文件名（留空=只发文字）'});
    ia.oninput=()=>map.image=ia.value.trim();
    row.append(el('label',null,{textContent:'配图：'}),ia);
    return row;
  };
  ew.append(el('div',null,[el('label',null,{textContent:'入群欢迎文案：'}),textRow(evWelcome,'欢迎新成员～在群里说句话认识一下吧！')]));
  ew.append(evRow('入群欢迎启用群',evWelcome));
  ew.append(imgRow(evWelcome));
  ew.append(el('div',null,[el('label',null,{textContent:'退群提示文案：'}),textRow(evLeave,'有一位伙伴离开了，愿 TA 前程似锦～')]));
  ew.append(evRow('退群提示启用群',evLeave));
  ew.append(imgRow(evLeave));
  (function(){
    const ta=el('textarea','');ta.value=(Array.isArray(evPoke.replies)?evPoke.replies:[]).join('\\n');ta.placeholder='戳我干嘛～(每行一条，随机取)';ta.style.minHeight='46px';
    ta.oninput=()=>evPoke.replies=ta.value.split('\\n').map(s=>s.trim()).filter(Boolean);
    ew.append(el('div',null,[el('label',null,{textContent:'戳一戳回复（每行一条，随机取）：'}),ta]));
    ew.append(evRow('戳一戳启用群',evPoke));
    // 好友戳一戳是同一个事件（sub_type=poke），只是不带 group_id，走不到「启用群」那一栏。
    // 私聊没法按群限范围，所以单独给个开关，默认关：陌生人戳一下就回一句太容易被骚扰。
    const pv=el('div','row');
    const pvc=el('input','',{type:'checkbox',checked:evPoke.allowPrivate===true});
    pvc.onchange=()=>evPoke.allowPrivate=pvc.checked;
    pv.append(pvc,el('label',null,{textContent:'同时响应好友/私聊戳一戳（默认关；好友戳的事件里没有群号，只能整体开或整体关）'}));
    ew.append(pv);
    ew.append(imgRow(evPoke));
  })();
  ew.append(el('div',null,[el('label',null,{textContent:'群精华提示文案：'}),textRow(evEssence,'📌 {nick} 刚把一条消息设为群精华：{title}')]));
  ew.append(evRow('精华提示启用群',evEssence));
  ew.append(el('div',null,[el('label',null,{textContent:'管理员变动文案：'}),textRow(evAdmin,'🔧 群管理员变动：{action} {nick}')]));
  ew.append(evRow('管理员变动启用群',evAdmin));
  ew.append(el('div',null,[el('label',null,{textContent:'禁言/解禁文案：'}),textRow(evBan,'🔇 {nick} {action}')]));
  ew.append(evRow('禁言提示启用群',evBan));
  ew.append(el('div',null,[el('label',null,{textContent:'加好友自动回复（留空=不自动通过）：'}),textRow(evFriend,'你好呀，欢迎～')]));
  m.append(anchor(card('群事件回应',ew),'behevent'));
  jumpBarFor(m,[{id:'behreply',label:'回复方式'},{id:'behgate',label:'群指令开关'},{id:'behevent',label:'群事件回应'}]);
}
function renderAi(m){
  const ai=state.content.ai;
  const w=el('div');
  const p1=el('p',null,{textContent:'AI 对话在 client/config.json 的 ai 节点开启（enabled 且填 apiKey）。Offline 回复在 AI 未配置或失败时兜底。'});
  const r1=el('div','row');r1.append(el('label',null,{textContent:'systemPrompt（AI 人设）'}));
  const ta=el('textarea',null);ta.value=ai.systemPrompt;ta.oninput=()=>ai.systemPrompt=ta.value;
  const r2=el('div','row');r2.append(el('label',null,{textContent:'未配置 AI 时回复'}));
  const off=el('input','',{type:'text',value:ai.offlineReply,style:'width:420px'});off.oninput=()=>ai.offlineReply=off.value;
  const r3=el('div','row');r3.append(el('label',null,{textContent:'AI 出错时回复'}));
  const err=el('input','',{type:'text',value:ai.errorReply,style:'width:420px'});err.oninput=()=>ai.errorReply=err.value;
  w.append(p1,r1,ta,r2,off,r3,err);
  m.append(card('AI 设置',w));
}
function animeModeSelect(value){
  const select=el('select',null);
  [['auto','自动识别'],['json','JSON'],['text','文本 URL'],['image','直接图片']].forEach(function(item){
    select.append(el('option',null,{value:item[0],textContent:item[1]}));
  });
  select.value=value||'auto';
  select.style.width='105px';
  return select;
}
function renderAnime(m){
  const cfg=state.content.anime||(state.content.anime={timeoutSec:15,sources:[]});
  if(!Array.isArray(cfg.sources))cfg.sources=[];
  m.append(el('p',null,{textContent:'「/随机二次元」会从已启用且标记为非18+的 API 中随机选择，失败时自动尝试下一个。此标记依赖第三方站点内容规范，无法替代图片内容审核；请勿添加来源不明的接口。'}));
  const settings=el('div');
  const timeout=el('input','',{type:'number',min:'3',max:'30',value:cfg.timeoutSec||15,style:'width:90px'});
  timeout.oninput=()=>cfg.timeoutSec=Math.max(3,Math.min(30,Number(timeout.value)||15));
  const row=el('div','row');
  row.append(el('label',null,{textContent:'单个 API 超时（秒，3-30）'}),timeout);
  settings.append(row);
  m.append(anchor(card('运行设置',settings),'animeset'));
  const enabledCount=cfg.sources.filter(function(source){return source.enabled!==false&&source.sfw===true}).length;
  const wrap=el('div');wrap.style.overflowX='auto';
  const table=el('table');
  const head=el('tr');
  ['启用','非18+','名称','API URL','响应模式','图片字段','备注','测试','操作'].forEach(function(label){head.append(el('th',null,{textContent:label}))});
  table.append(head);
  cfg.sources.forEach(function(source,index){
    if(!source.mode)source.mode='auto';
    if(source.sfw===undefined)source.sfw=false;
    const tr=el('tr');
    const enabled=el('input','',{type:'checkbox',checked:source.enabled!==false});
    const sfw=el('input','',{type:'checkbox',checked:source.sfw===true,title:'未确认非18+的接口不会用于随机图片指令'});
    const name=el('input','',{type:'text',value:source.name||'',style:'width:130px'});
    const url=el('input','',{type:'text',value:source.url||'',style:'width:330px'});
    const mode=animeModeSelect(source.mode);
    const field=el('input','',{type:'text',value:source.imageField||'',style:'width:120px',placeholder:'如 data.url'});
    const note=el('input','',{type:'text',value:source.note||'',style:'width:170px'});
    const status=el('span','qtip',{textContent:'未测试'});
    const test=el('button','mini',{textContent:'测试'});
    const del=el('button','mini danger',{textContent:'删除'});
    enabled.onchange=()=>source.enabled=enabled.checked;
    sfw.onchange=()=>source.sfw=sfw.checked;
    name.oninput=()=>source.name=name.value;
    url.oninput=()=>source.url=url.value.trim();
    mode.onchange=()=>source.mode=mode.value;
    field.oninput=()=>source.imageField=field.value.trim();
    note.oninput=()=>source.note=note.value;
    test.onclick=async function(){
      if(source.sfw!==true){alert('请先确认并勾选「非18+」');return}
      test.disabled=true;status.textContent='测试中…';
      try{
        const result=await api('/api/anime/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:source,timeoutSec:cfg.timeoutSec})});
        status.textContent='可用 · '+result.elapsedMs+'ms';status.title=result.url;
      }catch(err){status.textContent='失败：'+err.message;status.title=''}
      finally{test.disabled=false}
    };
    del.onclick=function(){
      if(!confirm('删除图片源「'+(source.name||source.url)+'」？'))return;
      deletedIds.push(identOf(source,'animeSources'));
      cfg.sources.splice(index,1);scheduleSave();render();
    };
    [enabled,sfw,name,url,mode,field,note,status,test,del].forEach(function(item){const cell=el('td');cell.append(item);tr.append(cell)});
    table.append(tr);
  });
  wrap.append(table);
  m.append(anchor(card('已添加 API（'+cfg.sources.length+' 个，可用 '+enabledCount+' 个）',wrap),'animesrc'));
  const addBody=el('div');
  const addRow=el('div','row');
  const name=el('input','',{type:'text',placeholder:'名称',style:'width:130px'});
  const url=el('input','',{type:'text',placeholder:'https://example.com/random',style:'width:360px'});
  const mode=animeModeSelect('auto');
  const field=el('input','',{type:'text',placeholder:'JSON 图片字段（可空）',style:'width:170px'});
  const note=el('input','',{type:'text',placeholder:'备注（可空）',style:'width:180px'});
  const sfw=el('input','',{type:'checkbox'});
  const add=el('button','act',{textContent:'添加 API'});
  add.onclick=function(){
    const value=url.value.trim();
    if(!value){alert('请填写 API URL');return}
    let parsed;
    try{
      parsed=new URL(value);
      if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')throw new Error('只支持 HTTP/HTTPS');
    }catch(err){alert('API URL 无效：'+err.message);return}
    if(cfg.sources.length>=30){alert('最多添加 30 个 API');return}
    cfg.sources.push({
      id:'src-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
      name:name.value.trim()||parsed.hostname,
      url:value,
      mode:mode.value,
      imageField:field.value.trim(),
      enabled:true,
      sfw:sfw.checked,
      note:note.value.trim()
    });
    scheduleSave();render();
  };
  addRow.append(el('label',null,{textContent:'新增'}),name,url,mode,field,note,el('label',null,{textContent:'已确认非18+'}),sfw,add);
  addBody.append(addRow,el('p','qtip',{textContent:'新增来源默认不参与随机出图；确认内容规范为非18+后再勾选。JSON 图片地址可填写字段，留空时递归查找；自动模式同时支持 JSON、纯文本 URL、重定向和直接图片响应。'}));
  m.append(anchor(card('添加图片 API',addBody),'animeadd'));
  jumpBarFor(m,[{id:'animeset',label:'运行设置'},{id:'animesrc',label:'来源列表('+enabledCount+' 可用)'},{id:'animeadd',label:'添加 API'}]);
}
`;
