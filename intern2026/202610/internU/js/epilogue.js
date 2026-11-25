// ============================================================
//  人物たちのその後（結末で流す）
//  Epilogue.scenes(type) … type: 'conquest'（武力統一）/ 'peace'（和平）
//  UI.talk に渡せる場面の配列 [[話し手 or 'narr', 表情, 文], ...] を返す
// ============================================================
const Epilogue = (() => {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const nm = k => (OFF[k] && OFF[k].name) || '名もなき者';
  const prof = k => (typeof People !== 'undefined' && People.prof) ? People.prof(k) : (PEOPLE.P[k] || null);
  const me = k => { const p = prof(k); return (p && p.me) || (OFF[k] && OFF[k].female ? '私' : '俺'); };
  const st = k => (G.officers[k] ? G.officers[k].st : null);
  const merit = k => (G.officers[k] ? G.officers[k].merit || 0 : 0);
  const ties = () => {
    try { if (typeof People !== 'undefined' && People.all) return People.all(); } catch (e) { /* 下へ */ }
    return (PEOPLE.TIES || []).filter(t => OFF[t.a] && OFF[t.b]);
  };
  const tiesOf = k => ties().filter(t => t.a === k || t.b === k);
  const other = (t, k) => (t.a === k ? t.b : t.a);

  // ---------- 本人の一言（性格ごと。{me} は一人称） ----------
  const SAY = {
    peace: {
      猛進: ['戦の無い空というのは、どうにも広すぎる。……まあ、慣れてみせるさ。', '剣を置けと言われてもな。{me}にできるのは、守ることくらいだ。'],
      沈着: ['終わりましたね。……ええ、ようやく、終わったのです。', '和平は結ぶより守る方が難しい。{me}の仕事は、これからです。'],
      策士: ['戦わずに済む盤面を作る。それが一番の手でしたよ。', '次の謀は、誰も死なずに済むものにしましょう。'],
      仁徳: ['これで、子どもたちが空を怖がらずに済みます。', '失ったものは戻りません。だからこそ、残ったものを大切に。'],
      野心: ['剣で取れぬものは、言葉で取る。{me}の野心は、まだ終わっていない。', '平和の世にも、上り詰める道はある。見ていてください。'],
      忠烈: ['主が選んだ道です。{me}は最後まで、その盾であり続けます。', '剣を収めるのも、忠義のうちでしょう。'],
      奔放: ['さて、平和になったら何をしようか。まずは寝坊からだな。', '退屈になったら、また星の果てまで飛んでいくさ。'],
    },
    conquest: {
      猛進: ['勝った。……だが、斬り合った相手の顔が、今も浮かぶ。', '銀河は一つになった。{me}の剣も、ようやく眠れる。'],
      沈着: ['勝利は始まりにすぎません。治めることこそが、本当の戦です。', '流れた血の重さを、{me}は忘れません。'],
      策士: ['すべての駒は盤に収まりました。……打ち手が残ったのは、幸運でしたね。', '勝った後の謀こそが、国を長らえさせるのです。'],
      仁徳: ['勝った側にも、負けた側にも、同じように朝が来ますように。', '傷ついた星々を癒やすのが、{me}の次の務めです。'],
      野心: ['銀河の頂に立った。……思っていたより、風が冷たい。', 'ここまで来た。だが、{me}はまだ先を見ている。'],
      忠烈: ['主の旗が、銀河のすべてに翻りました。{me}に悔いはありません。', 'この命、最後まで主のために。'],
      奔放: ['統一ねえ。地図が一色になると、ちょっと寂しいもんだな。', '勝った勝った。さて、次はどこへ遊びに行こうか。'],
    },
  };
  const LEADER_SAY = {
    peace: ['剣を置く日が来た。{me}は、この静けさを守り抜こう。', '誰も勝たず、誰も滅びなかった。それでよい。'],
    conquest: ['銀河は一つになった。この重さを、{me}は生涯背負っていく。', '勝ち取ったのではない。託されたのだ。'],
  };

  // ---------- 行く末（能力で決める） ----------
  function fate(k, type, isLd) {
    const o = OFF[k], n = nm(k), pz = type === 'peace';
    if (isLd) return pz
      ? `${n}は諸国との盟約を守り、長く穏やかな治世を敷いた。その名は「剣を置いた君主」として語り継がれる。`
      : `${n}は統一銀河の初代の主として玉座に就いた。厳しくも公正な統治は、やがて戦の傷を少しずつ塞いでいった。`;
    const s = { tac: o.tac + o.ldr * 0.5, pol: o.pol + o.dip * 0.5, sci: o.sci * 1.2 };
    const best = Object.keys(s).sort((a, b) => s[b] - s[a])[0];
    if (o.age >= 64) return pz
      ? `${n}は職を辞し、故郷の星で若い者たちに昔語りをして余生を過ごした。`
      : `${n}は統一を見届けて退いた。最後の航海日誌は、穏やかな一文で終わっている。`;
    return fresh(FATE[best][type], n);
  }
  const FATE = {
    tac: {
      peace: ['{n}は軍の長となり、和平を守る艦隊を率いた。その艦隊が砲を撃つことは、ついに一度もなかった。',
        '{n}は国境の守備艦隊を預かった。哨戒の航路で見る星は、戦の頃より少しだけ明るく見えたという。',
        '{n}は士官学校の長となり、「撃たずに済ませる術」を若い士官たちに説き続けた。',
        '{n}は諸国合同の救難艦隊を率い、かつての敵国の民を幾度も救った。'],
      conquest: ['{n}は統一宇宙軍の総司令に就き、辺境の残り火を一つずつ鎮めていった。',
        '{n}は辺境方面軍を率い、最後まで降らなかった星々と粘り強く向き合った。',
        '{n}は士官学校の長となり、勝ち方よりも、勝った後の振る舞いを教えた。',
        '{n}は艦隊を降り、戦没者の遺品を各地の遺族へ届けて回る旅に出た。'],
    },
    pol: {
      peace: ['{n}は宰相として諸国との調停にあたり、幾度もの危機を言葉だけで越えた。',
        '{n}は諸国会議の常任代表となり、その穏やかな声はやがて銀河の調停の要となった。',
        '{n}は荒れた辺境星系の総督に就き、十年かけてそこを豊かな星へと変えた。'],
      conquest: ['{n}は旧敵国の総督に任じられ、恨みの残る星々を粘り強く治めた。',
        '{n}は統一銀河の宰相となり、ばらばらだった法と暦を一つにまとめあげた。',
        '{n}は降った国々の言い分を聞く役所を開き、多くの反乱を未然に防いだ。'],
    },
    sci: {
      peace: ['{n}は研究所を開き、戦のための技術を、人を運び、癒やすための技術へと作り変えた。',
        '{n}は諸国共同の研究所の長となり、国境を越えて学ぶ若者たちを迎え入れた。'],
      conquest: ['{n}は研究所の長となり、戦で荒れた星々をよみがえらせる技術に生涯を注いだ。',
        '{n}は兵器の設計図をすべて封印し、新しい航路の開発に身を捧げた。'],
    },
  };
  let used = new Set();
  function fresh(list, n) {
    const c = list.filter(x => !used.has(x)); const t = pick(c.length ? c : list); used.add(t);
    return t.replace(/\{n\}/g, n);
  }

  // ---------- 二人のその後（関係の種類ごと） ----------
  const PAIR = {
    love: (a, b, pz) => `${a}と${b}は、${pz ? '静かな辺境の星に小さな家を構え' : '戦の終わった都の片隅で'}、ようやく並んで暮らし始めた。`,
    family: (a, b) => `${a}と${b}は、久しぶりに同じ食卓を囲んだ。言葉は少なかったが、それで足りた。`,
    bond: (a, b) => `${a}と${b}は、年に一度、あの頃と同じ酒を酌み交わすことを約束した。`,
    mentor: (a, b) => `${a}は${b}の歩みを遠くから見守り、${b}はいつしか、自らも誰かの師となった。`,
    rival: (a, b) => `${a}と${b}は、戦の終わった空で、最後の手合わせをした。決着は、二人だけが知っている。`,
    grudge: (a, b, pz) => `${a}と${b}の間の溝は、${pz ? 'すぐには埋まらなかった。それでも、互いに背を向けることはなくなった' : '消えはしなかった。だが二人とも、もう剣を抜こうとはしなかった'}。`,
  };

  function scenes(type) {
    type = type === 'conquest' ? 'conquest' : 'peace';
    const pz = type === 'peace';
    used = new Set();
    const fid = G.player, out = [];
    const F = FACTIONS[fid] || { name: '我が国' };
    const leader = G.facs && G.facs[fid] ? G.facs[fid].leader : null;
    const mine = Object.keys(G.officers).filter(k => OFF[k] && G.officers[k].fac === fid && (st(k) === 'act' || st(k) === 'dead'));

    // 人を選ぶ：君主 → 武功の多い者 → 関係の深い者（合わせて最大8人）
    const sel = [];
    const add = k => { if (k && OFF[k] && !sel.includes(k) && sel.length < 8) sel.push(k); };
    if (leader && mine.includes(leader)) add(leader);
    const byMerit = mine.filter(k => k !== leader).sort((a, b) => merit(b) - merit(a));
    byMerit.slice(0, 5).forEach(add);
    for (const k of sel.slice()) for (const t of tiesOf(k)) { const ot = other(t, k); if (mine.includes(ot) && sel.length < 8) add(ot); }
    byMerit.forEach(k => { if (sel.length < 6) add(k); });

    out.push(['narr', '', pz
      ? '戦が終わり、星々の間に静けさが戻った。人々はそれぞれの明日へと歩き出す。'
      : '最後の砲声が消え、銀河はひとつの旗の下に収まった。戦い抜いた者たちの、その後を記す。']);

    const live = sel.filter(k => st(k) === 'act');
    for (const k of sel) {
      if (st(k) === 'dead') {
        const o = G.officers[k];
        const where = o.diedWhere ? `${o.diedWhere}で散った` : '戦に散った';
        const mourn = tiesOf(k).map(t => other(t, k)).find(x => G.officers[x] && G.officers[x].st === 'act' && G.officers[x].fac === fid);
        out.push(['narr', '', mourn
          ? `${where}${nm(k)}の墓前には、今も${nm(mourn)}が花を手向けに訪れる。「${pick(['見ていてくれ', '終わったよ', 'お前の分まで生きる'])}」と、小さく呟いて。`
          : `${where}${nm(k)}の名は、${pz ? '和平の碑' : '統一の碑'}の最初の列に刻まれた。`]);
        continue;
      }
      const isLd = k === leader;
      const pool = isLd ? LEADER_SAY[type] : (SAY[type][OFF[k].pers] || SAY[type]['沈着']);
      out.push([k, pz ? 'happy' : 'normal', fresh(pool, '').replace(/\{me\}/g, me(k))]);
      out.push(['narr', '', fate(k, type, isLd)]);
    }

    // 二人のその後（両方生きている関係、最大3組）
    const seen = new Set(); let n = 0;
    for (const t of ties()) {
      if (n >= 3) break;
      if (!live.includes(t.a) || !live.includes(t.b) || !PAIR[t.kind]) continue;
      const key = [t.a, t.b].sort().join('|'); if (seen.has(key)) continue; seen.add(key);
      out.push(['narr', '', PAIR[t.kind](nm(t.a), nm(t.b), pz)]); n++;
    }

    // 捕らわれた者・去った者（もとは我が国の者）を短く
    const lost = Object.keys(G.officers).filter(k => OFF[k] && G.officers[k].ever === fid && G.officers[k].fac !== fid && G.officers[k].st === 'cap');
    if (lost.length) out.push(['narr', '', `捕らわれていた${nm(lost[0])}${lost.length > 1 ? 'たち' : ''}も、${pz ? '和平の取り決めで' : '戦の終わりとともに'}故国の土を踏んだ。`]);

    let date = ''; try { date = Game.dateStr(); } catch (e) { date = ''; }
    out.push(['narr', '', pz
      ? `${date ? date + '。' : ''}${F.name}の名は、剣ではなく約束によって、銀河の歴史に刻まれた。`
      : `${date ? date + '。' : ''}${F.name}による統一をもって、長い戦乱の時代は幕を閉じた。星々は、まだ静かに瞬いている。`]);
    return out;
  }

  return { scenes };
})();
