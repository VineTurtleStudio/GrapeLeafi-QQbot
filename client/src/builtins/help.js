// builtins/help.js —— 帮助指令（/help、/帮助、/求助）。
//   /help            按类型概览，每个类型最多只列几条，避免刷屏
//   /help <类型>     查看该类型下的全部指令与说明（例：/help 文娱）
// 只依赖注入的 opts；不 import brain、不 import gacha；可 node --check 自证。
//
// nickname / prefix 刻意不在参数位置解包，而是每次用时再从 opts 上取：
// 这两个字段会被 applyBotConfig 热改（控制台改昵称/指令前缀、首次连上协议端时
// 自动认领昵称），在参数位置解包等于把当时的值拍死成一个快照，
// 于是配置已经改了、/help 还一直显示旧昵称，直到重启才生效。

// 概览里每个类型最多显示几条，剩下的用「/help <类型> 看全部」提示
const OVERVIEW_LIMIT = 5;

// 去掉空白与 emoji，方便 /help 打卡 /help 积分 这种写法
function norm(s) {
  return String(s == null ? "" : s).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

export function helpCommands(opts) {
  const { sendText, sendMsg, textSeg, buildHelpImage, logger, content, isAdmin, isGroupPrivileged } = opts;
  const nickname = () => opts.nickname;
  const prefix = () => opts.prefix;
  function buildSections({ p, group, admin }) {
    const sections = [
      {
        key: "基础",
        title: "基础",
        aliases: ["系统", "basic"],
        items: [
          { cmd: `${p}ping`, desc: "看看我在不在线、延迟多少毫秒" },
          { cmd: `${p}help [类型]`, desc: "本帮助；带类型名可看该类型全部指令" },
          { cmd: `${p}开启 <类型|指令>`, desc: "在群里打开某个类型或单条指令" },
          { cmd: `${p}关闭 <类型|指令>`, desc: "在群里关掉某个类型或单条指令" },
        ],
      },
      {
        key: "积分",
        title: "📈 积分与等级",
        aliases: ["等级", "经验", "积分与等级", "光玉"],
        items: [
          { cmd: "积分余额", desc: "签到拿到的可用积分，只有它会被花掉" },
          { cmd: "累计积分", desc: "只增不减（只有签到和发放才加），升级只看它" },
          { cmd: "升级规则", desc: "Lv.N → Lv.N+1 需要 100×N 累计积分，升级后余量带入下一级" },
          { cmd: "兑换", desc: "花掉的是积分余额，累计积分和等级都不受影响" },
          { cmd: "抽卡", desc: "只扣光玉，跟等级、累计积分完全互不干扰" },
          { cmd: "光玉", desc: "来源：签到赠送 / 积分兑换 / 重复卡分解" },
          { cmd: `${p}等级`, desc: "查等级档案：等级、积分、累计、连续天数" },
          { cmd: `${p}光玉`, desc: "查光玉余额" },
        ],
      },
      {
        key: "日常",
        title: "日常",
        aliases: ["每日", "签到", "打卡"],
        items: [
          { cmd: `${p}签到`, desc: "每天一次，+积分（连续越久越多）并赠送光玉，附签到卡" },
          { cmd: `${p}等级`, desc: "等级档案：等级/积分/光玉/连续签到/累计天数" },
          { cmd: `${p}面板`, desc: "打开工作台按钮面板（协议端不支持就退回文字列表）" },
        ],
      },
      {
        key: "抽卡",
        title: "抽卡 🃏",
        aliases: ["卡", "gacha", "cards"],
        items: [
          { cmd: `${p}抽卡 <池> [数量]`, desc: "用光玉抽卡；作品池写 ab，角色池可直接写角色名" },
          { cmd: `${p}十连`, desc: "一次抽 10 张，更快触发保底" },
          { cmd: `${p}光玉`, desc: "查光玉余额（积分可以用 ${p}兑换 换）" },
          { cmd: `${p}兑换 <数量>`, desc: "把积分余额换成光玉，不影响等级" },
          { cmd: `${p}分解 <卡号|全部>`, desc: "分解重复卡换光玉" },
          { cmd: `${p}卡池`, desc: "看全部卡池和每池卡牌数量" },
          { cmd: `${p}保底`, desc: "看各卡池的保底进度" },
          { cmd: `${p}图鉴 [页数]`, desc: "我抽到的卡，缩略图墙，每页 20 张" },
          { cmd: `${p}查卡 <作品> <编号> [详情]`, desc: "看任意一张卡的卡面，加「详情」看大图" },
        ],
      },
      {
        key: "小游戏",
        title: "小游戏",
        aliases: ["游戏", "玩"],
        items: [
          { cmd: `${p}运势`, desc: "今日运势，每人每天一次" },
          { cmd: `${p}抽签`, desc: "随机抽一张签图，有冷却" },
          { cmd: `${p}钓鱼`, desc: "钓一条鱼，30 秒一次" },
          { cmd: `${p}鱼塘`, desc: "看我的鱼塘和金币" },
          { cmd: `${p}卖鱼`, desc: "把鱼塘里的鱼全卖掉换金币" },
        ],
      },
      {
        key: "查询",
        title: "查询",
        aliases: ["资料", "信息"],
        items: [
          { cmd: `${p}我的 [@某人/QQ号]`, desc: "查资料（昵称/性别/年龄），默认自己" },
          { cmd: `${p}信息 [@某人/QQ号]`, desc: "查本群资料与头衔，默认自己" },
          { cmd: `${p}群信息 [群名/群号]`, desc: "群名称/人数/群主，默认当前群" },
          { cmd: `${p}头像 [@某人/QQ号]`, desc: "发头像图片，可省略（默认自己）" },
        ],
      },
      {
        key: "生日",
        title: "生日 🎂（需 /开启 生日）",
        aliases: ["生日提醒"],
        items: [
          { cmd: `${p}生日`, desc: "看今天谁生日 + 本群开关状态" },
          { cmd: `${p}生日 开启 / 关闭`, desc: "本群开关生日提醒" },
          { cmd: `${p}生日 添加 [名字] [MM-DD]`, desc: "添加自定义生日（仅本群）" },
          { cmd: `${p}生日 删除 [名字]`, desc: "删掉本群自定义生日" },
        ],
      },
      {
        key: "文娱",
        title: "文娱 💬（需 /开启 文娱）",
        aliases: ["娱乐"],
        items: [
          { cmd: `${p}一言`, desc: "每日金句/短句" },
          { cmd: `${p}诗词`, desc: "随机推荐一句诗" },
          { cmd: `${p}冷知识`, desc: "涨姿势时间" },
          { cmd: `${p}今日人设`, desc: "随机今日身份" },
          { cmd: `${p}土味情话`, desc: "土味情话，可对 @某人 使用" },
          { cmd: `${p}彩虹屁`, desc: "夸夸，可对 @某人 使用" },
          { cmd: `${p}舔狗日记`, desc: "写给时刻惦记的人" },
          { cmd: `${p}毒鸡汤`, desc: "扎心文案" },
          { cmd: `${p}时间`, desc: "当前时间" },
        ],
      },
      {
        key: "互动",
        title: "互动 🎮（需 /开启 互动）",
        aliases: ["玩法"],
        items: [
          { cmd: `${p}猜数字`, desc: "在 1~100 里猜，出招用 ${p}猜 N" },
          { cmd: `${p}塔罗牌`, desc: "抽塔罗牌，默认 3 张" },
          { cmd: `${p}今日人品`, desc: "每日人品指数与锦囊" },
          { cmd: `${p}疯狂星期四`, desc: "v50 的呼唤" },
          { cmd: `${p}敲木鱼`, desc: "敲一声积功德，可以暴击" },
          { cmd: `${p}功德榜`, desc: "功德 Top10" },
          { cmd: `${p}抽群友`, desc: "随机点一名幸运观众" },
          { cmd: `${p}轮盘`, desc: "俄罗斯轮盘，打中禁言 5 分钟（每小时 1 次）" },
        ],
      },
      {
        key: "联网",
        title: "联网 🌐（需 /开启 联网）",
        aliases: ["网络", "网"],
        items: [
          { cmd: `${p}天气 [城市]`, desc: "实时天气，默认北京" },
          { cmd: `${p}热搜`, desc: "全网热点 Top10" },
          { cmd: `${p}随机二次元`, desc: "随机发一张非 18+ 二次元图" },
        ],
      },
    ];

    const presetCmds = (content.presets?.commands || []).filter((c) => c && c.name);
    if (presetCmds.length) {
      sections.push({
        key: "自定义",
        title: "自定义指令",
        aliases: ["预设", "自定义指令"],
        items: presetCmds.map((c) => {
          const d = c.desc || (c.reply ? String(c.reply).slice(0, 22) : "");
          const al = Array.isArray(c.aliases) && c.aliases.length ? `（别名 ${c.aliases.join("/")}）` : "";
          return { cmd: `${p}${c.name}`, desc: `${d}${al}` };
        }),
      });
    }

    if (group && admin) {
      sections.push({
        key: "群管理",
        title: "群管理（仅管理员）",
        aliases: ["管理"],
        items: [
          { cmd: `${p}禁言 [@某人/QQ号] [时长]`, desc: "如 @某人 10分钟、123456 1小时，默认 10 分钟" },
          { cmd: `${p}解禁 [@某人/QQ号]`, desc: "解除某人的禁言" },
          { cmd: `${p}踢出 [@某人/QQ号]`, desc: "把成员移出本群" },
          { cmd: `${p}群名片 <名字>`, desc: "改自己的群名片" },
          { cmd: `${p}群名 <名字>`, desc: "改本群名称" },
          { cmd: `${p}全体禁言`, desc: "开启全员禁言" },
          { cmd: `${p}解除全体禁言`, desc: "解除全员禁言" },
          { cmd: `${p}撤回`, desc: "回复一条消息后再发，撤回该条" },
        ],
      });
    }

    return sections;
  }

  function findSection(sections, word) {
    const q = norm(word);
    if (!q) return null;
    for (const sec of sections) {
      if (norm(sec.key) === q) return sec;
      if (norm(sec.title) === q) return sec;
      if ((sec.aliases || []).some((a) => norm(a) === q)) return sec;
    }
    return null;
  }

  async function renderHelp(body, sections, footer, { title, subtitle }) {
    const img = await buildHelpImage({ title, subtitle, sections, footer }).catch((err) => {
      logger.error(`[help] 生成帮助图片失败: ${err.message}`);
      return null;
    });
    if (img) return sendMsg(body, [textSeg(`${nickname()} 的帮助来啦～\n`), { type: "image", data: { file: img.dataUrl } }], "help");

    const lines = [title];
    if (subtitle) lines.push(subtitle);
    for (const sec of sections) {
      lines.push(`【${sec.title}】`);
      for (const it of sec.items) lines.push(`  ${it.cmd}${it.desc ? " — " + it.desc : ""}`);
    }
    lines.push(...footer);
    return sendText(body, lines.join("\n"), "help");
  }

  const helpFn = async (body, args) => {
    const group = body.message_type === "group";
    const admin = group ? await isGroupPrivileged(body) : isAdmin(body.user_id);
    const p = prefix();
    const sections = buildSections({ p, group, admin });
    const want = Array.isArray(args) ? norm(args.find((a) => a != null && String(a).trim() !== "")) : "";

    const st = content.settings || {};
    const on = (key) => Array.isArray(st.groupEnabled && st.groupEnabled[key]) && st.groupEnabled[key].map(String).includes(String(body.group_id));
    const offCats = (Array.isArray(st.defaultOff) ? st.defaultOff : []).filter((c) => ["生日", "文娱", "互动", "联网"].includes(c) && !on(`cat:${c}`));

    // /help <类型>：展开该类型全部指令
    if (want) {
      const sec = findSection(sections, want);
      if (sec) {
        const footer = [`输入 ${p}help 看全部类型，或 ${p}help <类型> 换一个。`];
        return renderHelp(body, [sec], footer, {
          title: `${nickname()} · 帮助 · ${sec.title}`,
          subtitle: `本类型共 ${sec.items.length} 条指令`,
        });
      }
      const keys = sections.map((s) => s.key);
      return sendText(
        body,
        `没有「${args.find((a) => a != null && String(a).trim() !== "")}」这个类型。\n可选类型：${keys.join("、")}\n用法：${p}help <类型>，例如 ${p}help 文娱`,
        "help"
      );
    }

    // /help：概览，每类最多 OVERVIEW_LIMIT 条
    const brief = sections.map((sec) => {
      const rest = sec.items.length - OVERVIEW_LIMIT;
      const items = sec.items.slice(0, OVERVIEW_LIMIT);
      if (rest > 0) items.push({ cmd: `${p}help ${sec.key}`, desc: `还有 ${rest} 条，看全部 →` });
      return { ...sec, items };
    });

    const footer = [
      `输入 ${p}help <类型> 看某个类型的全部指令，例如 ${p}help 文娱。`,
      "📈 等级只看你「累计获得」的积分，不看余额；花积分换光玉不会掉级，详见 " + `${p}help 积分。`,
      "私聊我可以直接聊天；群里 @我 或喊我名字也能聊天（走 AI）。",
      "指令与自定义回复不经过 AI，按预设内容即时回复。",
    ];
    if (group && offCats.length) {
      footer.push(`以下类型默认未开启：${offCats.join("、")}。发 ${p}开启 ${offCats[0]} 即可启用（主人无需开启）。`);
    }
    if (group) {
      footer.push(`可按类型开关：日常 / 小游戏 / 查询 / 生日 / 互动 / 文娱 / 联网（卡牌指令归在「小游戏」下）；也可用 ${p}开启 <单条指令> 单独开关，主人免开。`);
    }
    if (group && !admin) footer.push(`群管理指令（${p}禁言 /${p}踢出 /${p}群名片 等）仅群管理员或主人可用。`);

    return renderHelp(body, brief, footer, {
      title: `${nickname()} · 帮助`,
      subtitle: "按类型分组，每类只列部分指令",
    });
  };

  return {
    help: { fn: helpFn },
  };
}
