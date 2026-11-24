// ============================================================
//  数値の意味づけ：「兵器 3」「民心 42」「信頼 −12」などを、見ただけで分かる言葉にする
// ============================================================
const Gloss = (() => {
  // 技術：系統ごと・段ごとの名前（TECH_UNLOCK で解放されるものと合わせる）
  const TECH_NAMES = {
    wep: ['', 'パルスレーザー', '電磁投射砲', '高収束光学系', '荷電粒子砲', '多弾頭誘導弾', '重力レンズ照準', '反陽子弾頭', '恒星級主砲理論'],
    eng: ['', '改良推進器', '大型船体構造', '空母の運用', '航路跳躍', '弩級旗艦', '慣性制御', '超光速機動', '空間折り畳み理論'],
    def: ['', 'シールド発生器', '修理ドローン', '電子戦装置', '多層装甲', '再生シールド', '自己修復外殻', '要塞衛星網', '位相防壁'],
    eco: ['', '自動化工場', '指揮中枢', '造船所の拡張', '軌道市場', '惑星改造', '恒星エネルギー網', '星間金融', '黄金時代'],
  };
  // 1段あたりの効果（data_ships.js の TECH_BRANCH の説明と同じ値）
  const PER = { wep: ['艦の火力', 7], eng: ['艦の速さ', 4], def: ['艦の耐久・シールド', 8], eco: ['収入', 7] };
  const techName = (b, lv) => TECH_NAMES[b] && TECH_NAMES[b][lv] || `${TECH_BRANCH[b].name}の強化`;
  const techEffect = (b, lv) => lv > 0 ? `${PER[b][0]} +${PER[b][1] * lv}%` : '効果なし';
  // 「兵器 Lv3（高収束光学系）」
  const techLabel = (b, lv) => `${TECH_BRANCH[b].name} Lv${lv}「${techName(b, lv)}」`;
  // その段で増えるもの（新しい武器・船体など）があれば一緒に
  function techGain(b, lv) {
    const u = TECH_UNLOCK[b] && TECH_UNLOCK[b][lv];
    return `${PER[b][0]} +${PER[b][1]}%${u ? `・${u}` : ''}`;
  }

  // 段階の言葉（値が大きいほど良いもの）
  const scale = (v, list) => { for (const [min, w, cls] of list) if (v >= min) return { w, cls }; return list[list.length - 1]; };
  const STAB = [[80, '熱狂', 'g2'], [65, '安定', 'g1'], [45, '平穏', ''], [30, '不満', 'b1'], [15, '騒乱', 'b2'], [-1, '暴動寸前', 'b3']];
  const LOYAL = [[85, '心服', 'g2'], [65, '忠実', 'g1'], [45, '普通', ''], [30, '不満', 'b1'], [15, '離反の恐れ', 'b2'], [-1, '寝返り寸前', 'b3']];
  const TRUST = [[60, '固い信頼', 'g2'], [30, '友好', 'g1'], [10, 'やや好意', ''], [-10, '様子見', ''], [-30, '警戒', 'b1'], [-60, '敵意', 'b2'], [-101, '憎悪', 'b3']];
  const STAT = [[90, 'S 当代随一', 'g2'], [80, 'A 優秀', 'g1'], [65, 'B 有能', ''], [50, 'C 並', ''], [35, 'D 不得手', 'b1'], [-1, 'E 苦手', 'b2']];
  const MORALE = [[70, '意気盛ん', 'g1'], [45, '普通', ''], [25, '動揺', 'b1'], [-1999, '崩れかけ', 'b2']];
  const stab = v => scale(v, STAB), loyal = v => scale(v, LOYAL), trust = v => scale(v, TRUST), stat = v => scale(v, STAT), morale = v => scale(v, MORALE);
  // 数値と言葉を並べた HTML（例：民心 42〈平穏〉）
  const tag = (v, g) => `${Math.round(v)}<em class="gl ${g.cls}">${g.w}</em>`;
  // 国力比 → 言葉
  function ratio(r) {
    if (r >= 2) return '圧倒している';
    if (r >= 1.3) return 'こちらが優勢';
    if (r >= 0.8) return 'ほぼ互角';
    if (r >= 0.5) return '相手が優勢';
    return '相手が圧倒的';
  }
  // 開発の段の効果（game.js の式に合わせた目安）
  function dev(k, lv, p) {
    if (k === 'ind') return `収入の土台 ×${(1 + lv * 0.075 / 0.32).toFixed(1)}（Lv0の${Math.round((1 + lv * 0.075 / 0.32) * 100)}%）`;
    if (k === 'res') return `研究の土台 ×${(1 + lv * 0.5).toFixed(1)}`;
    if (k === 'def') return `防衛衛星 ${lv}基（1基で戦力 ${p ? Math.round(Game.satPower({ ...p, def: 1 })) : '約20'}）`;
    if (k === 'yard') return lv ? `同時に ${lv * 2} 隻まで造れる` : '造船所なし（艦を造れない）';
    return '人口の伸びと民心を高める';
  }
  // 戦力の目安（艦1隻の標準を約40として）
  function power(v) {
    if (v >= 1500) return '大艦隊';
    if (v >= 700) return '主力級';
    if (v >= 300) return '中規模';
    if (v >= 100) return '小規模';
    return 'わずか';
  }
  return { TECH_NAMES, techName, techEffect, techLabel, techGain, stab, loyal, trust, stat, morale, tag, ratio, dev, power };
})();
