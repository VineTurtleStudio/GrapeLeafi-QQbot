// console/page/07-tabs-builtins.js —— 内置指令页：开关表 + 「复制为预设 / 复制为关键字」按钮。
// 由 src/console/page.js 按文件名顺序拼接成完整页面，不要单独运行。
// 为什么编号 07：console-page.test.mjs 强制「单个分片不超过 500 行」，03 放不下就新开一片。
// 而 08-tabs-misc.js 带着 </script></body></html> 收尾，所以新分片必须排在它前面。
// render() 在 01-shell.js 里按函数名调用 renderBuiltins()，function 声明会提升，
// 因此「定义在 render() 之后」不影响调用，只影响拼接位置。
// 注意：本文件里的 \\ 是原本就有的字面反斜杠，别再删。
export default `
// 哪些内置指令可以用「预设指令 / 关键字回复」编辑器替代。
// 只有两类可以：
//   1) 纯文案随机类：预设的「多条回复随机」能完全替代，主人可以换成自己的文案池；
//   2) 群管理动作类：预设支持 {ban}/{unban}/{kick}/{banall}/{unbanall}/{recall} 动作占位符，能替代。
// 依赖真实数据的（签到/积分/抽卡/钓鱼/兑换/鱼塘/保底…）和仅主人的数据修正指令**不能**替代：
// 预设只能回固定文案，既读不到也改不了存档。给它们加按钮会让主人误以为「复制了就能用」，
// 所以一律不给，只在 title 里说明原因。
//
// 注意：这里的键必须是 BDEFS 的键，不是指令的中文名。
// BDEFS 里群管理那批用的是拼音键（mute/unmute/kick/banall/unbanall/recall），
// 写成「禁言」「踢出」会变成永远匹配不上的死配置——因为 renderBuiltins 遍历的是 BDEFS 的键。
// console-copy.test.mjs 有一条断言专门守这个。
const COPY_TPL={
  'mute':{reply:'{target} 已被禁言 {ban:10}',adminOnly:true,groupOnly:true,kw:false},
  'unmute':{reply:'{target} 已被解除禁言 {unban}',adminOnly:true,groupOnly:true,kw:false},
  'kick':{reply:'{target} 已被移出本群 {kick}',adminOnly:true,groupOnly:true,kw:false},
  'banall':{reply:'已开启全群禁言 {banall}',adminOnly:true,groupOnly:true,kw:false},
  'unbanall':{reply:'已关闭全群禁言 {unbanall}',adminOnly:true,groupOnly:true,kw:false},
  'recall':{reply:'已撤回 {recall}',adminOnly:true,groupOnly:true,kw:false},
  '运势':{reply:'{nick} 今日运势：{rand:1,100} 分',kw:true},
  '一言':{reply:'{rand:1,3}','randomReplies':['今天也要好好吃饭呀～','摸鱼要适度哦','记得喝水'],kw:true},
  '诗词':{reply:'{rand:1,3}','randomReplies':['好风凭借力，送我上青云。','会当凌绝顶，一览众山小。','长风破浪会有时，直挂云帆济沧海。'],kw:true},
  '冷知识':{reply:'{rand:1,3}','randomReplies':['章鱼有三颗心脏。','香蕉在植物学上属于浆果。','蜂蜜是唯一不会变质的天然食物。'],kw:true},
  '塔罗':{reply:'{rand:1,3}','randomReplies':['正位：今天运气不错，适合动手。','逆位：别急，缓缓再说。','愚者：先迈出第一步。'],kw:true},
  '今日人品':{reply:'{nick} 今日人品指数：{rand:1,100}',kw:true},
  '今日人设':{reply:'{nick} 今日人设：{rand:1,4}','randomReplies':['温柔但有原则的人','嘴上嫌弃实际很靠谱的人','今天也想偷懒的人','认真到有点较真的人'],kw:true},
  '土味情话':{reply:'{target}{rand:1,3}','randomReplies':['你是我的破壁人吗？','我想和你一起虚度时光，比如看一整天的云。','我把心放在你手里了，记得帮我保管。'],kw:true},
  '彩虹屁':{reply:'{target}{rand:1,3}','randomReplies':['你今天的气场简直两米八。','这世界上怎么会有你这么好的人。','你说话的样子特别有魅力。'],kw:true},
  '舔狗日记':{reply:'{rand:1,3}','randomReplies':['在吗？在的。我就是想知道你吃饭了没有。','我今天又路过了我们常走的那条路。','你要是觉得我不秒回，那是我在给你留打字时间。'],kw:true},
  '毒鸡汤':{reply:'{rand:1,3}','randomReplies':['你以为是幸运，其实是你自己努力了。','所有的努力都不会白费，只是时间问题。','别怕吃苦，怕的是吃苦的人没吃够。'],kw:true},
  '疯狂星期四':{reply:'{rand:1,3}','randomReplies':['疯狂星期四，v我50。','今天也是疯狂星期四，要我请客？','各位网友，今天疯狂星期四，我饿。'],kw:true},
  '热搜':{reply:'{rand:1,3}','randomReplies':['（示例）某地今日天气晴，最高 26℃。','（示例）这届年轻人已经开始整顿职场了。','（示例）研究发现：每天走一万步不一定更健康。'],kw:true},
  '回戳':{reply:'{nick} 回戳了你一下',kw:true},
  '戳一戳':{reply:'{nick} 戳了戳你',kw:true},
  '拍一拍':{reply:'{nick} 拍了拍你的头',kw:true},
  '捏一捏':{reply:'{nick} 捏了捏你的脸',kw:true},
  '时间':{reply:'现在是 {date} {time}',kw:false}
};
// 名字被占用时自动加后缀，避免复制出一条 /xxx 冲突指令
function uniqPresetName(base){
  const used=new Set((state.content.presets.commands||[]).map(c=>c&&c.name).filter(Boolean));
  if(!used.has(base))return base;
  for(let i=2;i<200;i++){const n=base+'·改'+i;if(!used.has(n))return n}
  return base+'·改';
}
function uniqKeyword(m){
  const used=new Set((state.content.presets.keywords||[]).flatMap(k=>k&&(k.matches&&k.matches.length?k.matches:[k.match])).filter(Boolean).map(String));
  if(!used.has(m))return m;
  for(let i=2;i<200;i++){const n=m+String(i);if(!used.has(n))return n}
  return m+'2';
}
// 把 BDEFS 的一条拆成表格的一行。抽成函数是因为现在要按分类分组渲染，
// 同一行不能在每个分类分支里各写一遍——复制按钮那套逻辑抄一次就会走形。
function builtinRow(key){
  const d=BDEFS[key];
  const cfg=state.content.builtins[key]||(state.content.builtins[key]={});
  const tr=el('tr');
  const en=el('input','',{type:'checkbox',checked:cfg.enabled!==false});
  const cd=el('input','',{type:'number',value:(cfg.cooldownSec>0?cfg.cooldownSec:3),style:'width:64px'});
  const ad=el('input','',{type:'checkbox',checked:cfg.adminOnly===undefined?!!d.admin:cfg.adminOnly});
  const pr=el('input','',{type:'checkbox',checked:cfg.allowPrivate===undefined?!d.groupOnly:cfg.allowPrivate});
  const gr=el('input','',{type:'text',value:(cfg.groups||[]).join(','),style:'width:120px'});
  const dc=el('span','',{textContent:d.desc});
  en.onchange=()=>{if(en.checked)delete cfg.enabled;else cfg.enabled=false};
  cd.oninput=()=>cfg.cooldownSec=+cd.value;
  ad.onchange=()=>cfg.adminOnly=ad.checked; pr.onchange=()=>cfg.allowPrivate=pr.checked;
  gr.oninput=()=>cfg.groups=gr.value.split(',').map(s=>s.trim()).filter(Boolean);
  // 「改成自己的」这一列
  const tpl=COPY_TPL[key];
  const box=el('div');
  if(tpl){
    const bp=el('button','mini',{textContent:'复制为预设'});
    bp.title='生成一条预设指令，文案和权限已按原指令预填，可随意改';
    bp.onclick=()=>{
      const entry={name:uniqPresetName(key+'·改'),reply:tpl.reply,cooldownSec:5,adminOnly:!!tpl.adminOnly,ownerOnly:false,groups:[],allowPrivate:!tpl.groupOnly};
      if(tpl.randomReplies)entry.randomReplies=tpl.randomReplies.slice();
      state.content.presets.commands.unshift(entry);
      // 顺手把原内置关掉，否则两条同时触发，主人会以为「复制了没生效」
      cfg.enabled=false;en.checked=false;
      curTab='presets';render();
      setSaveStatus('已复制为预设指令「'+entry.name+'」，请改文案后点保存；原「'+d.label+'」已自动关闭，记得一起保存');
    };
    box.append(bp);
    if(tpl.kw){
      const bk=el('button','mini',{textContent:'复制为关键字'});
      bk.title='生成一条关键字回复，用关键词触发（适合把「彩虹屁」改成别的方式叫它）';
      bk.onclick=()=>{
        const m=uniqKeyword(key);
        const k={matches:[m],reply:tpl.reply,cooldownSec:60,adminOnly:false,ownerOnly:false,groups:[]};
        if(tpl.randomReplies)k.randomReplies=tpl.randomReplies.slice();
        state.content.presets.keywords.unshift(k);
        cfg.enabled=false;en.checked=false;
        curTab='keywords';render();
        setSaveStatus('已复制为关键字「'+m+'」，请改文案后点保存；原「'+d.label+'」已自动关闭，记得一起保存');
      };
      box.append(bk);
    }
  }else{
    const na=el('span','',{textContent:'—'});
    na.style.color='var(--muted,#888)';
    na.title='这条指令依赖真实数据（存档/抽卡/钓鱼等）或属于仅主人的数据修正，没法用预设指令替代。要改它得改代码。';
    box.append(na);
  }
  [el('b',null,{textContent:d.label}),en,cd,ad,pr,gr,dc,box].forEach(x=>{const td=el('td');td.append(x);tr.append(td)});
  return tr;
}
// 内置指令一共 79 条，一次性铺开根本没法找。分类表只有 brain-registry.js 的
// CMD_CATEGORY 一份定义（由 /api/content 下发），所以这里不抄第二份——
// 抄一份的话，加了新指令忘了同步，症状是「指令在列表里不见了」，最难查。
// 未分类的排在最后并单独标出来：那是 CMD_CATEGORY 漏登记的信号，不该被悄悄混进别的类。
function builtinGroups(){
  const cat=state.cmdCategory||{};
  const order=[];
  const bucket={};
  for(const k of Object.keys(cat))if(!order.includes(cat[k]))order.push(cat[k]);
  for(const key of Object.keys(BDEFS)){
    const c=cat[key]||'未分类';
    if(!bucket[c]){bucket[c]=[];if(!order.includes(c))order.push(c)}
    bucket[c].push(key);
  }
  if(bucket['未分类'])order.splice(order.indexOf('未分类'),1),order.push('未分类');
  return order.map(c=>({cat:c,keys:bucket[c]||[]}));
}
function renderBuiltins(m){
  m.append(el('p',null,{textContent:'内置指令开关与参数：可整体关闭想屏蔽的功能、调整每条指令的冷却、是否需要管理员、是否允许私聊触发、限定可在哪些群使用（留空=全部）。「仅主人·隐藏」的权限管理指令几位一般不动。'}));
  m.append(el('p',null,{textContent:'想改内置指令的文案或逻辑：用「复制为预设」把它变成一条你自己的预设指令，再把原指令在这里关掉，避免两条同时触发。复制后请到「预设指令」页改文案并点保存。依赖真实数据的指令（签到/积分/抽卡/钓鱼等）无法用预设替代，因为预设读不到存档。'}));
  const groups=builtinGroups();
  // 顶部吸顶跳转栏：分类多了以后不用一页页滚
  jumpBarFor(m,groups.map((g,i)=>({id:'bicat'+i,label:g.cat+' '+g.keys.length})));
  groups.forEach((g,gi)=>{
    const t=el('table');
    const tr1=el('tr');['功能','启用','冷却(秒)','仅管理员','私聊可用','限定群','说明','改成自己的'].forEach(h=>tr1.append(el('th',null,{textContent:h})));t.append(tr1);
    g.keys.forEach(key=>t.append(builtinRow(key)));
    m.append(anchor(card(g.cat,t),'bicat'+gi));
  });
}
`;
