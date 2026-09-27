const RAW = [
  ["霧島 聖", "01-03", "AIR"],
  ["桐生 美也", "01-05", "Heaven Burns Red"],
  ["沢渡 真琴", "01-06", "Kanon"],
  ["白河 ユイナ", "01-06", "Heaven Burns Red"],
  ["月宮 あゆ", "01-07", "Kanon"],
  ["直枝架夜", "01-12", "Kud Wafter"],
  ["水瀬 いちご", "01-15", "Heaven Burns Red"],
  ["直枝 理樹", "01-17", "Little Busters!"],
  ["伊吹 公子", "01-18", "CLANNAD"],
  ["LUNAR-Q", "01-23", "LUNARiA"],
  ["ヴリティカ・ バラクリシュナン", "01-26", "Heaven Burns Red"],
  ["川澄 舞", "01-29", "Kanon"],
  ["美坂 栞", "02-01", "Kanon"],
  ["岡崎 汐", "02-01", "CLANNAD"],
  ["野村 美希", "02-02", "Summer Pockets"],
  ["佐月 マリ", "02-07", "Heaven Burns Red"],
  ["三谷 良一", "02-09", "Summer Pockets"],
  ["東城 つかさ", "02-14", "Heaven Burns Red"],
  ["千里 朱音", "02-17", "Rewrite"],
  ["春原 陽平", "02-17", "CLANNAD"],
  ["神崎 アーデルハイド", "02-22", "Heaven Burns Red"],
  ["町村 玲央奈", "02-24", "LOOPERS"],
  ["マリア・デ・ アンジェリス", "02-26", "Heaven Burns Red"],
  ["美坂 香里", "03-01", "Kanon"],
  ["命 吹雪", "03-04", "Heaven Burns Red"],
  ["西門 貴明", "03-05", "LOOPERS"],
  ["井上 晶", "03-06", "Rewrite"],
  ["来ヶ谷 唯湖", "03-13", "Little Busters!"],
  ["柊木 梢", "03-18", "Heaven Burns Red"],
  ["小笠原 緋雨", "03-21", "Heaven Burns Red"],
  ["有月 椎菜", "03-25", "Kud Wafter"],
  ["松岡 チロル", "03-26", "Heaven Burns Red"],
  ["鳳 咲夜", "03-27", "Rewrite"],
  ["西园美鸟", "03-30", "Little Busters!"],
  ["あーちゃん先輩", "04-01", "Little Busters!"],
  ["豊後 弥生", "04-01", "Heaven Burns Red"],
  ["藤川 みあ", "04-02", "LOOPERS"],
  ["相楽 美佐枝", "04-03", "CLANNAD"],
  ["久島 鴎", "04-04", "Summer Pockets"],
  ["神北 小毬", "04-05", "Little Busters!"],
  ["ビャッコ", "04-08", "Heaven Burns Red"],
  ["柳 美音", "04-13", "Heaven Burns Red"],
  ["北川 潤", "04-18", "Kanon"],
  ["水織 静久", "04-29", "Summer Pockets"],
  ["宮沢 謙吾", "04-30", "Little Busters!"],
  ["岡崎 直幸", "05-01", "CLANNAD"],
  ["天王寺 瑚太朗", "05-02", "Rewrite"],
  ["棗 恭介", "05-04", "Little Busters!"],
  ["倉田 佐祐理", "05-05", "Kanon"],
  ["シャルロッタ・ スコポフスカヤ", "05-07", "Heaven Burns Red"],
  ["利田 美咲", "05-08", "LOOPERS"],
  ["室伏 理沙", "05-12", "Heaven Burns Red"],
  ["一ノ瀬 ことみ", "05-13", "CLANNAD"],
  ["鷹原 羽依里", "05-21", "Summer Pockets"],
  ["石井 色葉", "05-26", "Heaven Burns Red"],
  ["霧島 譲", "06-06", "LOOPERS"],
  ["二階堂 三郷", "06-06", "Heaven Burns Red"],
  ["鳴瀬 しろは", "06-08", "Summer Pockets"],
  ["春原 芽衣", "06-11", "CLANNAD"],
  ["霧島 佳乃", "06-12", "AIR"],
  ["能美 クドリャフカ", "06-12", "Little Busters!"],
  ["しまこ", "06-13", "Rewrite"],
  ["蔵 里見", "06-18", "Heaven Burns Red"],
  ["中津 静流", "06-18", "Rewrite"],
  ["茅森 月歌", "06-24", "Heaven Burns Red"],
  ["桜庭 星羅", "06-29", "Heaven Burns Red"],
  ["神山 識", "07-04", "Summer Pockets"],
  ["蒼井 えりか", "07-07", "Heaven Burns Red"],
  ["朝倉 可憐", "07-11", "Heaven Burns Red"],
  ["西九条 灯花", "07-12", "Rewrite"],
  ["有月 初", "07-16", "Kud Wafter"],
  ["古河 秋生", "07-20", "CLANNAD"],
  ["伊吹 風子", "07-20", "CLANNAD"],
  ["平良 明", "07-21", "LOOPERS"],
  ["天音 巫呼", "07-22", "Heaven Burns Red"],
  ["神尾 観鈴", "07-23", "AIR"],
  ["神戸 小鳥", "07-26", "Rewrite"],
  ["キャロル・リーパー", "08-02", "Heaven Burns Red"],
  ["宮沢 有紀寧", "08-07", "CLANNAD"],
  ["夏目 祈", "08-15", "Heaven Burns Red"],
  ["西園 美魚", "08-22", "Little Busters!"],
  ["鳳 ちはや", "08-24", "Rewrite"],
  ["山脇・ボン・ イヴァール", "08-25", "Heaven Burns Red"],
  ["幸村 俊夫", "08-27", "CLANNAD"],
  ["紬 ヴェンダース", "08-31", "Summer Pockets"],
  ["加藤 うみ", "09-01", "Summer Pockets"],
  ["棗 鈴", "09-02", "Little Busters!"],
  ["水瀬 すもも", "09-06", "Heaven Burns Red"],
  ["藤林 杏", "09-09", "CLANNAD"],
  ["藤林 椋", "09-09", "CLANNAD"],
  ["昼田 貴理子", "09-13", "LOOPERS"],
  ["国崎往人", "09-14", "AIR"],
  ["和泉 ユキ", "09-17", "Heaven Burns Red"],
  ["空門 藍", "09-20", "Summer Pockets"],
  ["空門 蒼", "09-20", "Summer Pockets"],
  ["水瀬 秋子", "09-23", "Kanon"],
  ["丸山 奏多", "10-01", "Heaven Burns Red"],
  ["古河 早苗", "10-05", "CLANNAD"],
  ["アイリーン・ レドメイン", "10-07", "Heaven Burns Red"],
  ["加納 天善", "10-10", "Summer Pockets"],
  ["二木 佳奈多", "10-13", "Little Busters!"],
  ["三枝 葉留佳", "10-13", "Little Busters!"],
  ["坂上 智代", "10-14", "CLANNAD"],
  ["岬 鏡子", "10-18", "Summer Pockets"],
  ["伊達 朱里", "10-21", "Heaven Burns Red"],
  ["朱鷺戸 沙耶", "10-21", "Little Busters!"],
  ["逢川 めぐみ", "10-28", "Heaven Burns Red"],
  ["岡崎 朋也", "10-30", "CLANNAD"],
  ["國見 タマ", "11-01", "Heaven Burns Red"],
  ["瑞原 あいな", "11-02", "Heaven Burns Red"],
  ["氷室 憂希", "11-03", "Kud Wafter"],
  ["神尾 晴子", "11-03", "AIR"],
  ["井ノ原 真人", "11-06", "Little Busters!"],
  ["吉野 晴彦", "11-07", "Rewrite"],
  ["樋口 聖華", "11-08", "Heaven Burns Red"],
  ["黒沢 真希", "11-22", "Heaven Burns Red"],
  ["大島 一千子", "11-29", "Heaven Burns Red"],
  ["大島 二以奈", "11-29", "Heaven Burns Red"],
  ["大島 三野里", "11-29", "Heaven Burns Red"],
  ["大島 四ツ葉", "11-29", "Heaven Burns Red"],
  ["大島 五十鈴", "11-29", "Heaven Burns Red"],
  ["大島 六宇亜", "11-29", "Heaven Burns Red"],
  ["月城 最中", "12-01", "Heaven Burns Red"],
  ["鳴瀬 小鳩", "12-02", "Summer Pockets"],
  ["笹瀬川 佐々美", "12-03", "Little Busters!"],
  ["芳野 祐介", "12-05", "CLANNAD"],
  ["天野 美汐", "12-06", "Kanon"],
  ["李映夏", "12-14", "Heaven Burns Red"],
  ["神奈 备命", "12-15", "AIR"],
  ["遠野 美凪", "12-22", "AIR"],
  ["此花 ルチア", "12-23", "Rewrite"],
  ["水瀬 名雪", "12-23", "Kanon"],
  ["古河 渚", "12-24", "CLANNAD"],
  ["菅原 千恵", "12-25", "Heaven Burns Red"],
  ["西森 柚咲", "12-27", "Charlotte"],
  ["堀井 佐奈", "12-27", "LOOPERS"],
];

