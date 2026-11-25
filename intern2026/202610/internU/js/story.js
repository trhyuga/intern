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
    if (who === '@staff') return G.staff && G.staff.on && isMine(G.staff.key) ? G.staff.key : resolve('@pol');
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
  // 関係・個人の物語・幕間・国家間の出来事は People が用意する（js/people.js）
  function dynamic() { return typeof People !== 'undefined' ? People.pending() : []; }

  async function run() {
    const list = EVENTS.filter(eligible).concat(dynamic().filter(e => !G.evDone[e.id]));
    // 一度に見せるのは3つまで（勢力の物語を先に）
    // 蝕の襲来はいちばん先に。その次に勢力の物語
    //  優先：蝕 > 国の章 > 死別 > 国家間・捕縛 > 幕間 > 個人の物語 > 関係 > その他
    const pr = e => e.id === 'c_eclipse' ? 10 : e.fac !== undefined ? 6 : (e.pr || 0);
    list.sort((x, y) => pr(y) - pr(x));
    for (const ev of list.slice(0, 3)) await play(ev);
  }
  // 自国の物語で、寝返った・捕まった自国の人物の台詞は飛ばす（他国の人物はそのまま）
  const away = (ev, w) => ev.home !== undefined && OFF[w].fac0 === ev.home && (G.officers[w].st !== 'act' || G.officers[w].fac !== ev.home);
  async function play(ev) {
    G.evDone[ev.id] = G.turn;
    if (ev.valid && !ev.valid()) return;   // 前の出来事で、もう片づいた（取り戻した捕虜など）
    const scenes = ev.scenes().map(([w, e, t]) => [w === 'narr' ? 'narr' : resolve(w), e, t]).filter(([w, , t]) => t && (w === 'narr' || (OFF[w] && G.officers[w] && G.officers[w].st !== 'dead' && !away(ev, w))));
    if (!scenes.length) { G.evDone[ev.id] = G.turn; return; }
    const choice = await UI.talk(ev.title, scenes, ev.choices, ev.bg);
    if (ev.fx) ev.fx();
    if (ev.choices && choice !== null && choice !== undefined) {
      const c = ev.choices[choice];
      c.fx();
      if (c.after) { const s2 = c.after().map(([w, e, t]) => [w === 'narr' ? 'narr' : resolve(w), e, t]).filter(([w, , t]) => t && (w === 'narr' || (OFF[w] && G.officers[w] && G.officers[w].st !== 'dead'))); if (s2.length) await UI.talk(null, s2, null, ev.bg, true); }
    }
    Game.save();
  }
  return { run, play, resolve };
})();
