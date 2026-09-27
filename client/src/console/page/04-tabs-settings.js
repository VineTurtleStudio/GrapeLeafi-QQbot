// console/page/04-tabs-settings.js —— 设置 tab：读写 config.json，含 txtR/numR/boolR/selR/listR/secretR 控件与 renderSettings
// 由 src/console/page.js 按固定顺序拼接进 PAGE；请勿单独运行。
// 注意：本文件里的 \\ 是原本就有的字面反斜杠，别再删。
export default `// ===== 设置页（读写 config.json）=====
// 这一页的输入框都带 data-nosave，避免触发全局的内容自动保存（那是存 content.json 的）。
// 保存走独立的 /api/config，按钮显式触发——改主人这种事不该自动生效。
function tagOf(kind){
  return kind==='restart'
    ? el('span','tag restart',{textContent:'需重启生效'})
    : kind==='hot'
      ? el('span','tag hot',{textContent:'保存即生效'})
      : null;
}
function secHead(title,kind){
  const h=el('h2',null,{textContent:title});
  const t=tagOf(kind);
  if(t)h.appendChild(t);
  return h;
}
function txtR(label,obj,key,ph,hint){
  const r=el('div','row');
  const i=el('input','',{type:'text',value:(obj&&obj[key]!==undefined&&obj[key]!==null)?String(obj[key]):'',placeholder:ph||'',dataset:{nosave:'1'}});
  i.oninput=()=>{if(i.value===''){if(obj[key]!==undefined)delete obj[key]}else{obj[key]=i.value}};
  r.append(el('label',null,{textContent:label}),i);
  if(hint)r.append(el('span','qtip',{textContent:hint}));
  return r;
}
function numR(label,obj,key,ph,hint){
  const r=el('div','row');
  const i=el('input','',{type:'number',value:(obj&&obj[key]!==undefined&&obj[key]!==null)?String(obj[key]):'',placeholder:ph||'',style:'width:110px',dataset:{nosave:'1'}});
  i.oninput=()=>{if(i.value===''){if(obj[key]!==undefined)delete obj[key]}else{obj[key]=+i.value}};
  r.append(el('label',null,{textContent:label}),i);
  if(hint)r.append(el('span','qtip',{textContent:hint}));
  return r;
}
function boolR(label,obj,key,hint){
  const r=el('div','row');
  const i=el('input','',{type:'checkbox',dataset:{nosave:'1'}});
  i.checked=obj[key]!==false;
  i.onchange=()=>{obj[key]=i.checked};
  r.append(el('label',null,{textContent:label}),i);
  if(hint)r.append(el('span','qtip',{textContent:hint}));
  return r;
}
function selR(label,obj,key,opts,hint){
  const r=el('div','row');
  const s=el('select','',{dataset:{nosave:'1'}});
  opts.forEach(function(o){
    const op=el('option',null,{value:o,textContent:o});
    if(String(obj[key])===String(o))op.selected=true;
    s.appendChild(op);
  });
  s.onchange=()=>{obj[key]=s.value};
  r.append(el('label',null,{textContent:label}),s);
  if(hint)r.append(el('span','qtip',{textContent:hint}));
  return r;
}
// 数组字段用「一行一个」的多行框，比逗号分隔更好读也不易打错
function listR(label,obj,key,hint){
  const w=el('div');
  w.style.marginBottom='8px';
  const cur=Array.isArray(obj[key])?obj[key].map(String):[];
  const t=el('textarea','',{rows:3,placeholder:'一行一个，留空表示没有',dataset:{nosave:'1'}});
  t.value=cur.join('\\n');
  t.style.minHeight='64px';
  t.oninput=function(){
    const v=t.value.split('\\n').map(function(s){return s.trim()}).filter(Boolean);
    if(v.length)obj[key]=v;else delete obj[key];
  };
  w.append(el('label',null,{textContent:label}),t);
  if(hint)w.append(el('div','qtip',{textContent:hint}));
  return w;
}
// 敏感字段：只显示「是否已设置」，不回显真值。改动才提交，没动就不提交。
function secretR(label,path,isSet){
  const w=el('div');
  w.style.marginBottom='8px';
  const r=el('div','secretr');
  const i=el('input','',{type:'password',placeholder:isSet?'已设置（不回显，留空=保持不变）':'未设置（留空=不设置）',dataset:{nosave:'1'}});
  i.value='';
  const clr=el('button','mini danger',{textContent:'清空',type:'button'});
  r.append(el('label',null,{textContent:label,style:'min-width:150px'}),i,clr);
  w.append(r);
  const h=el('div','qtip',{textContent:'路径 '+path+'　只有填了新值或点了清空才会写入；空着不动就保持原样。'});
  w.append(h);
  clr.dataset.path=path;
  clr.dataset.clear='1';
  i.dataset.path=path;
  state.secretInputs=state.secretInputs||[];
  state.secretInputs.push({input:i,path:path});
  return w;
}

async function renderSettings(m){
  if(!state.config){
    m.append(el('p',null,{textContent:'正在读取配置…'}));
    try{
      const d=await api('/api/config');
      state.config=d.config||{};
      state.secretsSet=d.secretsSet||[];
    }catch(e){
      m.innerHTML='';
      m.append(el('pre',null,{textContent:'读取配置失败：'+e.message}));
      return;
    }
  }
  const cfg=state.config;
  const secretsSet=state.secretsSet||[];
  const isSet=function(p){return secretsSet.indexOf(p)>=0};
  state.secretInputs=[];

  m.append(el('p',null,{textContent:'这一页直接读写 config.json，是为了让别人拿到项目后不改代码就能用。带「保存即生效」的改完点保存即可；带「需重启生效」的要重启客户端。敏感值（密钥/token）不回显，留空表示保持原值。'}));

  // 分区锚点。设置页有十来个大分区，改一个配置要上下翻很久，
  // 顶部加一条吸顶跳转栏就能直接定位——和内置指令页用的是同一个 jumpBar()。
  const anchors=[];
  const tag=(node,id,label)=>{
    node.id=id;
    node.classList.add('jbar-target');
    anchors.push({id,label});
    return node;
  };

  // ---- 主人（最重要，放最前面）----
  const who=el('div','card');
  who.appendChild(secHead('主人账号','hot'));
  who.append(el('div','okbox',{textContent:'主人拥有全部权限：可用所有指令、改任何人的积分/光玉/卡牌、能发权限、绕过群开关与免打扰与频率限制，且不受抽签钓鱼等业务冷却限制。换主人后立刻生效，无需重启。'}));
  const bot=cfg.bot||(cfg.bot={});
  if(!Array.isArray(bot.adminIds))bot.adminIds=[];
  who.appendChild(listR('主人 QQ 号（一行一个，可填多个）',bot,'adminIds','就是你自己和协作者的 QQ 号。填错会导致自己失去主人权限——换人前建议先把自己的号加进去。'));
  who.appendChild(txtR('机器人昵称',bot,'nickname','葡叶酱','群里被呼叫时匹配的名字'));
  who.appendChild(txtR('指令前缀',bot,'commandPrefix','/','所有指令都要带这个前缀'));
  m.append(tag(who,'st-who','主人账号'));

  // ---- 连接 NapCat ----
  const gw=el('div','card');
  gw.appendChild(secHead('连接 NapCat（网关）','restart'));
  const g=cfg.gateway||(cfg.gateway={});
  gw.appendChild(txtR('监听地址 host',g,'host','127.0.0.1','保持 127.0.0.1 表示只允许本机接入'));
  gw.appendChild(numR('监听端口 port',g,'port','8181','NapCat 里填同一个端口'));
  gw.appendChild(txtR('反向 WS 路径 path',g,'path','/onebot/v11/ws','与 NapCat 配置一致'));
  gw.appendChild(secretR('接入 token（accessToken）','gateway.accessToken',isSet('gateway.accessToken')));
  m.append(tag(gw,'st-gw','NapCat 连接'));

  // ---- 回复与门控 ----
  const rp=el('div','card');
  rp.appendChild(secHead('回复与门控','hot'));
  rp.appendChild(selR('私聊回复范围',bot,'replyPrivate',['whitelist','all','off'],'whitelist=只有白名单；all=所有人私聊都回；off=不回复私聊'));
  rp.appendChild(listR('私聊白名单 QQ 号',bot,'privateWhitelist','主人永远可以私聊，不受此列表限制'));
  rp.appendChild(listR('自动回复的群号',bot,'replyGroups','留空=所有群都监听'));
  rp.appendChild(boolR('开启关键字自动回复',bot,'keywordAutoReply','关掉后 bot 只回应 @ 和指令'));
  rp.appendChild(numR('群回复间隔(毫秒)',bot,'groupReplyGapMs','3000','同一群两次回复的最小间隔'));
  rp.appendChild(numR('私聊回复间隔(毫秒)',bot,'privateReplyGapMs','10000'));
  rp.appendChild(numR('AI 回复间隔(毫秒)',bot,'aiReplyGapMs','20000'));
  m.append(tag(rp,'st-rp','回复与门控'));

  // ---- 免打扰 ----
  const qh=el('div','card');
  qh.appendChild(secHead('免打扰时段','hot'));
  qh.append(el('div','qtip',{textContent:'时段内 bot 不回复消息，但主人不受影响，定时提醒也不推送（除非群在下方允许列表里）。'}));
  const q=bot.quietHours||(bot.quietHours={});
  qh.appendChild(boolR('启用免打扰',q,'enabled'));
  qh.appendChild(txtR('开始时间',q,'start','23:30','24 小时制 HH:MM'));
  qh.appendChild(txtR('结束时间',q,'end','06:30','可以跨过午夜，如 23:30 到 06:30'));
  qh.appendChild(listR('免打扰期间仍允许的群号',q,'allowGroups','留空=都不允许'));
  m.append(tag(qh,'st-qh','免打扰'));

  // ---- 频率限制 ----
  const rl=el('div','card');
  rl.appendChild(secHead('频率限制','hot'));
  rl.append(el('div','qtip',{textContent:'普通用户超过上限就不再回复，用于防刷屏。主人不受此限制。'}));
  const ur=bot.userRateLimit||(bot.userRateLimit={});
  rl.appendChild(numR('窗口内最多回复(条)',ur,'max','20'));
  rl.appendChild(numR('窗口长度(秒)',ur,'windowSec','300'));
  m.append(tag(rl,'st-rl','频率限制'));

  // ---- AI ----
  const ai=el('div','card');
  ai.appendChild(secHead('AI 回复（可选）','hot'));
  ai.append(el('div','qtip',{textContent:'不填 apiKey 就不会启用。启用后所有 ai 开头的字段一起生效。'}));
  const a=bot.ai||(bot.ai={});
  ai.appendChild(boolR('启用 AI',a,'enabled'));
  ai.appendChild(txtR('接口地址 baseUrl',a,'baseUrl','https://api.deepseek.com/v1','兼容 OpenAI 格式的接口均可'));
  ai.appendChild(secretR('API Key','bot.ai.apiKey',isSet('bot.ai.apiKey')));
  ai.appendChild(txtR('模型 model',a,'model','deepseek-chat'));
  ai.appendChild(numR('随机度 temperature',a,'temperature','0.8','0 最稳，2 最发散'));
  ai.appendChild(numR('最大回复长度 maxTokens',a,'maxTokens','600'));
  ai.appendChild(numR('请求超时(秒)',a,'timeoutSec','40'));
  ai.appendChild(numR('AI 回复间隔(秒)',a,'cooldownSec','20'));
  m.append(tag(ai,'st-ai','AI 回复'));

  // ---- 游戏冷却 ----
  const gm=el('div','card');
  gm.appendChild(secHead('小游戏冷却','hot'));
  const gsec=bot.games||(bot.games={});
  gm.appendChild(numR('抽签冷却(秒)',gsec,'lotteryCooldownSec','600'));
  gm.appendChild(numR('钓鱼冷却(秒)',gsec,'fishingCooldownSec','30'));
  gm.appendChild(boolR('运势每天只抽一次',gsec,'fortunePerDay'));
  m.append(tag(gm,'st-gm','小游戏冷却'));

  // ---- 定时提醒 ----
  const sc=el('div','card');
  sc.appendChild(secHead('定时提醒','hot'));
  const s2=cfg.scheduler||(cfg.scheduler={});
  sc.appendChild(boolR('启用定时提醒',s2,'enabled','关掉后所有定时任务（含生日推送）都不再触发'));
  sc.appendChild(numR('检查间隔(秒)',s2,'checkEverySec','20','改这个会重启定时器'));
  sc.appendChild(el('div','qtip',{textContent:'具体有哪些提醒任务，在「定时提醒」页配置。'}));
  m.append(tag(sc,'st-sc','定时提醒'));

  // ---- 控制台自身 ----
  const cs=el('div','card');
  cs.appendChild(secHead('控制台自身','restart'));
  cs.append(el('div','warnbox',{textContent:'这里改的是控制台的监听地址和访问 token。改完必须重启客户端，而且新地址/新 token 立刻生效——如果改成自己进不去的值，就只能手动改 config.json 才能救回来了。'}));
  const c2=cfg.console||(cfg.console={});
  cs.appendChild(boolR('启用控制台',c2,'enabled'));
  cs.appendChild(txtR('监听地址 host',c2,'host','127.0.0.1','改成 0.0.0.0 可让局域网访问，务必同时设置 token'));
  cs.appendChild(numR('监听端口 port',c2,'port','9632'));
  cs.appendChild(secretR('访问 token','console.token',isSet('console.token')));
  m.append(tag(cs,'st-cs','控制台自身'));

  // ---- 手机 / 局域网访问 ----
  // 「把控制台弄到手机上」原先只能靠人自己知道「host 要改 0.0.0.0 + 必须配 token」
  // 这件事：文档里写了，但没人会在设置页里看到自己当前到底配没配好。
  // 这一块就是把当前状态和可直接用的地址摆出来，省掉照文档猜的来回。
  const ph=el('div','card');
  ph.appendChild(secHead('手机 / 局域网访问'));
  ph.appendChild(el('div','warnbox',{textContent:'控制台是只给你自己用的后台：能改全部配置、看群列表、读本机图片文件。不要把地址做端口转发暴露到公网，也不要把 token 发给别人。异地访问请走 VPN / Tailscale。'}));
  const phBody=el('div');
  ph.appendChild(phBody);
  ph.appendChild(el('div','qtip',{textContent:'手机要连上，两个条件必须同时满足：① 上面「控制台自身」里的 host 不是 127.0.0.1（一般是 0.0.0.0）；② 同一处设了访问 token。少任何一个，手机都打不开——这是有意的，不设 token 就开放等于把后台裸露在同网段。'}));
  m.append(tag(ph,'st-phone','手机访问'));
  (async function(){
    let d=null;
    try{ d=await api('/api/lan'); }catch(e){}
    phBody.innerHTML='';
    if(!d){
      phBody.appendChild(el('div','qtip',{textContent:'读取本机网络信息失败（客户端版本较旧，或不是从本机打开的）。可手动用「http://电脑局域网IP:'+(cfg.console?cfg.console.port:9632)+'/?token=…」访问。'}));
      return;
    }
    if(!d.phoneReachable){
      const why=!d.tokenRequired?'现在没设访问 token。':'现在 host 还是 '+d.host+'，只允许本机自己访问。';
      phBody.appendChild(el('div','warnbox',{textContent:'现在手机上打不开控制台。'+why+'请把上面「控制台自身」的 host 改成 0.0.0.0 并设置访问 token，然后重启客户端。'}));
      phBody.appendChild(el('div','qtip',{textContent:'当前监听：'+d.host+':'+d.port+'（仅本机）。手机和电脑不在同一个 Wi-Fi 也连不上。'}));
      return;
    }
    phBody.appendChild(el('div','okbox',{textContent:'手机已经可以连了。在手机浏览器里打开下面任一条地址即可（手机和电脑要连同一个 Wi-Fi）。'}));
    if(!d.addresses.length){
      phBody.appendChild(el('div','warnbox',{textContent:'没检测到局域网 IPv4 地址（可能没连 Wi-Fi，或网卡被禁用）。可把下面地址里的主机名手动换成电脑的局域网 IP。'}));
    }
    const tok=window.__CONSOLE_TOKEN__||'';
    for(const a of d.addresses){
      const url='http://'+a+':'+d.port+'/?token='+encodeURIComponent(tok);
      const inp=el('input',null,{type:'text',value:url,readonly:true,onclick:function(){this.select()}});
      const b=el('button','mini',{textContent:'复制',type:'button'});
      b.onclick=function(){copyText(url,b)};
      phBody.appendChild(el('div','lanrow',[inp,b]));
    }
    phBody.appendChild(el('div','qtip',{textContent:'地址里的 token 就是访问凭证，别截图发群、别存进公共收藏夹；用完把 host 改回 127.0.0.1 最省心。'}));
    phBody.appendChild(el('div','qtip',{textContent:'打开后建议在手机浏览器里「添加到主屏幕」，用起来跟 App 一样。'}));
  })();

  // ---- 发送器风控 ----
  const ar=el('div','card');
  ar.appendChild(secHead('发送器风控参数','restart'));
  ar.append(el('div','qtip',{textContent:'控制群消息发送速度与上限，防止被平台判定为刷屏。数值越小越保守。改动需重启生效（更细的图形化调参见「风控/节流」页，那部分保存即生效）。'}));
  const ars=cfg.antiRisk||(cfg.antiRisk={});
  const arRows=[
    ['随机延迟下限(毫秒)','minDelayMs'],['随机延迟上限(毫秒)','maxDelayMs'],
    ['群发言间隔(毫秒)','groupCooldownMs'],['用户发言间隔(毫秒)','userCooldownMs'],
    ['突发上限(条)','burstLimit'],['突发窗口(秒)','burstWindowSec'],
    ['每小时上限','hourlyCap'],['每日上限','dailyCap'],['每群每日上限','groupIdDailyCap'],
    ['单条最大字数','maxTextLength'],['重复文字间隔(毫秒)','sameTextGapMs'],
    ['自动闭口时长(分钟)','autoMuteMinutes'],['连败几次后闭口','autoMuteFailStreak'],
    ['队列上限','maxQueueLength'],['队列最长等待(毫秒)','maxQueueWaitMs'],
    ['发送超时(毫秒)','sendTimeoutMs'],['并发数','concurrency'],['惩罚倍率上限','maxPenalty'],
  ];
  arRows.forEach(function(x){ar.appendChild(numR(x[0],ars,x[1],''))});
  m.append(tag(ar,'st-ar','风控参数'));

  // ---- 保存区 ----
  const foot=el('div','card');
  foot.appendChild(secHead('保存','hot'));
  const msg=el('div','qtip',{textContent:'保存会写 config.json（自动备份旧版本到 data/backups/config.json/），并对 bot 段做热重载。'});
  const bar=el('div','row');
  const btn=el('button','act',{textContent:'💾 保存设置并热重载',type:'button'});
  const clrAll=el('button','mini',{textContent:'重新读取（放弃未保存改动）',type:'button'});
  bar.append(btn,clrAll);
  foot.append(bar,msg);
  clrAll.onclick=function(){state.config=null;render()};
  btn.onclick=async function(){
    btn.disabled=true;
    msg.textContent='保存中…';
    const secrets={};
    (state.secretInputs||[]).forEach(function(si){
      if(si.input.value!=='')secrets[si.path]=si.input.value;
    });
    // 「清空」按钮：显式把该字段置空并提交
    m.querySelectorAll('button[data-clear]').forEach(function(b){
      secrets[b.dataset.path]='';
    });
    try{
      const d=await api('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:cfg,secrets:secrets})});
      state.config=d.config||state.config;
      state.secretsSet=d.secretsSet||[];
      msg.textContent='已保存 '+nowStr()+'，bot 段已热重载（主人：'+((state.config.bot&&state.config.bot.adminIds)||[]).join('、')+'）。带「需重启生效」的项请重启客户端。';
      alert('设置已保存。带「需重启生效」的部分需要重启客户端。');
    }catch(e){
      msg.textContent='保存失败：'+e.message;
      alert('保存失败：'+e.message);
    }
    btn.disabled=false;
  };
  m.append(tag(foot,'st-foot','保存'));
  // 跳转栏放在最前面：分区是往上往下追加的，等全部建完才知道有哪些，
  // 所以只能在最后把 bar 插到 main 的第一个子节点前面。
  jumpBarFor(m,anchors);
}

`;
