// console/page/03-tabs-content.js —— 内容类 tab：help / presets / keywords / builtins(含 BDEFS) / groups
// 由 src/console/page.js 按固定顺序拼接进 PAGE；请勿单独运行。
// 注意：本文件里的 \\ 是原本就有的字面反斜杠，别再删。
export default `function renderHelp(m){
  const P=(t)=>el('p',null,{textContent:t});
  const U=(items)=>{const u=el('ul',null);u.style.paddingLeft='22px';items.forEach((t)=>u.append(el('li',null,{textContent:t})));return u};
  const H3=(t)=>{const h=el('h3',null,{textContent:t});h.style.margin='14px 0 4px';return h};

  m.append(el('p','qtip',{textContent:'GrapeLeafi 机器人使用说明书（本页独立于其他设置页，只读）'}));

  const c1=card('一、怎么让机器人理你（三种触发方式）',(()=>{const w=el('div');w.append(
    H3('1. 群聊里发 /指令'),
    P('直接打斜杠：/早上好、/运势、/钓鱼、/掷骰 这样，后面跟参数用空格分开。'),
    H3('2. 群聊里 @ 机器人或喊它的昵称'),
    P('@葡萄 早安 ——效果和“/早安”一样，可以省略斜杠。机器人被点名后，后面的话如果不是命令，就交给 AI 陪你聊（未配置 AI 时用兜底话术）。'),
    H3('3. 关键字自动接话'),
    P('群里出现你配置的关键字就自动回复，不需要 @。默认机器人“自由回复”，陌生的普通聊天不接话。'),
    H3('私聊'),
    P('只有白名单里的人能聊；非指令内容交给 AI。机器人不会主动找别人私聊。')
  );return w})());
  m.append(c1);

  const builtinRows=[
    ['/ping','存活与延迟','所有人'],
    ['/help 或 /帮助','按类型分组列出指令（每类只列几条）；/help 积分、/help 文娱 可看某一类型的全部说明','所有人'],
    ['/运势','今日运势（每人每天一次）','所有人'],
    ['/抽签','从配置的签图目录随机抽一张图发送','所有人(带冷却)'],
    ['/钓鱼  /鱼塘  /卖鱼','钓鱼小游戏，仓库和金币存在 games.json','所有人'],
    ['/签到','每天一次，得积分升级攒连续天数（连续越久给越多，封顶 +20），同时赠送光玉；回复 文字+实时生成的签到卡','所有人'],
    ['/等级','查看自己的 等级/积分/光玉/连续/累计天数 档案卡','所有人'],
    ['/help 积分','积分与等级规则：等级只看「累计获得」的积分，兑换花掉余额不影响升级，抽卡只扣光玉','所有人'],
    ['/面板','发一张带按钮的官方卡片，点按钮就能签到/钓鱼/运势/等级；协议端不支持时自动改用文字列表','所有人'],
    ['/我的 或 /信息','查看个人资料 / 群成员资料与头衔','所有人'],
    ['/群信息','查看群名称/人数/群主','所有人'],
    ['/头像','发送某人(或自己)的头像图片','所有人'],
    ['/禁言 @某人 [时长]','群管理。时长可用 秒/分/时/天/周','群管理员/群主/主人'],
    ['/解禁  /踢出  /全体禁言  /解除全体禁言  /撤回','群管理','群管理员/群主/主人'],
    ['/给予 @某人 权限   /剥夺   /权限','管理 bot 管理员(隐藏指令)','仅主人'],
  ];
  const c2=card('二、内置指令速查',(()=>{const w=el('div');const t=el('table');[['指令','作用','谁能用']].concat(builtinRows).forEach((r)=>{const tr=el('tr');r.forEach((x)=>tr.append(el('td',null,{textContent:x})));t.append(tr)});w.append(t);return w})());
  m.append(c2);

  const c3=card('三、预设指令（=你的自定义指令）与占位符全解',(()=>{const w=el('div');w.append(
    P('在“预设指令”页里每条命名后，群里就能用 /名字 触发。回复内容可以直接写字，也可以插入“占位符”让它变活。回复框上方的浅蓝小按钮点击即可插入，下面实时预览效果。'),
    H3('占位符全表（复制即用）'),
    (()=>{const t=el('table');[
      ['占位符','变成什么','例子'],
      ['{args}','用户输入的全部参数(空格隔开)','发「/掷骰 20」→ {args}=20'],
      ['{1} ~ {9}','第 1~9 个参数(其余数字同理)','「/禁言 @某人 10分钟」→ {1}=10分钟'],
      ['{rand:起,止}','区间随机整数，可负数，两边数字随意改','{rand:1,6}→骰子；{rand:-3,3}'],
      ['{nick}','发送者的群昵称(无昵称=QQ号)','{nick} 来了'],
      ['{qq}','发送者的 QQ 号','卡片：{qq}'],
      ['{gid}','当前群号(私聊为空)','群号:{gid}'],
      ['{at}','变成 @发送者 的@段','已收到 {at}'],
      ['{target}','变成 @这条消息里被你@的人(没有则留空)','{target} 已就位（配合「注入 @某人」）'],
      ['{targetqq}','被@者的纯 QQ 号(没有则留空)','编号:{targetqq}'],
      ['{date}','今天的日期','{date} 签到'],
      ['{time}','当前时间(时:分)','现在 {time}'],
      ['{role}','发送者身份：主人/管理员(被授予)/群主/群管理/成员','{role} 你好'],
      ['{ifadmin:A|B}','条件占位：发送者 为 主人/被授予管理员/群主/群管理 时输出 A，否则输出 B(可只写 A)','{ifadmin:欢迎领导|普通成员路过}'],
      ['{ifowner:A|B}','条件占位：只看是否 主人(config.json adminIds)，是则 A，否则 B','{ifowner:主人专用|来访者}'],
      ['{ban}','动作占位：禁言这条消息里被你@的人(默认10分钟)；仅管理员生效','{ban} 或 {ban:5分钟} {ban:1小时} {ban:2天} {ban:120}(秒)'],
      ['{unban}','动作占位：解除被你@那个人的禁言','{unban}'],
      ['{kick}','动作占位：把被你@的那个人移出群(需 bot 是群管理)','{kick}'],
      ['{banall}','动作占位：开启本群全体禁言(仅管理员，无需@人)','{banall}'],
      ['{unbanall}','动作占位：解除本群全体禁言(仅管理员)','{unbanall}'],
      ['{recall}','动作占位：撤回你「回复了的那条消息」：先回复目标消息再发触发指令','{recall}'],
      ['{panel}','卡片按钮：回复里加上它，会额外附一张官方按钮卡片(签到/钓鱼/运势/等级)','今日菜单 {panel}'],
      ['{signday}','签到图：对触发者执行签到并附一张实时生成的签到卡(头像/等级/积分/连续天数)，图片即发即弃不落盘','欢迎 {nick} {signday}'],
    ].forEach((r)=>{const tr=el('tr');r.forEach((x)=>tr.append(el('td',null,{textContent:x})));t.append(tr)});w.append(t)})(),
    H3('几个现成例子（照抄改改就能用）'),
    U([
      '掷骰：回复写「{nick} 掷出 {rand:1,6} 点」',
      '算命：回复写「{nick} 今天运势 {rand:1,100} 分」',
      '灌水@：回复写「已成功灌注 {target} {rand:50,500} 毫升」',
      '自动回复参数：回复写「你要的是 {1} 吗？{args}」',
    ]),
    P('条件占位的语法：{ifadmin:是管理员时显示|否则显示}，用「|」把两种情况的文字隔开；只写一半也可以（如 {ifadmin:欢迎管理员} 表示普通人不显示任何字）。{role} 的身份按 主人/被主人授予管理员/群主/群管理/成员 顺序取最高档。'),
    P('动作占位符（{ban} {unban} {kick} {banall} {unbanall} {recall}）：写在回复里，发送后除文字外还会执行操作；只在群聊生效，且只有 主人/被授予管理员/群主/群管理 才会真正执行——普通成员触发时只会收到文字、不执行动作。{ban} {unban} {kick} 作用于这条消息里被@的人；{banall} {unbanall} 作用于全群(无需@人)；{recall} 需要先「回复」一条消息再触发，会把被回复的那条删掉（需 bot 是该群管理员）。占位符本身不会显示在消息里。'),
    P('卡片与签到：{panel} 让回复自带官方按钮卡片(签到/钓鱼/运势/等级)，协议端不支持按钮时会自动退化为纯文字；{signday} 让回复对触发者执行签到并附带一张实时生成的签到卡(取头像/等级/积分/连续天数)，图片即发即弃、不落任何缓存。指令 /签到 /等级 /面板 同理。'),
    P('更多设置：随机多条(每行一条，随机挑一条回)、分时段文案(早/午/晚/夜各写一条)、图片回复、冷却秒数、仅管理员、限定群。复杂逻辑指令继续用代码内建，一般人不需覆盖。')
  );return w})());
  m.append(c3);

  const c4=card('四、关键字回复',(()=>{const w=el('div');w.append(
    P('在“关键字回复”页配置。命中就自动接话，支持这些玩法：'),
    U([
      '多个关键字：一个回复可以对应多个词，输入框里一行写一个，任一中任一词都触发。',
      '匹配方式（勾选）：默认“包含”(消息里出现这个词就触发)；“整句”=消息必须原样等于这个词；还可以勾“正则”用正则表达式。',
      '仅@时：只在被 @/喊昵称/私聊时触发，不会蹭普通聊天。',
      '排除词：空格分隔，消息里出现任一词就不触发。',
      '仅管理员：勾选后只有 主人/群主/群管理/被主人「/给予 权限」的人 才能触发，普通成员触发会被忽略（会继续尝试匹配下一条普通关键字）。',
      '随机多条 / 分时段 / 图片 / 占位符：和预设指令一样支持。',
      '图库目录（随机抽本地图）：填目录后每次命中从整个图库随机抽一张发出来，递归扫全部子文件夹，支持 png/jpg/jpeg/gif/webp；可填多个目录（分号或换行分隔）混在一起随机，适合“角色图库”“作品图库”分开建两条关键字。建议直接按 作品\\\\角色 建子文件夹分类，拖进来就生效，不用数据库。填了图库目录就以它为准，图片框可以留空。',
      '文件列表缓存 60 秒，新放的图最多等一分钟；卡片上有“扫描预览”可以先看扫到几张图。抽中的图会压到 1080px 宽后以 base64 内联发送。',
      '“本群指令”也存这页，标记“本群”、限定群=该群。',
    ])
  );return w})());
  m.append(c4);

  const c5=card('五、群内自建指令（每个群分开）',(()=>{const w=el('div');w.append(
    P('群成员可以现场让机器人学习新回复，不需要开控制台：'),
    U([
      '添加：@机器人的情况下发「添加指令 名字 回复内容」。例：@葡萄 添加指令 寄寄 寄寄富，之后群里发“寄寄”就回“寄寄富”。',
      '查看：「本群指令」（也可说 查询指令/自定义指令/群指令），列出本群已有哪些。',
      '删除：「删除指令 名字」（也可说 移除指令/忘记）。',
      '别名：新增指令=添加指令，教我=添加指令，忘记=移除指令。',
      '限制：每人每 10 秒 1 条、每天最多 20 条；管理员不限。',
      '回复内容同样支持占位符，如「{nick} 你好呀」。',
    ])
  );return w})());
  m.append(c5);

  const c6=card('六、HTTP 接口指令（进阶）',(()=>{const w=el('div');w.append(
    U([
      '在预设指令里勾“启用 HTTP 接口”并填 URL，该指令就改成把请求发给你的接口处理，把接口返回当回复。',
      '请求体会带 command/user_id/group_id/nickname/text/images[]/date/time；可配 POST 或 GET、超时、Authorization Token。',
      '返回纯文本→直接回复；返回 JSON 数组或 {message}/{messages:[]} → 每条一条消息，多条默认合并转发。',
      '适用：AI 画图、翻译、OCR、你自己写的脚本等外部服务；勾“仅管理员”可当远程管理入口。',
    ])
  );return w})());
  m.append(c6);

  const c7=card('七、风控与深夜静默（为什么它有时不吭声）',(()=>{const w=el('div');w.append(
    U([
      '机器人对“同一个人/同一群”的回复是排队串行的，且每条之间留随机间隔，这是为了防腾讯风控，别因此觉得卡。',
      '深夜静默：默认 23:30~06:30 不主动回群消息（可配豁免群），但被 @点名仍会回。',
      '软静默：连续几次发送失败会自动短暂闭嘴并加大退避，状态和日志页会有显示和“解除软静默”按钮。',
      '每日/每小时/每群有发送上限，超过的部分排队等，超出每日上限会丢弃。',
    ])
  );return w})());
  m.append(c7);

  const c8=card('八、本控制台使用技巧',(()=>{const w=el('div');w.append(
    U([
      '自动保存：任何修改后停手 2.5 秒就自动保存并生效（顶栏显示状态），无需手动保存。',
      '列表太长：用左上搜索框过滤；点卡片标题可折叠/展开。',
      '新添加的指令/关键字出现在列表最顶部，方便立刻修改。',
      '占位符不会？点恢复框上方浅蓝按钮，悬停按钮有中文说明，下方“效果预览”即时演示。',
      '改乱了想恢复：手动编辑 client/data/content.json 后可点“立即保存并重载”。',
      '手机上也能用：页面已适配窄屏（表单竖排、宽表格左右滑动、按钮加大）。用手机打开控制台的方法见下一节。',
    ])
  );return w})());
  m.append(c8);

  const c9=card('九、用手机打开控制台 / 想分享给别人怎么办',(()=>{const w=el('div');w.append(
    P('在「设置」页找到【手机 / 局域网访问】那一块，它会直接告诉你现在能不能在手机上打开。'),
    H3('想在自己手机上管理机器人'),
    U([
      '条件一：把「设置」页【控制台自身】里的「监听地址 host」从 127.0.0.1 改成 0.0.0.0。',
      '条件二：在同一处填一个「访问 token」（自己编一串别人猜不到的字符）。这两个条件缺一个，手机都打不开——这是故意的：不设 token 就开放等于把后台裸露在同网段，客户端会直接拒绝启动。',
      '保存后重启客户端，回到【手机 / 局域网访问】那块，它会列出本机所有局域网地址和可直接复制的完整链接（已带 token）。',
      '手机和电脑连同一个 Wi-Fi，在手机浏览器里打开那个链接；建议「添加到主屏幕」，用起来跟 App 一样。',
      '用完把 host 改回 127.0.0.1，最省心。',
    ]),
    H3('想分享给别人用'),
    P('不要把控制台分享出去。它是只给主人用的后台：能改全部配置、调主人 QQ 号、还能读本机图片文件。正确做法是把机器人拉进对方的群，或在「群门控」里把对方的群加进允许列表，对方直接用 QQ 和机器人聊天即可，全程不接触控制台。'),
    H3('安全提醒'),
    U([
      '别做端口转发把控制台暴露到公网，也别把 token 发给别人、贴群里、存进公共收藏夹。',
      '异地访问请走 VPN / Tailscale，不要直接暴露端口。',
      '同一来源连着输错 token 8 次会被锁 2 分钟，这是防暴力猜的。',
      '页面响应带了 no-referrer / 禁止被 iframe 嵌套 / 禁止 sniffing；地址栏里的 ?token= 会在页面加载后自动抹掉，避免留在浏览器历史里。',
    ])
  );return w})());
  m.append(c9);
}
function renderPresets(m){
  m.append(pagHint());
  m.append(el('p',null,{textContent:'预设指令：群里或私聊发 /指令名（如 /早安）触发，不经过 AI。指令太长时可以先 @ 机器人喊名字，例如「@葡萄 早安」就不用打 /。'}));
  m.append(el('p',null,{textContent:'怎么把回复变“活”：在回复框里点下面的浅蓝小按钮就能插入对应内容——比如点 {rand:1,100} 就是插一个“随机数”，点 {args} 就是“用户输入的后半句话”。填好后最下面会实时显示「效果预览」，对着预览改就行。'}));
  m.append(el('p',null,{textContent:'高级（可选·HTTP 接口）：启用后该指令不再用上面的回复，而是把你的参数/消息发给填写的网址，把网址返回的内容当回复发出。多条款返回时默认合并成一条转发；勾「仅管理员」后只有主人能用。'}));
  const tools=el('div','row');
  const add=el('button','mini',{textContent:'+ 添加指令'});
  add.onclick=()=>{state.content.presets.commands.unshift({name:'新指令',reply:'回复内容',cooldownSec:5,adminOnly:false,groups:[],allowPrivate:true,api:{enabled:false,url:'',method:'POST',send:'args'}});render()};
  const tpl=(label,obj)=>{const b=el('button','mini',{textContent:label});b.onclick=()=>{state.content.presets.commands.unshift(obj);render()};return b};
  const sb=searchBox(()=>{applySearch('#qp','#main .cmdcard')});sb.id='qp';
  tools.append(add,
    tpl('+ 掷骰模板',{name:'掷骰',desc:'掷 N 面骰子',reply:'{nick} 掷出 {rand:1,6} 点',cooldownSec:5,adminOnly:false,groups:[],allowPrivate:true}),
    tpl('+ 灌注@模板',{name:'灌满',desc:'@某人灌注',reply:'已成功灌注 {target} {rand:50,500} 毫升',cooldownSec:30,adminOnly:false,groups:[],allowPrivate:true}),
    tpl('+ 接口指令模板',{name:'新接口',desc:'HTTP 接口指令',reply:'',cooldownSec:5,adminOnly:false,groups:[],allowPrivate:true,api:{enabled:true,url:'http://',method:'POST',send:'args',timeoutSec:25,merge:true}}),
    sb);
  m.append(tools);
  const box=el('div');
  const cmds=state.content.presets.commands;
  const q=(box._q||'');
  cmds.forEach((c,i)=>{
    const hay=((c.name||'')+' '+(c.reply||'')+' '+((c.aliases||[]).join(' '))).toLowerCase();
    if(q&&!hay.includes(q))return;
    const cd=el('div','card cmdcard');
    cd.append(el('h2',null,{textContent:'#'+(i+1)+'　'+(c.name||'未命名')}));
    if(folded.has(i))cd.classList.add('folded');
    cd.querySelector('h2').textContent=(folded.has(i)?'▸ ':'▾ ')+cd.querySelector('h2').textContent;
    cd.querySelector('h2').onclick=()=>{foldCard(cd,i,true);setSaveStatus('已展开/折叠 #'+(i+1))};
    const r0=el('div','row');
    const nm=el('input','',{type:'text',value:c.name,placeholder:'指令名，如 掷骰'});nm.style.width='120px';
    const al=el('input','',{type:'text',value:(c.aliases||[]).join(','),placeholder:'别名(逗号分隔，选填)',style:'width:150px'});
    const de=el('input','',{type:'text',value:c.desc||'',placeholder:'帮助里的简介(选填)',style:'width:220px'});
    r0.append(el('label',null,{textContent:'指令名/别名/简介'}),nm,al,de);cd.append(r0);
    const r2=el('div','row');r2.append(el('label',null,{textContent:'回复(默认/兜底)  ← 试试点下面的占位按钮'}));
    const rp=el('textarea',null);rp.value=c.reply||'';rp.style.minHeight='36px';r2.append(phButtons(rp),rp);cd.append(r2);
    const r3=el('div','row');r3.append(el('label',null,{textContent:'随机多条回复(每行一条，选填)'}));
    const rrTa=el('textarea',null);rrTa.value=(c.randomReplies||[]).join('\\n');r3.append(rrTa);cd.append(r3);
    const pvCtx=makePreview(()=>{const lines=(rrTa.value||'').split('\\n').map(s=>s.trim()).filter(Boolean);return lines[0]||rp.value});
    cd.append(pvCtx.pv);
    const r4=el('div','row');r4.append(el('label',null,{textContent:'图片(本地路径或 http，选填)'}));
    const img=el('input','',{type:'text',value:c.image||'',style:'width:100%'});r4.append(img);cd.append(r4);
    const r5=el('div','row');r5.append(el('label',null,{textContent:'分时段文案'}));
    const [tm,na,ev,nt]=timeInputs(c);r5.append(tm,na,ev,nt);cd.append(r5);
    cd.append(apiBlock(c));
    const r6=el('div','row');
    const cdS=el('input','',{type:'number',value:c.cooldownSec||0,style:'width:70px'});
    const ad=el('input','',{type:'checkbox',checked:!!c.adminOnly});
    const ow=el('input','',{type:'checkbox',checked:!!c.ownerOnly});
    const pk=el('input','',{type:'text',value:c.permKey||'',style:'width:110px',placeholder:'授权项(可空)'});
    pk.title='填了之后，被 /授权 授予这一项的人也能用（对应内置指令的 perms 机制）';
    const pr=el('input','',{type:'checkbox',checked:c.allowPrivate!==false});
    const gr=el('input','',{type:'text',value:(c.groups||[]).join(','),style:'width:170px',placeholder:'限定群(空=全部)'});
    const del=el('button','mini danger',{textContent:'删除'});
    r6.append(el('label',null,{textContent:'冷却(秒)'}),cdS,el('label',null,{textContent:'仅管理员'}),ad,el('label',null,{textContent:'仅主人'}),ow,el('label',null,{textContent:'授权项'}),pk,el('label',null,{textContent:'私聊可用'}),pr,el('label',null,{textContent:'限定群'}),gr,del);
    cd.append(r6);
    nm.oninput=()=>c.name=nm.value.trim();al.oninput=()=>c.aliases=al.value.split(',').map(s=>s.trim()).filter(Boolean);de.oninput=()=>c.desc=de.value.trim()||undefined;
    rp.oninput=()=>{c.reply=rp.value;pvCtx.refresh()};
    rrTa.oninput=()=>{c.randomReplies=rrTa.value.split('\\n').map(s=>s.trim()).filter(Boolean);pvCtx.refresh()};
    img.oninput=()=>{c.image=img.value.trim()||undefined};
    cdS.oninput=()=>c.cooldownSec=+cdS.value;
    ad.onchange=()=>{c.adminOnly=ad.checked;if(ad.checked)ow.checked=false,ow.onchange()};
    ow.onchange=()=>{c.ownerOnly=ow.checked;if(ow.checked)ad.checked=false};
    pk.oninput=()=>c.permKey=pk.value.trim()||undefined;
    pr.onchange=()=>c.allowPrivate=pr.checked;
    gr.oninput=()=>c.groups=gr.value.split(',').map(s=>s.trim()).filter(Boolean);
    del.onclick=()=>{deletedIds.push(identOf(state.content.presets.commands[i],'commands'));state.content.presets.commands.splice(i,1);render()};
    box.append(cd);
  });
  const w=el('div');w.append(box);
  m.append(card('预设指令',w));
}
function apiBlock(c){
  const api=c.api||(c.api={enabled:false,url:'',method:'POST',send:'args',timeoutSec:25,merge:true});
  const w=el('div','card');
  w.style.background='#141820';w.style.borderColor='#2a3240';
  w.append(el('h2',null,{textContent:'HTTP 接口处理(选填，启用后覆盖上方回复)'}));
  const r1=el('div','row');
  const en=el('input','',{type:'checkbox',checked:api.enabled!==false});
  const ur=el('input','',{type:'text',value:api.url||'',placeholder:'https://...',style:'width:72%'});
  r1.append(el('label',null,{textContent:'启用'}),en,el('label',null,{textContent:'URL'}),ur);w.append(r1);
  const r2=el('div','row');
  const md=el('select',null);[['POST','POST (正文JSON)'],['GET','GET (Query参数)']].forEach(([v,l])=>{const o=el('option',null,{value:v,textContent:l});o.selected=v===(api.method||'POST');md.append(o)});
  const sd=el('select',null);[['args','发送命令后参数'],['fulltext','发送消息全文'],['text_image','发送全文+图片']].forEach(([v,l])=>{const o=el('option',null,{value:v,textContent:l});o.selected=v===(api.send||'args');sd.append(o)});
  const to=el('input','',{type:'number',value:api.timeoutSec||25,style:'width:70px'});
  const tk=el('input','',{type:'text',value:api.authToken||'',placeholder:'鉴权 Token(选填)',style:'width:170px'});
  const mg=el('input','',{type:'checkbox',checked:api.merge!==false});
  r2.append(el('label',null,{textContent:'方法'}),md,el('label',null,{textContent:'发送内容'}),sd,el('label',null,{textContent:'超时(秒)'}),to,el('label',null,{textContent:'鉴权'}),tk,el('label',null,{textContent:'合并转发'}),mg);
  w.append(r2);
  en.onchange=()=>api.enabled=en.checked;ur.oninput=()=>api.url=ur.value.trim();
  md.onchange=()=>api.method=md.value;sd.onchange=()=>api.send=sd.value;
  to.oninput=()=>api.timeoutSec=+to.value;tk.oninput=()=>api.authToken=tk.value.trim()||undefined;
  mg.onchange=()=>api.merge=mg.checked;
  return w;
}
function renderKeywords(m){
  m.append(el('p',null,{textContent:'关键字回复：消息命中关键字就接话（群内受节流与静默门限制）。默认「包含匹配」(消息里出现即触发)，勾「整句」为精确相等，勾「正则」则按正则匹配；「仅@时」只在被 @/喊昵称/私聊时触发(不与自由接话冲突)；「仅管理员」只需 主人/群主/群管理/被授予权限 的人 触发。排除词：空格分隔，消息包含其中任一词则本关键字不触发。群内@bot自建的「本群指令」也保存在这里(限定群=该群)，可用「本群指令」查询。图片：上面「图片」是固定一张；想随机抽本地图库就填「图库目录」，支持多目录(分号/换行分隔)并含全部子文件夹，可按 作品/角色 建子目录分类，命中时从整个图库随机抽一张。'}));
  m.append(pagHint());
  const tools=el('div','row');
  const add0=el('button','mini',{textContent:'+ 添加关键字'});
  add0.onclick=()=>{state.content.presets.keywords.unshift({match:'新词',reply:'回复内容',contains:true,cooldownSec:60,groups:[],allowPrivate:true});render()};
  const sk=searchBox(()=>applySearch('#kwq','#main .kwcard'));sk.id='kwq';sk.placeholder='搜索关键字…';
  tools.append(add0,sk);
  m.append(tools);
  const box=el('div');
  const kws=state.content.presets.keywords;
  kws.forEach((k,i)=>{
    const cd=el('div','card kwcard');
    const kwTitle=(k.matches&&k.matches.length?k.matches[0]:k.match)||'未填关键字';
    cd.append(el('h2',null,{textContent:'#'+(i+1)+'　'+kwTitle}));
    if(folded.has('k'+i))cd.classList.add('folded');
    cd.querySelector('h2').textContent=(cd.classList.contains('folded')?'▸ ':'▾ ')+cd.querySelector('h2').textContent;
    cd.querySelector('h2').onclick=()=>{foldCard(cd,'k'+i,true);setSaveStatus('已展开/折叠 关键字 #'+(i+1))};
    const r1=el('div','row');r1.append(el('label',null,{textContent:'关键字（一行一个，可多个；同一行用 / 也能分隔，如 说/复述。{args}=命中词后面的话）'}));
    const nm=el('textarea',null);nm.value=((k.matches&&k.matches.length?k.matches:[k.match]).filter(Boolean)).join('\\n');nm.style.minHeight='44px';r1.append(nm);cd.append(r1);
    const r2=el('div','row');r2.append(el('label',null,{textContent:'回复(默认/兜底)  ← 可用占位符，如 {rand:1,6}'}));
    const rp=el('textarea',null);rp.value=k.reply||'';rp.style.minHeight='36px';r2.append(phButtons(rp),rp);cd.append(r2);
    const r3=el('div','row');r3.append(el('label',null,{textContent:'随机多条回复(每行一条，选填)'}));
    const rrTa=el('textarea',null);rrTa.value=(k.randomReplies||[]).join('\\n');r3.append(rrTa);cd.append(r3);
    const pvCtx=makePreview(()=>{const lines=(rrTa.value||'').split('\\n').map(s=>s.trim()).filter(Boolean);return lines[0]||rp.value});
    cd.append(pvCtx.pv);
    const r4=el('div','row');r4.append(el('label',null,{textContent:'图片(本地路径或 http，选填)'}));
    const img=el('input','',{type:'text',value:k.image||'',style:'width:100%'});r4.append(img);cd.append(r4);
    const r4b=el('div','row');r4b.append(el('label',null,{textContent:'图库目录(随机抽图，选填；可填多个，用分号或换行分隔，含子文件夹)',title:'留空则用上面的单张图片。填了目录就变成从整个图库里随机抽一张，支持按 作品/角色 分子文件夹归类。'}));
    const imgDir=el('input','',{type:'text',value:k.imageDir||'',style:'width:100%'});
    const kwScan=el('button','mini',{textContent:'扫描预览'});
    const kwInfo=el('pre',null,{style:'max-height:180px;overflow:auto'});
    kwScan.onclick=async()=>{kwInfo.textContent='扫描中…';try{const d=await api('/api/keyword-images?dir='+encodeURIComponent(imgDir.value));kwInfo.textContent=d.total?('共 '+d.total+' 张，来自 '+d.dirs.length+' 个目录：\\n'+d.sample.join('\\n')):'该目录下没有找到图片（支持 png/jpg/jpeg/gif/webp）';}catch(e){kwInfo.textContent='扫描失败：'+e.message;}};
    r4b.append(imgDir,kwScan);cd.append(r4b,kwInfo);
    const r5=el('div','row');r5.append(el('label',null,{textContent:'分时段文案'}));
    const [tm,na,ev,nt]=timeInputs(k);r5.append(tm,na,ev,nt);cd.append(r5);
    const r6=el('div','row');
    const ct=el('input','',{type:'checkbox',checked:k.contains!==false});
    const ex=el('input','',{type:'text',value:(k.excludeWords||[]).join(' '),style:'width:180px',placeholder:'排除词(空格分隔)'});
    const mo=el('input','',{type:'checkbox',checked:!!k.mentionOnly});
    const re=el('input','',{type:'checkbox',checked:!!k.useRegex,title:'匹配词按正则解析：拉开=包含子串；关掉后若「整句」未勾，则整句相等才命中。每个匹配词独立计冷却'});
    const rt=el('input','',{type:'checkbox',checked:!!k.repeat});
    const cdS=el('input','',{type:'number',value:k.cooldownSec||60,style:'width:70px'});
    const pr=el('input','',{type:'checkbox',checked:k.allowPrivate!==false});
    const ad=el('input','',{type:'checkbox',checked:!!k.adminOnly});
    const ow=el('input','',{type:'checkbox',checked:!!k.ownerOnly});
    const pk=el('input','',{type:'text',value:k.permKey||'',style:'width:110px',placeholder:'授权项(可空)'});
    pk.title='填了之后，被 /授权 授予这一项的人也能触发（对应内置指令的 perms 机制）';
    const gr=el('input','',{type:'text',value:(k.groups||[]).join(','),style:'width:170px',placeholder:'限定群(空=全部)'});
    const del=el('button','mini danger',{textContent:'删除'});
    r6.append(el('label',null,{textContent:'包含'}),ct,el('label',null,{textContent:'复读原句',title:'勾选后：用户说什么，就原样回什么（优先级最高，此时分时段/随机/兜底回复都不生效）'}),rt,el('label',null,{textContent:'正则'}),re,el('label',null,{textContent:'仅@时'}),mo,el('label',null,{textContent:'排除词'}),ex,el('label',null,{textContent:'冷却(秒)'}),cdS,el('label',null,{textContent:'私聊可用'}),pr,el('label',null,{textContent:'仅管理员'}),ad,el('label',null,{textContent:'仅主人'}),ow,el('label',null,{textContent:'授权项'}),pk,el('label',null,{textContent:'限定群'}),gr,del);
    cd.append(r6);
    nm.oninput=()=>{const w=nm.value.split('\\n').map(s=>s.trim()).filter(Boolean);k.matches=w;k.match=w[0]||'';};
    rp.oninput=()=>{k.reply=rp.value;pvCtx.refresh()};
    rrTa.oninput=()=>{k.randomReplies=rrTa.value.split('\\n').map(s=>s.trim()).filter(Boolean);pvCtx.refresh()};
    img.oninput=()=>{k.image=img.value.trim()||undefined};
    imgDir.oninput=()=>{k.imageDir=imgDir.value.trim()||undefined};
    ct.onchange=()=>k.contains=ct.checked; ex.oninput=()=>k.excludeWords=ex.value.split(/\\s+/).filter(Boolean);
    re.onchange=()=>k.useRegex=re.checked; mo.onchange=()=>k.mentionOnly=mo.checked;
    rt.onchange=()=>{if(rt.checked){k.repeat=true} else delete k.repeat};
    cdS.oninput=()=>k.cooldownSec=+cdS.value;pr.onchange=()=>k.allowPrivate=pr.checked;
    ad.onchange=()=>{k.adminOnly=ad.checked;if(ad.checked)ow.checked=false,ow.onchange()};
    ow.onchange=()=>{k.ownerOnly=ow.checked;if(ow.checked)ad.checked=false};
    pk.oninput=()=>k.permKey=pk.value.trim()||undefined;
    gr.oninput=()=>k.groups=gr.value.split(',').map(s=>s.trim()).filter(Boolean);
    del.onclick=()=>{deletedIds.push(identOf(state.content.presets.keywords[i],'keywords'));state.content.presets.keywords.splice(i,1);render()};
    box.append(cd);
  });
  const w=el('div');w.append(box);
  m.append(card('关键字回复',w));
}
const BDEFS={
  ping:{label:'ping',desc:'存活与延迟',admin:false},
  help:{label:'帮助',desc:'按类型分组的帮助图，支持 /help <类型> 展开单个类型(别名 help/帮助/求助)',admin:false},
  '\\u8fd0\\u52bf':{label:'运势',desc:'今日运势',admin:false},
  '\\u62bd\\u7b7e':{label:'抽签',desc:'随机抽一张签图',admin:false},
  '\\u9493\\u9c7c':{label:'钓鱼',desc:'钓鱼(有冷却)',admin:false},
  '\\u9c7c\\u5858':{label:'鱼塘',desc:'查看我的鱼和金币',admin:false},
  '\\u5356\\u9c7c':{label:'卖鱼',desc:'卖掉鱼塘里的鱼',admin:false},
  '\\u7b7e\\u5230':{label:'签到',desc:'每日签到得积分+签到卡',admin:false},
  '\\u7b49\\u7ea7':{label:'等级',desc:'等级档案卡(等级按累计积分，兑换不掉级)',admin:false},
  '\\u9762\\u677f':{label:'面板',desc:'按钮卡片(协议不支持时自动文字)',admin:false},
  '\\u5934\\u8854':{label:'头衔',desc:'看自己的葡家头衔；/头衔 列表 看全表，/头衔 重置 撤掉本群覆盖',admin:false},
  '\\u8bbe\\u7f6e\\u5934\\u8854':{label:'设置头衔',desc:'群主/管理员改某档头衔(群里=只改本群,私聊=改全局且仅主人)；重置=撤掉覆盖',admin:false},
  '抽卡':{label:'抽卡',desc:'用光玉抽卡(只扣光玉，不影响等级)',admin:false},
  '十连':{label:'十连',desc:'一次抽 10 张',admin:false},
  '卡池':{label:'卡池',desc:'查看全部卡池与单抽价格',admin:false},
  '保底':{label:'保底',desc:'查看各池保底进度',admin:false},
  '图鉴':{label:'图鉴',desc:'我的卡牌缩略图墙(每页 20 张)',admin:false},
  '查卡':{label:'查卡',desc:'查看任意一张卡的卡面',admin:false},
  '兑换':{label:'兑换',desc:'积分换光玉(只扣积分余额，不掉级)',admin:false},
  '分解':{label:'分解',desc:'分解重复卡换光玉',admin:false},
  '光玉':{label:'光玉',desc:'查询光玉余额',admin:false},
  me:{label:'我的',desc:'个人资料(可@他人)',admin:false},
  info:{label:'信息',desc:'群成员资料(仅群，可@他人)',admin:false,groupOnly:true},
  groupinfo:{label:'群信息',desc:'群名称/人数/群主',admin:false},
  '\\u5934\\u50cf':{label:'头像',desc:'头像图片(可@他人)',admin:false},
  '\\u751f\\u65e5':{label:'生日',desc:'今日生日/开启/添加(默认按群关闭)',admin:false},
  '\\u5f00\\u542f':{label:'开启',desc:'群内开启某类型/指令(如 /开启 小游戏)',admin:false},
  '\\u5173\\u95ed':{label:'关闭',desc:'群内关闭某类型/指令',admin:false},
  '\\u4e00\\u8a00':{label:'一言',desc:'每日金句/短句(默认按群关闭)',admin:false},
  '\\u8bd7\\u8bcd':{label:'诗词',desc:'随机诗句',admin:false},
  '\\u51b7\\u77e5\\u8bc6':{label:'冷知识',desc:'冷门知识点',admin:false},
  '\\u5854\\u7f57':{label:'塔罗牌',desc:'抽塔罗牌(默认3张)',admin:false},
  '\\u4eca\\u65e5\\u4eba\\u54c1':{label:'今日人品',desc:'每日人品指数',admin:false},
  '\\u4eca\\u65e5\\u4eba\\u8bbe':{label:'今日人设',desc:'随机今日身份',admin:false},
  '\\u571f\\u5473\\u60c5\\u8bdd':{label:'土味情话',desc:'土味情话(可@人)',admin:false},
  '\\u5f69\\u8679\\u5c41':{label:'彩虹屁',desc:'夸夸(可@人)',admin:false},
  '\\u8214\\u72d7\\u65e5\\u8bb0':{label:'舔狗日记',desc:'舔狗文案',admin:false},
  '\\u6bd2\\u9e21\\u6c64':{label:'毒鸡汤',desc:'扎心文案',admin:false},
  '\\u65f6\\u95f4':{label:'时间',desc:'当前时间',admin:false},
  '\\u731c\\u6570\\u5b57':{label:'猜数字',desc:'1~100猜数/猜 N 出招',admin:false},
  '\\u75af\\u72c2\\u661f\\u671f\\u56db':{label:'疯狂星期四',desc:'v50 的呼唤',admin:false},
  '\\u6572\\u6728\\u9c7c':{label:'敲木鱼',desc:'积功德(可暴击)',admin:false},
  '\\u529f\\u5fb7\\u699c':{label:'功德榜',desc:'功德 Top10',admin:false},
  '\\u62bd\\u7fa4\\u53cb':{label:'抽群友',desc:'随机点名(仅群)',admin:false,groupOnly:true},
  '\\u8f6e\\u76d8':{label:'轮盘',desc:'俄罗斯轮盘禁言5分钟(仅群)',admin:false,groupOnly:true},
  '\\u5929\\u6c14':{label:'天气',desc:'天气 [城市] 实时天气(免密钥接口)',admin:false},
  '\\u70ed\\u641c':{label:'热搜',desc:'全网热点 Top10',admin:false},
  '随机二次元':{label:'随机二次元',desc:'随机非18+二次元图片',admin:false},
  '\\u7fa4\\u540d\\u7247':{label:'群名片',desc:'改群名片(可@人)',admin:true,groupOnly:true},
  '\\u7fa4\\u540d':{label:'群名',desc:'改群名称',admin:true,groupOnly:true},
  mute:{label:'禁言',desc:'禁言(仅群)',admin:true,groupOnly:true},
  unmute:{label:'解禁',desc:'解禁(仅群)',admin:true,groupOnly:true},
  kick:{label:'踢出',desc:'踢出(仅群)',admin:true,groupOnly:true},
  banall:{label:'全体禁言',desc:'全体禁言(仅群)',admin:true,groupOnly:true},
  unbanall:{label:'解除全体禁言',desc:'解除(仅群)',admin:true,groupOnly:true},
  recall:{label:'撤回',desc:'撤回(仅群)',admin:true,groupOnly:true},
  '\u56de\u6233':{label:'回戳',desc:'被戳后回敬一条',admin:false,groupOnly:true},
  '\u6233\u4e00\u6233':{label:'戳一戳',desc:'真的戳某个群友(可带花样: 比心/点赞/666…)',admin:false,groupOnly:true},
  '\u6bd4\u5fc3':{label:'比心',desc:'戳一戳的「比心」花样',admin:false,groupOnly:true},
  '\u70b9\u8d5e':{label:'点赞',desc:'戳一戳的「点赞」花样',admin:false,groupOnly:true},
  '\u62cd\u4e00\u62cd':{label:'拍一拍',desc:'拍拍某个群友(QQ无独立动作,只发文案)',admin:false,groupOnly:true},
  '\u634f\u4e00\u634f':{label:'捏一捏',desc:'捏捏某个群友',admin:false,groupOnly:true},
  '\u8e22\u7981':{label:'踢禁',desc:'踢出并禁止重进(仅群)',admin:true,groupOnly:true},
  '\u67e5\u540d\u7247':{label:'查名片',desc:'查群名片/入群时间',admin:false,groupOnly:true},
  '\u7fa4\u6863\u6848':{label:'群档案',desc:'查本群信息',admin:false,groupOnly:true},
  grant:{label:'给予',desc:'授予权限(仅主人·隐藏)',admin:false},
  revoke:{label:'剥夺',desc:'剥夺权限(仅主人·隐藏)',admin:false},
  perms:{label:'权限',desc:'查看权限(仅主人·隐藏)',admin:false},
  '设积分':{label:'设积分',desc:'直接定余额积分(仅主人·隐藏)',admin:false},
  '设光玉':{label:'设光玉',desc:'直接定光玉(仅主人·隐藏)',admin:false},
  '设等级':{label:'设等级',desc:'直接定累计积分修等级(仅主人·隐藏)',admin:false},
  '改签到':{label:'改签到',desc:'逐项修正签到进度(仅主人·隐藏)',admin:false},
  '重置签到':{label:'重置签到',desc:'清零某人签到(仅主人·隐藏)',admin:false},
  '设保底':{label:'设保底',desc:'直接定抽卡保底计数(仅主人·隐藏)',admin:false},
  '设卡数':{label:'设卡数',desc:'直接定某张卡数量(仅主人·隐藏)',admin:false},
  '设金币':{label:'设金币',desc:'直接定钓鱼金币(仅主人·隐藏)',admin:false},
  '设鱼获':{label:'设鱼获',desc:'直接定某种鱼的持有量(仅主人·隐藏)',admin:false},
  '设功德':{label:'设功德',desc:'直接定功德数值(仅主人·隐藏)',admin:false},
  '清冷却':{label:'清冷却',desc:'清游戏冷却(仅主人·隐藏)',admin:false},
  '删用户':{label:'删用户',desc:'删除某人某类存档(仅主人·隐藏)',admin:false},
  '立即备份':{label:'立即备份',desc:'立刻备份存档(仅主人·隐藏)',admin:false},
  '备份列表':{label:'备份列表',desc:'查看存档备份(仅主人·隐藏)',admin:false},
  '数据概览':{label:'数据概览',desc:'一次看完某人全部数据(仅主人·隐藏)',admin:false},
};
// —— 哪些内置指令可以用「预设指令 / 关键字回复」编辑器替代 ——
// 只有两类可以：
//   1) 纯文案随机类：预设的「多条回复随机」能完全替代，主人可以换成自己的文案池；
//   2) 群管理动作类：预设支持 {ban}/{unban}/{kick}/{banall}/{recall} 动作占位符，能替代。
// 依赖真实数据的（签到/积分/抽卡/钓鱼/兑换/鱼塘/保底…）和仅主人的数据修正指令**不能**替代：
// 预设只能回固定文案，既读不到也改不了存档。给它们加按钮会让主人误以为「复制了就能用」，
// 所以一律不给，只在 title 里说明原因。
function renderGroups(m){
  const st=state.content.settings||(state.content.settings={});
  st.replyGroups=st.replyGroups||[];st.blockGroups=st.blockGroups||[];st.quietAllowGroups=st.quietAllowGroups||[];
  m.append(el('p',null,{textContent:'群门控与黑白名单：白名单留空=全部群可回复；黑名单里的群一律不回；还可指定「深夜静默」窗口内仍会回复的群（比如物料群/值班群）。群号用逗号分隔。'}));
  const w=el('div');
  const mk=(label,val)=>el('input','',{type:'text',value:val,style:'width:100%'});
  const r1=el('div','row');const wh=mk('w',st.replyGroups.join(','));r1.append(el('label',null,{textContent:'允许回复的群(白名单，逗号分隔，空=全部)'}),wh);wh.oninput=()=>st.replyGroups=wh.value.split(',').map(s=>s.trim()).filter(Boolean);
  const r2=el('div','row');const bl=mk('b',st.blockGroups.join(','));r2.append(el('label',null,{textContent:'屏蔽不回复的群(黑名单，逗号分隔)'}),bl);bl.oninput=()=>st.blockGroups=bl.value.split(',').map(s=>s.trim()).filter(Boolean);
  const r3=el('div','row');const qa=mk('q',st.quietAllowGroups.join(','));r3.append(el('label',null,{textContent:'深夜静默豁免群(逗号分隔，空=全部不豁免)'}),qa);qa.oninput=()=>st.quietAllowGroups=qa.value.split(',').map(s=>s.trim()).filter(Boolean);
  w.append(r1,r2,r3);
  m.append(card('群门控',w));
}
function numRow(label,obj,key,ph){
  const r=el('div','row');
  const i=el('input','',{type:'number',value:(obj&&obj[key]!==undefined)?obj[key]:'',style:'width:110px',placeholder:ph||''});
  i.oninput=()=>{if(obj[key]!==undefined)delete obj[key];if(i.value!=='')obj[key]=+i.value};
  r.append(el('label',null,{textContent:label}),i);
  return r;
}
`;
