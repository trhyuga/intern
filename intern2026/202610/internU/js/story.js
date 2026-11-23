// ============================================================
//  会話イベントを起こし、見せる
// ============================================================
const Story = (() => {
  // 話し手を決める（@leader など）
  function resolve(who) {
    const me = G.player;
    const mine = Game.officersOf(me);
    const by = st => mine.slice().sort((a, b) => OFF[b][st] - OFF[a][st])[0];
    const leader = G.facs[me].leader;
    if (who === '@leader') return isMine(leader) ? leader : by('ldr');
    if (who === '@mil') return mine.filter(k => k !== leader).sort((a, b) => (OFF[b].ldr + OFF[b].tac) - (OFF[a].ldr + OFF[a].tac))[0] || leader;
    if (who === '@pol') return mine.filter(k => k !== leader).sort((a, b) => OFF[b].pol - OFF[a].pol)[0] || leader;
    if (who === '@sci') return mine.filter(k => k !== leader).sort((a, b) => OFF[b].sci - OFF[a].sci)[0] || leader;
    return who;
  }
  function eligible(ev) {
    if (ev.fac !== undefined && ev.fac !== G.player) return false;
    const done = G.evDone[ev.id];
    if (done && ev.once !== false) return false;
    if (done && ev.cool && G.turn - done < ev.cool) return false;
    try { return !!ev.cond(); } catch (e) { return false; }
  }
  // 動的な出来事：絆のある士官の戦死を悼む
  function dynamic() {
    const out = [];
    for (const [a, b, kind, desc] of OFFICER_TIES) {
      for (const [d, s] of [[a, b], [b, a]]) {
        const od = G.officers[d];
        if (od && od.st === 'dead' && od.diedAt >= G.turn - 2 && isMine(s) && !G.evDone['mourn_' + d]) {
          out.push({ id: 'mourn_' + d, bg: 'crisis', title: '星になった者',
            scenes: () => kind === 'bond' ? [
              ['narr', '', `${OFF[d].name}、${od.diedWhere}にて戦死。`],
              [s, 'sad', `……嘘だ。${shortName(OFF[d])}が、帰って来ないなんて。`],
              [s, 'sad', '（' + desc + '――その人は、もういない）'],
              [s, 'angry', '泣くのは後にする。あの人の分まで、戦わなければ。'],
            ] : [
              ['narr', '', `${OFF[d].name}、${od.diedWhere}にて戦死。`],
              [s, 'shock', `${shortName(OFF[d])}が……死んだ？`],
              [s, 'sad', '決着をつけるのは、私のはずだった。……つまらない終わり方をしてくれる。'],
            ],
            fx: () => { FX.loyal(s, 10); Game.addMerit(s, 3); } });
        }
      }
      // 宿敵が同じ旗の下に
      if (kind === 'rival' && isMine(a) && isMine(b) && !G.evDone['rival_' + a + b] && G.turn > 2) {
        out.push({ id: 'rival_' + a + b, bg: 'bridge', title: '宿敵、同じ旗の下に',
          scenes: () => [
            [a, 'angry', `……${shortName(OFF[b])}。まさか、お前と同じ艦隊にいる日が来るとはな。`],
            [b, 'normal', '不服か？ 私は悪くないと思っている。お前の手の内は、誰よりも知っているからな。'],
            [a, 'happy', 'ふん。……背中を撃つなよ。'],
            [b, 'happy', 'それはこちらの台詞だ。'],
          ],
          fx: () => { FX.loyal(a, 8); FX.loyal(b, 8); } });
      }
    }
    return out;
  }

  async function run() {
    const list = EVENTS.filter(eligible).concat(dynamic());
    // 一度に見せるのは3つまで（勢力の物語を先に）
    // 蝕の襲来はいちばん先に。その次に勢力の物語
    const pr = e => (e.id === 'c_eclipse' ? 2 : 0) + (e.fac !== undefined ? 1 : 0);
    list.sort((x, y) => pr(y) - pr(x));
    for (const ev of list.slice(0, 3)) await play(ev);
  }
  async function play(ev) {
    G.evDone[ev.id] = G.turn;
    const scenes = ev.scenes().map(([w, e, t]) => [w === 'narr' ? 'narr' : resolve(w), e, t]).filter(([w]) => w === 'narr' || OFF[w]);
    const choice = await UI.talk(ev.title, scenes, ev.choices, ev.bg);
    if (ev.fx) ev.fx();
    if (ev.choices && choice !== null && choice !== undefined) {
      const c = ev.choices[choice];
      c.fx();
      if (c.after) { const s2 = c.after().map(([w, e, t]) => [w === 'narr' ? 'narr' : resolve(w), e, t]).filter(([w]) => w === 'narr' || OFF[w]); if (s2.length) await UI.talk(null, s2, null, ev.bg, true); }
    }
    Game.save();
  }
  return { run, play, resolve };
})();
