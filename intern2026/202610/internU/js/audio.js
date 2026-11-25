// ============================================================
//  音（Web Audio でその場で合成。音源ファイルは使わない）
//  BGM：作曲した旋律（前半 A・後半 B の展開つき）を、弦・金管・合唱・ハープ・ピアノ・打楽器で鳴らす
//   ・戦略画面の曲は、自国ごとに楽器と調が変わる
//   ・会話の場面は、内容に合わせた曲（穏やか・悲しみ・危機）に変わり、終われば元の曲へ戻る
//   ・曲の切り替えは、急に切らずに重ねて移る（クロスフェード）
//  効果音：画面の操作・戦い・国の出来事（研究・竣工・制圧・失陥・条約・宣戦・滅亡・蝕）
// ============================================================
const Sound = (() => {
  let ctx = null, master = null, bgmG = null, seG = null, rev = null, noise = null;
  let muted = false, mood = null, timer = null, step = 0, nextT = 0, song = null, songOut = null, OUT = null;
  let vol = { bgm: 0.75, se: 0.8 };
  try { muted = localStorage.getItem(CONFIG.muteKey) === '1'; } catch (e) { }
  try { const v = JSON.parse(localStorage.getItem('seisou_vol') || 'null'); if (v && typeof v.bgm === 'number') vol = { bgm: v.bgm, se: v.se }; } catch (e) { }
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // iPhone は、ほかのアプリへ移ると音の仕組みが止められ（interrupted）、戻っても鳴らないままのことがある。
  //  離れていた後に最初に画面に触れた時、音の仕組みを作り直して、流れていた曲を鳴らし直す
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let wasAway = false;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { wasAway = true; try { if (ctx.state === 'running') ctx.suspend(); } catch (e) { } }
    else { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
  });
  window.addEventListener('pagehide', () => { wasAway = true; });
  function rebuild() {
    const m = mood;
    if (timer) clearInterval(timer); timer = null;
    try { ctx.close(); } catch (e) { }
    ctx = null; mood = null; song = null; songOut = null;
    init();
    if (m) bgm(m);
  }
  const BGM_BASE = 0.34, SE_BASE = 0.55;
  // gesture：画面に触れた時に呼ぶ（その時だけ作り直せる）
  function init(gesture) {
    if (ctx) {
      if (gesture && (wasAway || ctx.state === 'interrupted' || ctx.state === 'closed')) {
        wasAway = false;
        if (IOS || ctx.state !== 'running') { rebuild(); return; }
      }
      if (ctx.state !== 'running' && ctx.state !== 'closed') { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    graph();
    ctx.onstatechange = () => { if (ctx && ctx.state === 'interrupted') wasAway = true; };
    if (mood) { const m = mood; mood = null; bgm(m); }
  }
  // 音の通り道（圧縮・主音量・BGM・効果音・残響・雑音の素）を ctx の上に作る
  function graph() {
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(comp);
    bgmG = ctx.createGain(); bgmG.gain.value = BGM_BASE * vol.bgm; bgmG.connect(master);
    seG = ctx.createGain(); seG.gain.value = SE_BASE * vol.se; seG.connect(master);
    // 残響（広い宇宙の響き）
    rev = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
    rev.buffer = b; const wet = ctx.createGain(); wet.gain.value = 0.42; rev.connect(wet); wet.connect(master);
    bgmG.connect(rev);
    const sw = ctx.createGain(); sw.gain.value = 0.15; seG.connect(sw); sw.connect(rev);
    const nl = ctx.sampleRate; noise = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
  }
  function env(g, t, a, peak, d, rel = 0.0008) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(rel, t + a + d); }
  const dst = d => d || OUT || bgmG;
  // 左右の広がり（古い Safari にはないので、その時はそのまま）
  function panned(node, p, d) {
    if (p && ctx.createStereoPanner) { const s = ctx.createStereoPanner(); s.pan.value = p; node.connect(s); s.connect(dst(d)); }
    else node.connect(dst(d));
  }

  // ---------- 楽器 ----------
  function pad(t, notes, dur, vol = 0.05, bright = 900, d) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(bright * 0.5, t); f.frequency.linearRampToValueAtTime(bright, t + dur * 0.5); f.frequency.linearRampToValueAtTime(bright * 0.6, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(1.2, dur * 0.3)); g.gain.setValueAtTime(vol, t + dur * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    f.connect(g); g.connect(dst(d));
    notes.forEach(n => [-6, 6].forEach(det => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.7); }));
  }
  function bass(t, n, dur, vol = 0.12, d) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = midi(n); o2.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.value = 420;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    env(g, t, 0.01, vol, dur);
    o.connect(g); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(dst(d));
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  function pluck(t, n, vol = 0.05, dur = 0.5, pan = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(400, t + dur);
    env(g, t, 0.003, vol, dur);
    o.connect(f); f.connect(g); panned(g, pan); o.start(t); o.stop(t + dur + 0.05);
  }
  function lead(t, n, dur, vol = 0.06, type = 'sawtooth', d) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = type; o2.type = 'triangle'; o.frequency.value = midi(n); o2.frequency.value = midi(n + 12);
    lfo.frequency.value = 5.2; lg.gain.value = 4; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 2200;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol * 0.85, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.25);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(dst(d));
    [o, o2, lfo].forEach(x => { x.start(t); x.stop(t + dur + 0.3); });
  }
  // 弦の合奏：少しずつずらした鋸波を3本、ゆっくり立ち上がり、ビブラート
  function strings(t, n, dur, vol = 0.04, pan = 0) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 2400; f.Q.value = 0.6;
    lfo.frequency.value = 5.4; lg.gain.value = 5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.25, dur * 0.4)); g.gain.setValueAtTime(vol * 0.9, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.35);
    const os = [-9, 0, 9].map(det => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det; lg.connect(o.frequency); o.connect(f); return o; });
    lfo.connect(lg); f.connect(g); panned(g, pan);
    os.concat([lfo]).forEach(x => { x.start(t); x.stop(t + dur + 0.4); });
  }
  // 金管：鋸波＋矩形波、吹き始めに明るくなる
  function brass(t, n, dur, vol = 0.05, pan = 0) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), g2 = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = midi(n); o2.frequency.value = midi(n); o2.detune.value = 4; g2.gain.value = 0.35;
    f.type = 'lowpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(2600, t + 0.07); f.frequency.linearRampToValueAtTime(1300, t + Math.min(0.5, dur));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.05); g.gain.setValueAtTime(vol * 0.8, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.2);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); panned(g, pan);
    [o, o2].forEach(x => { x.start(t); x.stop(t + dur + 0.25); });
  }
  // 合唱（「あー」の響き）：鋸波を二つの帯域で鳴らす
  function choir(t, notes, dur, vol = 0.04) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.9, dur * 0.35)); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    g.connect(dst());
    [[750, 6], [1150, 7], [2600, 9]].forEach(([fq, q], i) => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = q; const fg = ctx.createGain(); fg.gain.value = [1, 0.7, 0.25][i]; f.connect(fg); fg.connect(g);
      notes.forEach(n => [-7, 7].forEach(det => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.7); })); });
  }
  // ハープ：はじいて、ゆっくり消える
  function harp(t, n, vol = 0.05, pan = 0) {
    const g = ctx.createGain(); env(g, t, 0.003, vol, 1.6); panned(g, pan);
    [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(([k, ty, a]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = ty; o.frequency.value = midi(n) * k; og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.8); });
  }
  // ピアノ：倍音が早く消え、基音が残る
  function piano(t, n, dur, vol = 0.06, pan = 0) {
    const g = ctx.createGain(); env(g, t, 0.004, vol, Math.max(0.8, dur * 1.6)); panned(g, pan);
    [[1, 'triangle', 1, 1], [2, 'sine', 0.4, 0.5], [4, 'sine', 0.12, 0.25]].forEach(([k, ty, a, dk]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = ty; o.frequency.value = midi(n) * k; o.detune.value = k > 1 ? 3 : 0; env(og, t, 0.003, a, Math.max(0.6, dur * 1.6) * dk); o.connect(og); og.connect(g); o.start(t); o.stop(t + Math.max(0.8, dur * 1.6) + 0.2); });
  }
  function bell(t, n, vol = 0.05, d) {
    [1, 2.76, 5.4].forEach((k, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = midi(n) * k; env(g, t, 0.002, vol / (i + 1), 2.5 / (i + 1)); o.connect(g); g.connect(dst(d)); o.start(t); o.stop(t + 3); });
  }
  function synth(t, n, dur, vol = 0.04, pan = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = midi(n); f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(3600, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol * 0.7, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.1);
    o.connect(f); f.connect(g); panned(g, pan); o.start(t); o.stop(t + dur + 0.15);
  }
  function drum(t, kind, vol = 1, dest) {
    const out = dest || OUT || bgmG;
    if (kind === 'kick' || kind === 'timp') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(kind === 'timp' ? 110 : 150, t); o.frequency.exponentialRampToValueAtTime(kind === 'timp' ? 70 : 40, t + 0.3);
      env(g, t, 0.003, 0.5 * vol, kind === 'timp' ? 0.9 : 0.35); o.connect(g); g.connect(out); o.start(t); o.stop(t + 1);
    }
    if (kind === 'snare' || kind === 'hat' || kind === 'crash') {
      const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      s.buffer = noise; f.type = kind === 'snare' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 'snare' ? 1800 : 7000;
      env(g, t, 0.002, (kind === 'hat' ? 0.06 : kind === 'crash' ? 0.12 : 0.22) * vol, kind === 'crash' ? 1.5 : kind === 'snare' ? 0.18 : 0.05);
      s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 1.6);
    }
  }

  // ---------- 作曲 ----------
  //  旋律は八分音符ひとつごとの記号：数字＝音階の度数（# ♭ で半音、' で1オクターブ上、, で下）、- のばす、. 休み、| は小節の区切り（読み飛ばす）
  const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], phryg: [0, 1, 3, 5, 7, 8, 10] };
  const CH = { m: [0, 3, 7], M: [0, 4, 7], s: [0, 5, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], d: [0, 3, 6] };
  function parseMel(str, key, scale) {
    const out = [];
    str.split(/\s+/).filter(x => x && x !== '|').forEach(tok => {
      if (tok === '-') { const last = out.length ? out[out.length - 1] : null; out.push({ hold: true, of: last }); return; }
      if (tok === '.') { out.push(null); return; }
      const m = tok.match(/^([#b]?)([1-7])(['’,]*)$/); if (!m) { out.push(null); return; }
      let n = key + SCALE[scale][+m[2] - 1] + (m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0);
      for (const c of m[3]) n += c === ',' ? -12 : 12;
      out.push({ n });
    });
    return out;
  }
  const S = (key, scale, chords, mel) => ({ chords, mel, key, scale });
  const SONGS = {
    title: { bpm: 70, lead: 'strings', lead2: 'brass', arp: 'harp', drums: 'timp', pad: 0.045, bright: 1200, order: ['A', 'A', 'B', 'A'], sec: {
      A: S(62, 'minor', [[50, 'm'], [46, 'M'], [41, 'M'], [48, 'M'], [50, 'm'], [46, 'M'], [43, 'm'], [45, 'M']],
        '5 - - - 4 - 3 - | 4 - - - - - 3 2 | 3 - - - 5 - 7 - | 7 - - - 6 - 5 - | 5 - - - 1\' - - - | 7 - 6 - 1\' - 6 - | 4 - 5 - 6 - 4 - | 5 - - - - - . .'),
      B: S(62, 'minor', [[46, 'M'], [48, 'M'], [45, 'm'], [50, 'm'], [46, 'M'], [48, 'M'], [45, 'M'], [45, 'M']],
        '1\' - - - 7 - 6 - | 7 - - - 2\' - 1\' 7 | 1\' - - - 5 - 3 - | 4 - - - 5 - - - | 6 - - - 1\' - 3\' - | 2\' - - - 7 - 5 - | #7 - - - 2\' - - - | 1\' - - - . . . .') } },
    strategy: { bpm: 92, lead: 'auto', arp: 'mid', drums: 'soft', pad: 0.035, bright: 1000, walk: true, order: ['A', 'A', 'B', 'A'], sec: {
      A: S(60, 'major', [[48, 'M'], [43, 'M'], [45, 'm'], [41, 'M'], [48, 'M'], [43, 'M'], [41, 'M'], [43, 'M']],
        '1 - 3 - 5 - 3 - | 2 - - - 7, - 5, - | 1 - 3 - 6 - 5 - | 4 - - - 6 - - - | 5 - 3 - 1 - 3 - | 2 - 4 - 7 - 5 - | 6 - 5 - 4 - 3 - | 2 - - - - - . .'),
      B: S(60, 'major', [[45, 'm'], [41, 'M'], [48, 'M'], [43, 'M'], [45, 'm'], [41, 'M'], [43, 'M'], [43, 's']],
        '6 - - - 5 - 6 - | 1\' - - - 6 - - - | 5 - - - 3 - 5 - | 7 - - - 2\' - - - | 3\' - 2\' - 1\' - 6 - | 1\' - - - 4\' - 3\' - | 2\' - - - 7 - 5 - | 5 - - - . . . .') } },
    battle: { bpm: 144, lead: 'brass', arp: 'ostinato', drums: 'drive', pad: 0.03, bright: 1800, order: ['A', 'A', 'B', 'A'], sec: {
      A: S(57, 'minor', [[45, 'm'], [45, 'm'], [41, 'M'], [43, 'M'], [45, 'm'], [48, 'M'], [43, 'M'], [40, 'M']],
        '1 1 . 1 3 - 5 - | 6 - 5 - 3 - 5 - | 6 - - - 1\' - 7 6 | 7 - - - 5 - - - | 1\' - 7 - 6 - 5 - | 3 - 5 - 1\' - 3\' - | 2\' - 1\' - 7 - 5 - | #7 - - - 5 - - -'),
      B: S(57, 'minor', [[41, 'M'], [43, 'M'], [45, 'm'], [45, 'm'], [41, 'M'], [43, 'M'], [40, 'M'], [40, 'M']],
        '3\' - - - 2\' - 1\' - | 2\' - - - 7 - 5 - | 1\' - 7 - 1\' - 3\' - | 5\' - - - - - - - | 6\' - 5\' - 3\' - 1\' - | 2\' - 1\' - 7 - 5 - | #7 - - - 2\' - 3\' - | 3\' - - - - - . .') } },
    crisis: { bpm: 92, lead: 'choir', lead2: 'brass', arp: 'ostinato', drums: 'war', pad: 0.045, bright: 700, order: ['A', 'B'], sec: {
      A: S(52, 'phryg', [[40, 'm'], [40, 'm'], [41, 'M'], [40, 'm'], [40, 'm'], [48, 'M'], [41, 'M'], [47, 'd']],
        '1 - - - - - 2 - | 1 - - - . . . . | 2 - - - 3 - 2 - | 1 - - - - - . . | 5 - - - 6 - 5 - | 6 - - - 5 - 3 - | 2 - - - 3 - 4 - | 5 - - - - - - -'),
      B: S(52, 'phryg', [[48, 'M'], [50, 'm'], [41, 'M'], [40, 'm'], [48, 'M'], [50, 'm'], [41, 'M'], [40, 'm']],
        '1\' - - - 7 - 6 - | 7 - - - 5 - - - | 6 - - - 5 - 4 - | 5 - - - - - . . | 3\' - - - 2\' - 1\' - | 2\' - - - 7 - 5 - | 6 - 5 - 4 - 2 - | 1 - - - - - - -') } },
    event: { bpm: 68, lead: 'piano', arp: 'harp', drums: 'none', pad: 0.035, bright: 900, order: ['A', 'A'], sec: {
      A: S(55, 'major', [[43, 'M7'], [40, 'm7'], [45, 'm7'], [38, 'M'], [43, 'M7'], [47, 'm'], [40, 'm'], [48, 'M']],
        '3 - - 5 - - 1\' - | 7 - - - 5 - - - | 1\' - - 7 6 - 5 - | 6 - - - - - . . | 3 - - 5 - - 3\' - | 2\' - - - 7 - - - | 1\' - 7 - 6 - 5 - | 5 - - - - - . .') } },
    sad: { bpm: 60, lead: 'piano', lead2: 'strings', arp: 'none', drums: 'none', pad: 0.04, bright: 800, order: ['A', 'A'], sec: {
      A: S(62, 'minor', [[50, 'm'], [46, 'M'], [43, 'm'], [45, 'M'], [50, 'm'], [41, 'M'], [43, 'm'], [45, 'M']],
        '5 - 4 3 - - 2 - | 1 - - - 3 - - - | 4 - 3 2 - - 1 - | #7, - - - 2 - - - | 5 - 4 3 - - 1\' - | 7 - 6 5 - - 3 - | 4 - - - 3 - 2 - | 1 - - - . . . .') } },
    ending: { bpm: 72, lead: 'brass', lead2: 'strings', arp: 'harp', drums: 'timp', pad: 0.05, bright: 1400, order: ['A', 'B'], sec: {
      A: S(60, 'major', [[48, 'M'], [43, 'M'], [45, 'm'], [40, 'm'], [41, 'M'], [48, 'M'], [41, 'M'], [43, 'M']],
        '5 - - - 1\' - - - | 7 - 5 - 2\' - - - | 1\' - - - 3\' - 2\' - | 7 - - - 5 - - - | 6 - - - 1\' - 6 - | 5 - - - 3 - 5 - | 4 - 6 - 1\' - 4\' - | 2\' - - - - - - -'),
      B: S(60, 'major', [[48, 'M'], [43, 'M'], [45, 'm'], [40, 'm'], [41, 'M'], [48, 'M'], [41, 'M'], [48, 'M']],
        '3\' - - - 2\' - 1\' - | 2\' - - - 5\' - - - | 3\' - 2\' - 1\' - 6 - | 5 - - - 3\' - - - | 4\' - 3\' - 2\' - 1\' - | 3\' - - - 5\' - - - | 4\' - - - 2\' - 7 - | 1\' - - - - - - -') } },
    defeat: { bpm: 56, lead: 'piano', arp: 'none', drums: 'none', pad: 0.045, bright: 600, order: ['A'], sec: {
      A: S(57, 'minor', [[45, 'm'], [45, 'm'], [41, 'M'], [41, 'M'], [38, 'm'], [38, 'm'], [40, 'M'], [40, 'M']],
        '5 - - - 4 - 3 - | 2 - - - 1 - - - | 3 - - - 2 - 1 - | 7, - - - 6, - - - | 4 - - - 3 - 2 - | 1 - - - 7, - 6, - | #7, - - - 2 - - - | 1 - - - . . . .') } },
  };
  // 戦略画面：自国ごとの楽器・調・打楽器（帝国＝金管の行進、共和国＝弦、通商連合＝ピアノ、聖教国＝合唱と鐘、辺境連邦＝ハープ、機械知性＝電子音）
  const NATION = [
    { lead: 'brass', tr: 0, drums: 'march' }, { lead: 'strings', tr: 2, drums: 'soft' }, { lead: 'piano', tr: -3, drums: 'soft' },
    { lead: 'choir', tr: 5, drums: 'none', bells: true }, { lead: 'harp', tr: -2, drums: 'soft' }, { lead: 'synth', tr: 3, drums: 'drive2' },
  ];
  const cache = {};
  function songOf(m) {
    const base = SONGS[m]; if (!base) return null;
    let nat = null;
    if (m === 'strategy') { try { if (typeof G !== 'undefined' && G && typeof G.player === 'number') nat = NATION[G.player]; } catch (e) { } }
    const key = m + (nat ? NATION.indexOf(nat) : '');
    if (cache[key]) return cache[key];
    const tr = nat ? nat.tr : 0;
    const secs = {};
    for (const [k, s] of Object.entries(base.sec)) secs[k] = { chords: s.chords.map(([r, q]) => [r + tr, q]), mel: parseMel(s.mel, s.key + tr, s.scale) };
    const sg = Object.assign({}, base, { secs, lead: nat ? nat.lead : base.lead, drums: nat ? nat.drums : base.drums, bells: nat && nat.bells, perSec: 64 });
    return (cache[key] = sg);
  }

  // ---------- 再生 ----------
  let stack = [];
  function bgm(m) {
    if (mood === m) return;
    mood = m;
    if (!ctx) return;
    if (timer) clearInterval(timer); timer = null;
    // 前の曲は 1.2 秒かけて消す（その間、新しい曲と重なる）
    if (songOut) { const o = songOut; try { o.gain.cancelScheduledValues(ctx.currentTime); o.gain.setValueAtTime(o.gain.value, ctx.currentTime); o.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1.2); } catch (e) { } setTimeout(() => { try { o.disconnect(); } catch (e) { } }, 4000); }
    songOut = null;
    song = songOf(m);
    if (!song) return;
    songOut = ctx.createGain(); songOut.gain.setValueAtTime(0.0001, ctx.currentTime); songOut.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.9); songOut.connect(bgmG);
    step = 0; nextT = ctx.currentTime + 0.2;
    timer = setInterval(sched, 60);
  }
  // 会話などで一時的に曲を変え、終われば戻す
  function push(m) { stack.push(mood); bgm(m); }
  function pop() { if (!stack.length) return; const m = stack.pop(); if (m) bgm(m); }
  function sched() {
    if (!ctx || !song) return;
    const sp = 60 / song.bpm / 2;   // 八分音符
    while (nextT < ctx.currentTime + 0.3) {
      OUT = songOut;
      try { play(step, nextT, sp); } catch (e) { }
      OUT = null;
      step++; nextT += sp;
    }
  }
  function voice(kind, t, n, dur, v, pan) {
    switch (kind) {
      case 'strings': strings(t, n, dur, v * 0.85, pan); break;
      case 'brass': brass(t, n, dur, v, pan); break;
      case 'choir': choir(t, [n], dur, v * 1.5); break;
      case 'piano': piano(t, n, dur, v * 1.9, pan); break;
      case 'harp': harp(t, n, v * 1.7, pan); break;
      case 'synth': synth(t, n, dur, v * 0.8, pan); break;
      default: lead(t, n, dur, v);
    }
  }
  function play(st, t, sp) {
    const sg = song, total = sg.order.length * sg.perSec;
    const pos = st % total, secName = sg.order[Math.floor(pos / sg.perSec)], sec = sg.secs[secName], i = pos % sg.perSec;
    const bar = Math.floor(i / 8), inBar = i % 8;
    const [root, q] = sec.chords[bar];
    const tones = CH[q];
    const lap = Math.floor(st / total);
    if (inBar === 0) {
      pad(t, tones.map(x => root + 12 + x), sp * 8, sg.pad, sg.bright);
      if (!sg.walk) bass(t, root - 12, sp * 7.2, 0.11);
      if (sg.bells && bar % 2 === 0) bell(t, root + 36, 0.02);
    }
    if (sg.walk && inBar % 2 === 0) bass(t, root - 12 + [0, tones[1], tones[2], 12][inBar / 2], sp * 1.8, 0.09);   // 歩くような低音
    if (sg.drums === 'drive' && inBar % 4 === 2) bass(t, root - 12, sp * 1.5, 0.08);
    // 伴奏
    const arpN = tones.concat([12]).map(x => root + 24 + x);
    if (sg.arp === 'ostinato') strings(t, (inBar % 2 ? root + 19 : root + 12), sp * 0.9, 0.022, inBar % 2 ? 0.3 : -0.3);
    else if (sg.arp === 'mid' && st % 2 === 0) pluck(t, arpN[(st / 2) % arpN.length], 0.03, sp * 2.5, (st / 2) % 2 ? 0.35 : -0.35);
    else if (sg.arp === 'harp') harp(t, arpN[st % arpN.length] + (inBar >= 4 ? 12 : 0), 0.022, ((st % 4) - 1.5) * 0.25);
    // 旋律：前半は主の楽器、2周目からは重ねる楽器で厚くする（最初の4小節はひかえめに入る）
    const m = sec.mel[i];
    if (m && !m.hold) {
      let len = 1; while (sec.mel[i + len] && sec.mel[i + len].hold) len++;
      const v = sg.drums === 'drive' ? 0.05 : 0.045;
      const intro = lap === 0 && secName === 'A' && i < 32 && sg.order.length > 1;
      voice(sg.lead, t, m.n, sp * len, intro ? v * 0.7 : v, -0.12);
      if (sg.lead2 && (lap >= 1 || secName === 'B')) voice(sg.lead2, t, m.n - 12, sp * len, v * 0.55, 0.2);
    }
    // 打楽器
    const D = sg.drums;
    if (D === 'drive') { if (st % 4 === 0) drum(t, 'kick'); if (st % 8 === 4) drum(t, 'snare'); drum(t, 'hat', st % 2 ? 0.6 : 1); if (inBar === 0 && bar % 4 === 0) drum(t, 'crash'); }
    if (D === 'drive2') { if (st % 4 === 0) drum(t, 'kick', 0.7); if (st % 8 === 4) drum(t, 'snare', 0.6); if (st % 2) drum(t, 'hat', 0.5); }
    if (D === 'soft') { if (st % 8 === 0) drum(t, 'kick', 0.5); if (st % 4 === 2) drum(t, 'hat', 0.4); }
    if (D === 'march') { if (st % 4 === 0) drum(t, 'kick', 0.55); if (st % 8 === 4) drum(t, 'snare', 0.5); if (inBar === 6 || inBar === 7) drum(t, 'snare', 0.25); if (st % 2) drum(t, 'hat', 0.25); }
    if (D === 'war') { if (st % 4 === 0) drum(t, 'timp', 0.9); if (st % 8 === 6) drum(t, 'timp', 0.6); if (st % 2) drum(t, 'hat', 0.3); }
    if (D === 'timp') { if (inBar === 0) drum(t, 'timp', 0.8); if (inBar === 6 && bar % 2) drum(t, 'timp', 0.5); if (inBar === 7 && bar % 2) drum(t, 'timp', 0.6); }
  }
  function stopBgm() {
    if (timer) clearInterval(timer); timer = null; mood = null; stack = [];
    if (songOut && ctx) { const o = songOut; try { o.gain.setValueAtTime(o.gain.value, ctx.currentTime); o.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8); } catch (e) { } setTimeout(() => { try { o.disconnect(); } catch (e) { } }, 2000); }
    songOut = null;
  }

  // ---------- 効果音 ----------
  //  同じ音が一度にたくさん鳴らないように（戦い）、国の出来事の音は少しずつずらして鳴らす
  const recent = {}; let cueT = 0;
  const CUE = new Set(['research', 'build', 'capture', 'lost', 'recruit', 'seal', 'war', 'gong', 'eclipse', 'coin', 'promote']);
  function se(kind) {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    const r = recent[kind] || (recent[kind] = []);
    while (r.length && r[0] < now - 0.08) r.shift();
    if (r.length >= 3) return;
    r.push(now);
    let t = now;
    if (CUE.has(kind)) { if (cueT - now > 1.2) return; t = Math.max(now, cueT); cueT = t + 0.35; }
    const jit = k => k * (1 + (Math.random() - 0.5) * 0.12);   // 高さを少し揺らす（聞き飽きないように）
    const tone = (f, type, a, v, d, f2, pan = 0) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + a); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d); env(g, t + a, 0.004, v, d); o.connect(g); if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(seG); } else g.connect(seG); o.start(t + a); o.stop(t + a + d + 0.05); };
    const nz = (a, v, d, ft, ff, ff2) => { const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); s.buffer = noise; s.loop = true; f.type = ft; f.frequency.setValueAtTime(ff, t + a); if (ff2) f.frequency.exponentialRampToValueAtTime(ff2, t + a + d); env(g, t + a, 0.003, v, d); s.connect(f); f.connect(g); g.connect(seG); s.start(t + a); s.stop(t + a + d + 0.1); };
    const chord = (ns, type, a, v, d) => ns.forEach((n, i) => tone(midi(n), type, a + i * 0.0, v, d));
    switch (kind) {
      // 画面の操作
      case 'click': tone(1200, 'sine', 0, 0.08, 0.05); break;
      case 'open': nz(0, 0.035, 0.16, 'bandpass', 500, 2400); tone(1500, 'sine', 0.05, 0.03, 0.06); break;
      case 'close': nz(0, 0.03, 0.14, 'bandpass', 2200, 500); break;
      case 'order': tone(880, 'triangle', 0, 0.1, 0.06); tone(1320, 'triangle', 0.05, 0.08, 0.08); break;
      case 'move': nz(0, 0.05, 0.5, 'lowpass', 300, 1400); tone(110, 'sawtooth', 0, 0.03, 0.45, 160); break;
      case 'page': nz(0, 0.03, 0.08, 'highpass', 4000); break;
      case 'type': tone(1600 + Math.random() * 400, 'sine', 0, 0.015, 0.02); break;
      case 'turn': tone(523, 'sine', 0, 0.07, 0.3); tone(784, 'sine', 0.1, 0.06, 0.5); break;
      case 'good': tone(660, 'triangle', 0, 0.07, 0.2); tone(990, 'triangle', 0.08, 0.06, 0.3); break;
      case 'bad': tone(220, 'sawtooth', 0, 0.06, 0.4, 150); break;
      case 'event': [72, 76, 79, 84].forEach((n, i) => tone(midi(n), 'sine', i * 0.09, 0.05, 1.2)); break;
      case 'alarm': [0, 0.35].forEach(a => tone(660, 'square', a, 0.06, 0.25, 440)); break;
      // 戦い
      case 'beam': tone(jit(1800), 'sawtooth', 0, 0.025, 0.1, jit(400), (Math.random() - 0.5) * 0.6); break;
      case 'bigbeam': tone(jit(600), 'sawtooth', 0, 0.08, 0.6, 80); nz(0, 0.06, 0.5, 'lowpass', 900); tone(jit(1200), 'sine', 0, 0.03, 0.4, 300); break;
      case 'rail': tone(jit(300), 'square', 0, 0.04, 0.12, 60); nz(0, 0.05, 0.1, 'highpass', 3000); break;
      case 'missile': nz(0, 0.05, 0.4, 'bandpass', jit(1200), 500); break;
      case 'shield': tone(jit(2400), 'sine', 0, 0.03, 0.18, 1800); tone(jit(3600), 'sine', 0, 0.015, 0.12); break;
      case 'boom': nz(0, 0.18, 0.5, 'lowpass', jit(700), 200); tone(jit(90), 'sine', 0, 0.15, 0.4, 35); break;
      case 'bigboom': nz(0, 0.35, 1.4, 'lowpass', 500, 120); tone(70, 'sine', 0, 0.3, 1.2, 25); nz(0.05, 0.08, 0.9, 'bandpass', 2400, 600); break;
      case 'skill': tone(220, 'sawtooth', 0, 0.08, 0.6, 880); nz(0.1, 0.1, 0.5, 'highpass', 2000); tone(midi(79), 'triangle', 0.35, 0.05, 0.5); break;
      case 'warp': tone(80, 'sawtooth', 0, 0.1, 1.5, 900); nz(0.2, 0.08, 1.2, 'bandpass', 1500); break;
      case 'fanfare': [[60, 0], [64, 0.15], [67, 0.3], [72, 0.5]].forEach(([n, a]) => tone(midi(n + 12), 'sawtooth', a, 0.07, a === 0.5 ? 1.2 : 0.25)); chord([60, 64, 67].map(n => n + 12), 'triangle', 0.5, 0.03, 1.4); drum(t + 0.5, 'timp', 0.8, seG); break;
      case 'lose': [[57, 0], [53, 0.35], [50, 0.7]].forEach(([n, a]) => tone(midi(n), 'triangle', a, 0.08, 0.6)); drum(t + 0.7, 'timp', 0.6, seG); break;
      // 国の出来事
      case 'coin': tone(midi(83), 'square', 0, 0.04, 0.08); tone(midi(88), 'square', 0.07, 0.04, 0.25); break;
      case 'build': nz(0, 0.1, 0.06, 'bandpass', 3200); tone(1300, 'triangle', 0, 0.05, 0.35); tone(90, 'sine', 0, 0.12, 0.2, 50); nz(0.18, 0.06, 0.05, 'bandpass', 2800); tone(1500, 'triangle', 0.18, 0.04, 0.3); break;
      case 'research': [84, 88, 91, 96].forEach((n, i) => tone(midi(n), 'sine', i * 0.07, 0.04, 0.7)); tone(midi(72), 'triangle', 0, 0.03, 1); break;
      case 'promote': [67, 71, 74, 79].forEach((n, i) => tone(midi(n), 'triangle', i * 0.08, 0.05, 0.5)); break;
      case 'capture': [[67, 0], [72, 0.12], [76, 0.24]].forEach(([n, a]) => tone(midi(n), 'sawtooth', a, 0.06, 0.2)); chord([72, 76, 79], 'sawtooth', 0.38, 0.035, 0.9); drum(t + 0.38, 'timp', 0.7, seG); break;
      case 'lost': tone(midi(52), 'sawtooth', 0, 0.07, 0.5); tone(midi(48), 'sawtooth', 0.4, 0.07, 1.0); drum(t, 'timp', 0.8, seG); drum(t + 0.4, 'timp', 0.6, seG); break;
      case 'recruit': chord([72, 76, 79], 'triangle', 0, 0.035, 1.2); tone(midi(84), 'sine', 0.15, 0.03, 0.9); break;
      case 'seal': tone(120, 'sine', 0, 0.16, 0.25, 60); nz(0, 0.08, 0.08, 'lowpass', 900); [79, 84].forEach((n, i) => tone(midi(n), 'sine', 0.15 + i * 0.1, 0.04, 1.4)); break;
      case 'war': { [55, 59.1, 63.3, 68.9].forEach((n, i) => tone(midi(n - 12), 'sine', 0, 0.12 / (i + 1), 3.2 / (i * 0.4 + 1))); nz(0, 0.1, 0.6, 'lowpass', 700); drum(t, 'timp', 1.2, seG); break; }
      case 'gong': [43, 47.3, 51.9, 57.4].forEach((n, i) => tone(midi(n), 'sine', 0, 0.14 / (i + 1), 4 / (i * 0.4 + 1))); nz(0, 0.06, 1.5, 'bandpass', 600, 200); break;
      case 'eclipse': tone(42, 'sawtooth', 0, 0.12, 3, 30); tone(midi(40) * 1.06, 'sawtooth', 0.3, 0.05, 2.6, 60); nz(0, 0.2, 2.8, 'lowpass', 200, 1400); nz(0.6, 0.08, 2, 'bandpass', 3000, 400); tone(midi(76), 'sine', 0.8, 0.03, 2, midi(75)); break;
    }
  }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(CONFIG.muteKey, muted ? '1' : '0'); } catch (e) { }
    if (master) master.gain.value = muted ? 0 : 0.8;
    return muted;
  }
  // 音量（0〜1）。'bgm' か 'se'
  function setVol(which, v) {
    vol[which] = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('seisou_vol', JSON.stringify(vol)); } catch (e) { }
    if (bgmG && which === 'bgm') bgmG.gain.value = BGM_BASE * vol.bgm;
    if (seG && which === 'se') seG.gain.value = SE_BASE * vol.se;
  }
  // 確認用：曲を secs 秒ぶん、音声（WAV）に書き出す。ゲームの音は止めずに、別の場で鳴らす
  async function render(m, secs = 20, rate = 22050) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return null;
    const keep = { ctx, master, bgmG, seG, rev, noise, song, songOut, OUT, muted };
    try {
      ctx = new OAC(2, Math.ceil(rate * secs), rate); muted = false; graph();
      song = songOf(m); songOut = ctx.createGain(); songOut.connect(bgmG);
      const sp = 60 / song.bpm / 2; let st = 0;
      for (let t = 0.1; t < secs - 0.5; t += sp) { OUT = songOut; play(st++, t, sp); OUT = null; }
      const buf = await ctx.startRendering();
      return wav(buf);
    } finally { ({ ctx, master, bgmG, seG, rev, noise, song, songOut, OUT, muted } = keep); }
  }
  // 効果音を並べて書き出す（確認用）
  async function renderSE(kinds, gap = 1.2, rate = 22050) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return null;
    const keep = { ctx, master, bgmG, seG, rev, noise, muted, cueT };
    try {
      const secs = kinds.length * gap + 3;
      ctx = new OAC(2, Math.ceil(rate * secs), rate); muted = false; graph();
      // OfflineAudioContext の時刻は 0 のままなので、各音の開始を少しずつずらして鳴らす
      const base = ctx.currentTime;
      kinds.forEach((k, i) => { const off = base + 0.2 + i * gap; Object.defineProperty(ctx, 'currentTime', { get: () => off, configurable: true }); cueT = 0; for (const key in recent) delete recent[key]; se(k); delete ctx.currentTime; });
      return wav(await ctx.startRendering());
    } finally { ({ ctx, master, bgmG, seG, rev, noise, muted, cueT } = keep); }
  }
  function wav(buf) {
    const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const ws = (o, str) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    ws(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    return out.buffer;
  }
  return { render, renderSE, init, bgm, push, pop, stopBgm, se, toggleMute, setVol, get vol() { return Object.assign({}, vol); }, get mood() { return mood; }, get muted() { return muted; }, get ctx() { return ctx; }, drum, lead, pad, bass, bell, strings, brass, choir, harp, piano };
})();