const MONTHS = {
  "01": "1月", "02": "2月", "03": "3月", "04": "4月", "05": "5月", "06": "6月",
  "07": "7月", "08": "8月", "09": "9月", "10": "10月", "11": "11月", "12": "12月",
};

export const KEY_BIRTHDAYS = RAW.map(([name, date, series], i) => ({
  id: `key-${i}-${date}`,
  name,
  date,
  series,
  builtin: true,
  groups: [],
}));

export function todayMd(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function monthLabel(date) {
  const m = String(date).slice(0, 2);
  return MONTHS[m] || m;
}

function inGroups(item, gid) {
  if (!gid) return true;
  if (!Array.isArray(item.groups) || !item.groups.length) return true;
  return item.groups.map(String).includes(String(gid));
}

export function todayBirthdaysForGroup(content, gid) {
  const bd = content && content.birthdays;
  const items = (bd && Array.isArray(bd.items) ? bd.items : []).filter((it) => it && it.name && it.date);
  const md = todayMd();
  return items.filter((it) => it.date === md && inGroups(it, gid));
}

export function birthdayLines(persons, notice) {
  const tpl = (notice && String(notice).trim()) || "🎂 今天是 {name} 的生日～让我们一起祝TA生日快乐！";
  return persons.map((p) =>
    tpl.replace(/\{name\}/g, p.name).replace(/\{series\}/g, p.series || "").replace(/\{date\}/g, p.date)
  );
}

export function validateBirthdayDate(s) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(s).trim());
  if (!m) return null;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}