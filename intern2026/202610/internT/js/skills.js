// ============================================================
//  必殺技（上位の武将だけ。1戦に1回）と、特定の人物同士の場面
//  type:
//   strike  隣の敵1部隊に強烈な一撃（反撃なし）       mult: 威力倍率
//   sweep   隣の敵すべてに攻撃                        mult
//   ranged  離れた敵1部隊を射抜く                     mult, range
//   dash    一撃のあと、もう一度動ける                 mult
//   roar    周りの敵の士気を大きく下げ、混乱させる      range, morale, conf
//   confuse 周りの敵を混乱させる                       range, prob
//   fire    狙った場所の周り一帯を火の海に             range, dmg
//   chain   つながった敵部隊すべてに火が回る（連環）    range, dmg
//   buff    味方全体を強くする                         atk, guard, days, morale
//   heal    味方全体の兵を回復                         heal, morale
//  extra: 'confuse' 狙った敵を混乱 / 'fear' 周りの敵の士気↓ / 'rally' 味方の士気↑ / 'self' 自分の士気を最大に
//  技の名前は人物の逸話・演義の場面にちなむゲーム上の演出
// ============================================================
const SKILLS = {
  '関羽':   { name: '青龍偃月・一閃', type: 'strike', mult: 2.6, extra: 'fear', line: '我が青龍刀の錆となれ！' },
  '張飛':   { name: '燕人の大喝', type: 'roar', range: 2, morale: 35, conf: 0.7, line: '燕人張飛ここにあり！ 死にたい奴からかかってこい！' },
  '趙雲':   { name: '七進七出', type: 'dash', mult: 1.9, line: '我が槍を阻める者なし！' },
  '呂布':   { name: '天下無双', type: 'sweep', mult: 2.2, line: '雑魚どもが、まとめて消し飛べ！' },
  '馬超':   { name: '西涼の鉄騎', type: 'strike', mult: 2.2, extra: 'confuse', line: '西涼の騎馬の恐ろしさ、思い知れ！' },
  '許褚':   { name: '虎痴の剛力', type: 'strike', mult: 2.4, line: 'うおおおおっ！' },
  '典韋':   { name: '双戟乱舞', type: 'sweep', mult: 1.9, line: '殿には指一本触れさせん！' },
  '黄忠':   { name: '百歩穿楊', type: 'ranged', mult: 2.5, range: 3, line: '老いてなお、この矢は外れぬ！' },
  '夏侯淵': { name: '神速の奇襲', type: 'dash', mult: 1.8, line: '三日で五百里、遅れるな！' },
  '夏侯惇': { name: '抜矢啖睛', type: 'strike', mult: 1.9, extra: 'self', line: '父の精、母の血、捨てるわけにはいかん！' },
  '張遼':   { name: '遼来来', type: 'strike', mult: 2.0, extra: 'fear', line: '張遼、見参！ 道を開けい！' },
  '甘寧':   { name: '百騎夜襲', type: 'strike', mult: 2.2, extra: 'confuse', line: '鈴の音が聞こえたら最期だぜ！' },
  '太史慈': { name: '神弓', type: 'ranged', mult: 2.2, range: 3, line: 'この距離なら外さん！' },
  '孫策':   { name: '小覇王の突撃', type: 'strike', mult: 2.2, extra: 'rally', line: '江東の小覇王に続け！' },
  '龐徳':   { name: '決死の棺', type: 'strike', mult: 2.3, extra: 'self', line: '生きて帰るつもりはない！' },
  '魏延':   { name: '子午谷の奇襲', type: 'dash', mult: 1.9, line: '俺の策なら一気に勝負がつく！' },
  '姜維':   { name: '麒麟児の奇策', type: 'strike', mult: 1.8, extra: 'confuse', line: '槍と策、両方で参ります' },
  '顔良':   { name: '河北の猛将', type: 'strike', mult: 2.1, line: '河北の顔良を知らんのか！' },
  '文醜':   { name: '河北の猛将', type: 'strike', mult: 2.1, line: 'この文醜の前に立つとは！' },
  '孟獲':   { name: '南蛮の猛攻', type: 'sweep', mult: 1.6, line: 'おれ様の力を見ろ！' },
  '祝融':   { name: '飛刀', type: 'ranged', mult: 2.0, range: 2, line: 'あたしの飛刀、かわせるかしら？' },
  '諸葛亮': { name: '八陣図', type: 'confuse', range: 3, prob: 0.65, guard: 0.7, days: 2, line: '石兵八陣。入れば出られませぬ' },
  '周瑜':   { name: '業火', type: 'fire', range: 3, dmg: 0.18, line: '東南の風よ、炎を運べ！' },
  '龐統':   { name: '連環の計', type: 'chain', range: 3, dmg: 0.16, line: 'つながった陣は、一つ燃えれば皆燃える' },
  '陸遜':   { name: '連営焼き', type: 'chain', range: 3, dmg: 0.14, line: '連なる陣は、火に弱いものです' },
  '郭嘉':   { name: '遺計', type: 'confuse', range: 4, prob: 0.5, target: 'commander', line: '敵の大将の心は、すでに読めております' },
  '賈詡':   { name: '乱武', type: 'confuse', range: 3, prob: 0.5, morale: 10, line: '乱れた敵ほど、脆いものはありません' },
  '司馬懿': { name: '堅守', type: 'buff', guard: 0.6, days: 2, morale: 10, line: '守りを固めよ。敵は必ず焦れる' },
  '曹操':   { name: '覇王の号令', type: 'buff', atk: 1.3, days: 2, morale: 20, line: '天下を取るのは我らだ！ 全軍、かかれ！' },
  '劉備':   { name: '仁徳の檄', type: 'heal', heal: 0.12, morale: 15, line: '皆、もう少しだ。共に生きて帰ろう！' },
  '孫権':   { name: '江東の結束', type: 'buff', atk: 1.15, guard: 0.85, days: 2, morale: 15, line: '父と兄の江東、皆で守り抜くぞ！' },
};

