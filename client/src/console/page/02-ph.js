// console/page/02-ph.js —— 占位符与模板工具：{args}/{rand}/{at} 渲染、搜索框、分页提示、时间输入
// 由 src/console/page.js 按固定顺序拼接进 PAGE；请勿单独运行。
// 注意：本文件里的 \\ 是原本就有的字面反斜杠，别再删。
export default `function phInto(ta,txt){
  const s=ta.selectionStart!=null?ta.selectionStart:ta.value.length;
  const e=ta.selectionEnd!=null?ta.selectionEnd:s;
  ta.value=ta.value.slice(0,s)+txt+ta.value.slice(e);
  ta.focus();
  try{ta.setSelectionRange(s+txt.length,s+txt.length)}catch{}
  ta.dispatchEvent(new Event('input'));
}
const PHPH={
  '{args}':'全部参数，空格分开。例：用户发「/掷骰 20」→ {args} 变成 20',
  '{1}':'第 1 个参数。例：用户发「/禁言 @某人 10分钟」→ {1} 变成 10分钟',
  '{rand:1,100}':'1~100 之间随机一个整数，开头结尾数字可以自己改',
  '{at}':'打字回复末尾会变成 @触发指令的人',
  '{target}':'@这条消息里被你@的那个人（做「灌满 @某人」这类指令）',
  '{targetqq}':'被@的人的纯 QQ 号，没人被@则为空',
  '{qq}':'发送者的 QQ 号',
  '{nick}':'发送者在群里的昵称',
  '{gid}':'当前群号',
  '{date}':'今天的日期，例如 2026-09-24',
  '{time}':'现在的时间，例如 14:30',
  '{role}':'发送者在机器人眼里的身份：主人/管理员/群主/群管理/成员',
  '{ifadmin:是|否}':'条件占位：发送者是 主人/管理员/群主/群管理 时输出「|」前的文字，否则输出「|」后的文字（可只写一个分支，如 {ifadmin:欢迎管理员}）',
  '{ifowner:是|否}':'条件占位：只看发送者是不是 主人(config.json 的 adminIds)，是则输出「|」前，否则输出「|」后',
  '{ban}':'动作占位：禁言这条消息里被你@的那个人(默认10分钟)；仅 主人/管理员/群主/群管理 生效，普通人不执行、文字也会被清掉',
  '{ban:10分钟}':'动作占位：禁言目标指定时长，可写 {ban:5分钟} {ban:1小时} {ban:2天} 或 {ban:120}(秒)',
  '{unban}':'动作占位：解除被你@那个人的禁言',
  '{kick}':'动作占位：把被你@的那个人移出群(需 bot 是群管理)',
  '{banall}':'动作占位：开启 本群全体禁言（仅管理员执行，不需要@人）',
  '{unbanall}':'动作占位：解除本群全体禁言（仅管理员执行）',
  '{recall}':'动作占位：撤回「回复了的那条消息」。用法：回复某条消息再发触发指令，bot 会把被回复的那条删掉',
  '{panel}':'卡片按钮：回复里加上它，会额外附带一张官方按钮卡片（签到/钓鱼/运势/等级）。协议端不支持时按钮区域不显示',
  '{signday}':'签到图：回复里加上它，会对触发者执行签到，并附带一张实时生成的签到卡（头像/等级/积分/连续天数），图片不落盘即发即弃',
};
const PH_TOKENS=['{args}','{1}','{rand:1,100}','{at}','{target}','{targetqq}','{qq}','{nick}','{gid}','{date}','{time}','{role}','{ifadmin:是|否}','{ifowner:是|否}','{ban}','{ban:10分钟}','{unban}','{kick}','{banall}','{unbanall}','{recall}','{panel}','{signday}'];
function phButtons(ta){
  const row=el('div','ph');
  PH_TOKENS.forEach((tok)=>{const b=el('button',null,{textContent:tok});b.title=PHPH[tok]||'';b.onclick=()=>phInto(ta,tok);row.append(b)});
  return row;
}
function previewOf(t){
  if(!t)return '(空：发指令时机器人只发图片/接口，或什么都不发)';
  return String(t)
    .replace(/\\{rand:(-?\\d+),(-?\\d+)\\}/g,'(a~b之间的随机整数)')
    .replace(/\\{args\\}/g,'20')
    .replace(/\\{(\\d+)\\}/g,'(第$1个参数)')
    .replace(/\\{target\\}/g,'[@被@的人]')
    .replace(/\\{targetqq\\}/g,'(被@者的QQ)')
    .replace(/\\{at\\}/g,'[@发送者]')
    .replace(/\\{qq\\}/g,'(发送者QQ)')
    .replace(/\\{nick\\}/g,'(发送者昵称)')
    .replace(/\\{gid\\}/g,'(群号)')
    .replace(/\\{date\\}/g,'2026-09-24')
    .replace(/\\{time\\}/g,'14:30')
    .replace(/\\{if(?:admin|owner):([^}]*)\\}/g,(m,c)=>{const i=c.indexOf('|');return '['+(i>=0?c.slice(0,i):c)+'｜'+(i>=0?c.slice(i+1):'')+']'})
    .replace(/\\{role\\}/g,'(主人/管理员/群主/群管理/成员)')
    .replace(/\\{ban(?::([^}]*))?\\}/g,(m,c)=>'(动作:禁言被@者'+(c?' '+c:' 10分钟')+')')
    .replace(/\\{unban\\}/g,'(动作:解禁被@者)')
    .replace(/\\{kick\\}/g,'(动作:踢出被@者)')
    .replace(/\\{banall\\}/g,'(动作:全体禁言开启)')
    .replace(/\\{unbanall\\}/g,'(动作:解除全体禁言)')
    .replace(/\\{recall\\}/g,'(动作:撤回被回复的消息)')
    .replace(/\\{panel\\}/g,'(卡片:签到/钓鱼/运势/等级按钮)')
    .replace(/\\{signday\\}/g,'(图片:实时签到卡)');
}
function makePreview(getTextFn){
  const pv=el('div','pv');
  const refresh=()=>{pv.textContent='效果预览：'+previewOf(getTextFn())};
  return {pv,refresh};
}
function searchBox(oninput){
  const s=el('input','',{type:'text',placeholder:'搜索…',style:'width:320px'});
  s.dataset.nosave='1';
  s.oninput=oninput;
  return s;
}
function pagHint(){
  return el('p','qtip',{textContent:'提示：点击卡片标题可折叠/展开；顶部搜索框过滤；修改任意输入后自动保存（2.5 秒无输入即保存并重载）。'});
}
function applySearch(sel,cls){
  const q=((''+(document.querySelector(sel)||{}).value)||'').toLowerCase();
  document.querySelectorAll(cls).forEach((cd)=>{
    const nm=((cd.querySelector('h2')||{}).textContent||'').replace(/^[▸▾]\\s*/,'').replace(/^#\\d+　/,'').toLowerCase();
    const rest=cd.textContent.replace(/^[▸▾]\\s*#\\d+　/,'').toLowerCase();
    cd.hidden=!(q===''||nm.includes(q)||rest.includes(q));
  });
}
function timeInputs(entry){
  const tr=(entry.timeReplies||{});
  const mk=(k,p)=>{const i=el('input','',{type:'text',value:tr[k]||'',placeholder:p,style:'width:78px'});return i;};
  const tm=mk('morning','早');const na=mk('afternoon','午');const ev=mk('evening','晚');const nt=mk('night','夜');
  [tm,na,ev,nt].forEach(x=>x.oninput=()=>{const o={};if(tm.value)o.morning=tm.value;if(na.value)o.afternoon=na.value;if(ev.value)o.evening=ev.value;if(nt.value)o.night=nt.value;entry.timeReplies=Object.keys(o).length?o:undefined;});
  return [tm,na,ev,nt];
}
`;
