// ============================================================
//  6つの星間国家
//  agg: 攻めっ気（AI）／ trustBase: 他国への最初の信頼の傾き
//  parties: 国内派閥の最初の支持（主戦・通商・技術・融和）
// ============================================================
const FACTIONS = [
  { id: 0, name: 'ヴァルディス帝国', short: '帝国', col: '#e0483c', col2: '#f2c45a', emblem: 'crown',
    motto: '秩序と栄光を、星の果てまで',
    desc: '五百年続く帝政。若き皇帝が即位したばかりで、宮廷は摂政と軍閥の綱引きに揺れている。強い艦隊と豊かな工業を持つ。',
    style: '強い艦隊と工業。主戦派が強い。', diff: '★★☆',
    agg: 0.75, capital: 0, leader: 'alexis', parties: { war: 42, trade: 18, tech: 15, peace: 25 },
    bonus: { dmg: 0.06 }, bonusText: '艦の火力 +6%' },
  { id: 1, name: 'セレス自由共和国', short: '共和国', col: '#4a90e8', col2: '#bfe0ff', emblem: 'star',
    motto: '自由は議会と共にある',
    desc: '帝国から独立して二百年の民主国家。議会政治は腐敗と停滞に悩むが、人々の自由への思いは強い。外交と研究に長ける。',
    style: '外交と研究。融和派が強い。', diff: '★★☆',
    agg: 0.4, capital: 8, leader: 'eliza', parties: { war: 15, trade: 28, tech: 22, peace: 35 },
    bonus: { dip: 0.12 }, bonusText: '外交が通りやすい +12%' },
  { id: 2, name: 'メルカトル企業連合', short: '企業連合', col: '#2fc08f', col2: '#c8ffe8', emblem: 'coin',
    motto: '利益こそ、最も公平な正義',
    desc: '巨大企業の取締役会が治める商業国家。金で傭兵も技術も買う。中央のオルクス星系で機巧院と境を接する。',
    style: '豊かな資金。通商派が強い。', diff: '★☆☆',
    agg: 0.5, capital: 16, leader: 'magnus', parties: { war: 15, trade: 50, tech: 20, peace: 15 },
    bonus: { income: 0.18 }, bonusText: '収入 +18%', start: { funds: 600, ships: 2, tech: {} } },
  { id: 3, name: 'ルミナ聖教国', short: '聖教国', col: '#b48cff', col2: '#fff2c8', emblem: 'sun',
    motto: '光は、来たる蝕を祓う',
    desc: '「星喰らう闇がふたたび来る」という古い預言を奉じる宗教国家。聖女の下で結束が固く、民心が揺らぎにくい。',
    style: '民心が安定。融和派が強い。', diff: '★★☆',
    agg: 0.55, capital: 24, leader: 'celestina', parties: { war: 25, trade: 15, tech: 15, peace: 45 },
    bonus: { stab: 10 }, bonusText: '民心 +10' },
  { id: 4, name: 'ノヴァ自由同盟', short: '自由同盟', col: '#f08a30', col2: '#ffe0b0', emblem: 'wing',
    motto: '誰の旗にも、跪かぬ',
    desc: '辺境の氏族と流れ者が寄り集まった同盟。数は少ないが艦は速く、乗り手は荒い。氏族の統一はまだ道半ば。',
    style: '速い艦と荒い乗り手。小勢力の上級者向け。', diff: '★★★',
    agg: 0.6, capital: 32, leader: 'gard', parties: { war: 36, trade: 30, tech: 10, peace: 24 },
    bonus: { speed: 0.15 }, bonusText: '艦の速さ +15%', start: { funds: 700, ships: 4, tech: { eng: 1 } } },
  { id: 5, name: 'ゼノア機巧院', short: '機巧院', col: '#3fd8e8', col2: '#e0ffff', emblem: 'gear',
    motto: '我らは記憶を継ぐ',
    desc: '古代文明の演算塔を守り続ける人と機械の共同体。かつて文明を滅ぼした「蝕」の記録を持つと噂される。技術に優れる。',
    style: '高い技術。技術派が強い。', diff: '★★☆',
    agg: 0.45, capital: 19, leader: 'idea', parties: { war: 18, trade: 10, tech: 55, peace: 17 },
    bonus: { research: 0.2 }, bonusText: '研究 +20%', start: { funds: 650, ships: 5, tech: { def: 1, wep: 1 } } },
];

// 始まりの関係（書いていない組み合わせは「中立」）
//  state: war 戦争 / neutral 中立 / nap 不可侵 / trade 通商 / ally 同盟
const START_RELATIONS = [
  [0, 1, 'war', -40], [0, 5, 'neutral', -10], [0, 2, 'trade', 10],
  [1, 3, 'nap', 20], [1, 2, 'neutral', 0],
  [2, 5, 'war', -30], [3, 4, 'neutral', -15], [3, 5, 'neutral', -20],
  [4, 2, 'neutral', -10], [4, 0, 'neutral', -5],
];

const PARTIES = {
  war:   { name: '主戦派', col: '#e0483c', bonus: '造艦の費用 −15%・艦の火力 +5%' },
  trade: { name: '通商派', col: '#e8c050', bonus: '収入 +15%' },
  tech:  { name: '技術派', col: '#40c8e8', bonus: '研究 +20%' },
  peace: { name: '融和派', col: '#8ad070', bonus: '外交が通りやすい +15%・民心 +5' },
};

const REL_NAMES = { war: '戦争', neutral: '中立', nap: '不可侵', trade: '通商', ally: '同盟' };
const REL_COL = { war: '#ff5a4a', neutral: '#a0a8b8', nap: '#e8d070', trade: '#60d0a0', ally: '#60a8ff' };