// 戦場で特定の人物同士がぶつかったときの場面（一騎討ち・攻撃の前に判定）
// who: [挑む側, 受ける側]（どちら向きでも可）。kind:
//   'draw'    決着がつかず、両者の士気が上がる（夜を徹しての一騎打ちなど）
//   'spare'   勝った側が相手を討たずに逃がす
//   'trio'    三英戦呂布：劉備・関羽・張飛のうち2人以上が同じ戦場にいると、呂布が退く
//   'guard'   典韋が主君への一騎討ちを引き受ける
//   'letgo'   華容道：関羽が追い詰められた曹操を見逃す（ゲーム中1回）
const PAIRS = [
  { who: ['関羽', '黄忠'], kind: 'spare', title: '長沙の一騎討ち',
    winLines: {
      '関羽': ['関羽「老将、よくぞここまで……馬がつまずいた者を討つのは武人の恥だ。馬を替えて出直せ」', '黄忠「……その恩、次の一矢で返そう。わざと兜の緒を射るにとどめてな」'],
      '黄忠': ['黄忠「見事な腕よ。だが今日は、このわしの勝ちだ。命までは取らぬ」', '関羽「……老将、その弓、わざと急所を外したな」'],
    }, lines: [] },
  { who: ['張飛', '馬超'], kind: 'draw', title: '葭萌関の夜戦', lines: ['張飛「まだ終わらねえぞ！ 松明を灯せ！」', '馬超「望むところだ！ 夜通しでも相手になってやる！」', '――松明の下、二人の一騎打ちは決着がつかなかった'] },
  { who: ['許褚', '馬超'], kind: 'draw', title: '裸の一騎打ち', lines: ['許褚「鎧が邪魔だ！ 脱いでかかってこい！」', '馬超「面白い、虎痴め！」', '――百合を超えても勝負はつかず、両軍は息をのんだ'] },
  { who: ['孫策', '太史慈'], kind: 'draw', title: '神亭の一騎打ち', respect: true, lines: ['孫策「お前のような豪傑、敵にしておくのは惜しいな！」', '太史慈「その言葉、覚えておこう！」', '――兜と手戟を奪い合い、二人は笑って別れた'] },
  { who: ['関羽', '顔良'], kind: 'normal', title: '白馬の戦い', lines: ['関羽「あれが顔良か。首を差し出せ！」', '――関羽は大軍の中を一直線に駆け抜けた'] },
  { who: ['趙雲', '文醜'], kind: 'normal', title: '磐河の一騎打ち', lines: ['趙雲「常山の趙子龍、お相手いたす」', '文醜「若造が！」'] },
];

// 全国イベント（特定の人物がそろったとき）は events.js の HIST に入れている
