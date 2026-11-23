// ============================================================
//  音（Web Audio でその場で合成。音源ファイルは使わない）
//  BGM：弦のパッド・低音・アルペジオ・旋律・打楽器を重ねた、宇宙の歌劇ふうの曲
// ============================================================
const Sound = (() => {
  let ctx = null, master = null, bgmG = null, seG = null, rev = null, noise = null;
  let muted = false, mood = null, timer = null, step = 0, nextT = 0, song = null;
  try { muted = localStorage.getItem(CONFIG.muteKey) === '1'; } catch (e) { }
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => { }); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(comp);
    bgmG = ctx.createGain(); bgmG.gain.value = 0.32; bgmG.connect(master);
    seG = ctx.createGain(); seG.gain.value = 0.5; seG.connect(master);
    // 残響（広い宇宙の響き）
    rev = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4); }
    rev.buffer = b; const wet = ctx.createGain(); wet.gain.value = 0.42; rev.connect(wet); wet.connect(master);
    bgmG.connect(rev);
    const sw = ctx.createGain(); sw.gain.value = 0.15; seG.connect(sw); sw.connect(rev);
    const nl = ctx.sampleRate; noise = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => { }); else ctx.resume().catch(() => { }); });
    if (mood) { const m = mood; mood = null; bgm(m); }
  }
  function env(g, t, a, peak, d, rel = 0.0008) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(rel, t + a + d); }

  // ---------- 楽器 ----------
  function pad(t, notes, dur, vol = 0.05, bright = 900) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(bright * 0.5, t); f.frequency.linearRampToValueAtTime(bright, t + dur * 0.5); f.frequency.linearRampToValueAtTime(bright * 0.6, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(1.2, dur * 0.3)); g.gain.setValueAtTime(vol, t + dur * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    f.connect(g); g.connect(bgmG);
    notes.forEach(n => [-6, 6].forEach(det => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + dur + 0.7); }));
  }
  function bass(t, n, dur, vol = 0.12) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = midi(n); o2.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.value = 420;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    env(g, t, 0.01, vol, dur);
    o.connect(g); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(bgmG);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  function pluck(t, n, vol = 0.05, dur = 0.5) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = midi(n);
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(400, t + dur);
    env(g, t, 0.003, vol, dur);
    o.connect(f); f.connect(g); g.connect(bgmG); o.start(t); o.stop(t + dur + 0.05);
  }
  function lead(t, n, dur, vol = 0.06, type = 'sawtooth') {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = type; o2.type = 'triangle'; o.frequency.value = midi(n); o2.frequency.value = midi(n + 12);
    lfo.frequency.value = 5.2; lg.gain.value = 4; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 2200;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.setValueAtTime(vol * 0.85, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.25);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(bgmG);
    [o, o2, lfo].forEach(x => { x.start(t); x.stop(t + dur + 0.3); });
  }
  function bell(t, n, vol = 0.05) {
    [1, 2.76, 5.4].forEach((k, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = midi(n) * k; env(g, t, 0.002, vol / (i + 1), 2.5 / (i + 1)); o.connect(g); g.connect(bgmG); o.start(t); o.stop(t + 3); });
  }
  function drum(t, kind, vol = 1, dest) {
    const out = dest || bgmG;
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

  // ---------- 曲 ----------
  // 和音は [根音, 種類]（m 短 / M 長 / s sus4）
  const CH = { m: [0, 3, 7], M: [0, 4, 7], s: [0, 5, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11] };
  const SONGS = {
    title:    { bpm: 72, chords: [[50, 'm'], [46, 'M'], [43, 'M'], [45, 's'], [50, 'm'], [46, 'M'], [48, 'M'], [45, 'M']], bars: 2, pad: 0.05, arp: 'slow', lead: true, drums: 'none', bright: 1200 },
    strategy: { bpm: 84, chords: [[48, 'M'], [43, 'M'], [45, 'm'], [41, 'M'], [48, 'M'], [43, 'M'], [41, 'M'], [43, 's']], bars: 1, pad: 0.04, arp: 'mid', lead: true, drums: 'soft', bright: 1000 },
    battle:   { bpm: 138, chords: [[45, 'm'], [45, 'm'], [41, 'M'], [43, 'M'], [45, 'm'], [48, 'M'], [43, 'M'], [44, 'M']], bars: 1, pad: 0.035, arp: 'fast', lead: true, drums: 'drive', bright: 1800 },
    crisis:   { bpm: 96, chords: [[44, 'm'], [44, 'm'], [45, 'M'], [43, 'm'], [44, 'm'], [40, 'M'], [41, 'M'], [43, 's']], bars: 1, pad: 0.05, arp: 'fast', lead: false, drums: 'war', bright: 700 },
    event:    { bpm: 66, chords: [[43, 'M7'], [40, 'm7'], [45, 'm7'], [38, 'M'], [43, 'M7'], [47, 'm'], [40, 'm'], [42, 's']], bars: 2, pad: 0.045, arp: 'slow', lead: false, drums: 'none', bright: 900 },
    ending:   { bpm: 70, chords: [[48, 'M'], [43, 'M'], [45, 'm'], [40, 'm'], [41, 'M'], [48, 'M'], [41, 'M'], [43, 'M']], bars: 2, pad: 0.055, arp: 'slow', lead: true, drums: 'timp', bright: 1400 },
    defeat:   { bpm: 58, chords: [[45, 'm'], [41, 'M'], [38, 'm'], [40, 'M']], bars: 2, pad: 0.05, arp: 'none', lead: false, drums: 'none', bright: 600 },
  };
  // 旋律（和音の音から、曲ごとに決まった動きで）
  function melodyNote(sg, ci, beat) {
    const [root, q] = sg.chords[ci % sg.chords.length];
    const tones = CH[q].map(x => root + 24 + x).concat(CH[q].map(x => root + 36 + x));
    const r = Art.srand(ci * 31 + beat * 7 + sg.bpm);
    return tones[Math.floor(r() * tones.length)];
  }
  function bgm(m) {
    if (mood === m) return;
    mood = m;
    if (!ctx) return;
    if (timer) clearInterval(timer);
    song = SONGS[m];
    step = 0; nextT = ctx.currentTime + 0.15;
    if (!song) return;
    timer = setInterval(sched, 60);
  }
  function sched() {
    if (!ctx || !song) return;
    const sp = 60 / song.bpm / 2;   // 八分音符
    while (nextT < ctx.currentTime + 0.3) {
      play(step, nextT, sp);
      step++; nextT += sp;
    }
  }
  function play(st, t, sp) {
    const sg = song, perBar = 8 * sg.bars;
    const ci = Math.floor(st / perBar), inBar = st % perBar;
    const [root, q] = sg.chords[ci % sg.chords.length];
    const tones = CH[q];
    const cycle = Math.floor(ci / sg.chords.length);
    if (inBar === 0) {
      pad(t, tones.map(x => root + 12 + x), sp * perBar, sg.pad, sg.bright);
      bass(t, root - 12, sp * perBar * 0.9, 0.11);
    }
    if (sg.drums === 'drive' && inBar % 4 === 2) bass(t, root - 12, sp * 1.5, 0.08);
    // アルペジオ
    const arpN = tones.concat([12]).map(x => root + 24 + x);
    if (sg.arp === 'fast') pluck(t, arpN[st % arpN.length], 0.035, sp * 1.4);
    else if (sg.arp === 'mid' && st % 2 === 0) pluck(t, arpN[(st / 2) % arpN.length], 0.035, sp * 2.5);
    else if (sg.arp === 'slow' && st % 2 === 0) bell(t, arpN[(st / 2) % arpN.length] + 12, 0.02);
    // 旋律（2周目から）
    if (sg.lead && cycle >= 1 && inBar % 4 === 0 && (cycle % 2 === 1 || inBar % 8 === 0)) {
      const n = melodyNote(sg, ci, inBar);
      lead(t, n, sp * (inBar % 8 === 0 ? 3.6 : 1.8), sg.drums === 'drive' ? 0.045 : 0.04);
    }
    // 打楽器
    if (sg.drums === 'drive') { if (st % 4 === 0) drum(t, 'kick'); if (st % 8 === 4) drum(t, 'snare'); drum(t, 'hat', st % 2 ? 0.6 : 1); if (inBar === 0 && ci % 4 === 0) drum(t, 'crash'); }
    if (sg.drums === 'soft') { if (st % 8 === 0) drum(t, 'kick', 0.5); if (st % 4 === 2) drum(t, 'hat', 0.4); }
    if (sg.drums === 'war') { if (st % 4 === 0) drum(t, 'timp', 0.9); if (st % 8 === 6) drum(t, 'timp', 0.6); if (st % 2) drum(t, 'hat', 0.3); }
    if (sg.drums === 'timp') { if (inBar === 0) drum(t, 'timp', 0.8); if (inBar === perBar - 2 && ci % 2) drum(t, 'timp', 0.5); }
  }
  function stopBgm() { if (timer) clearInterval(timer); timer = null; mood = null; }

  // ---------- 効果音 ----------
  function se(kind) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const tone = (f, type, a, v, d, f2) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + a); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d); env(g, t + a, 0.004, v, d); o.connect(g); g.connect(seG); o.start(t + a); o.stop(t + a + d + 0.05); };
    const nz = (a, v, d, ft, ff) => { const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); s.buffer = noise; f.type = ft; f.frequency.value = ff; env(g, t + a, 0.003, v, d); s.connect(f); f.connect(g); g.connect(seG); s.start(t + a); s.stop(t + a + d + 0.1); };
    switch (kind) {
      case 'click': tone(1200, 'sine', 0, 0.08, 0.05); break;
      case 'order': tone(880, 'triangle', 0, 0.1, 0.06); tone(1320, 'triangle', 0.05, 0.08, 0.08); break;
      case 'beam': tone(1800, 'sawtooth', 0, 0.025, 0.1, 400); break;
      case 'bigbeam': tone(600, 'sawtooth', 0, 0.08, 0.6, 80); nz(0, 0.06, 0.5, 'lowpass', 900); break;
      case 'rail': tone(300, 'square', 0, 0.04, 0.12, 60); nz(0, 0.05, 0.1, 'highpass', 3000); break;
      case 'missile': nz(0, 0.05, 0.4, 'bandpass', 1200); break;
      case 'boom': nz(0, 0.18, 0.5, 'lowpass', 700); tone(90, 'sine', 0, 0.15, 0.4, 35); break;
      case 'bigboom': nz(0, 0.35, 1.4, 'lowpass', 500); tone(70, 'sine', 0, 0.3, 1.2, 25); break;
      case 'alarm': [0, 0.35].forEach(a => tone(660, 'square', a, 0.06, 0.25, 440)); break;
      case 'skill': tone(220, 'sawtooth', 0, 0.08, 0.6, 880); nz(0.1, 0.1, 0.5, 'highpass', 2000); break;
      case 'fanfare': [[60, 0], [64, 0.15], [67, 0.3], [72, 0.5]].forEach(([n, a]) => tone(midi(n + 12), 'sawtooth', a, 0.07, a === 0.5 ? 1.2 : 0.25)); break;
      case 'lose': [[57, 0], [53, 0.35], [50, 0.7]].forEach(([n, a]) => tone(midi(n), 'triangle', a, 0.08, 0.6)); break;
      case 'turn': tone(523, 'sine', 0, 0.07, 0.3); tone(784, 'sine', 0.1, 0.06, 0.5); break;
      case 'good': tone(660, 'triangle', 0, 0.07, 0.2); tone(990, 'triangle', 0.08, 0.06, 0.3); break;
      case 'bad': tone(220, 'sawtooth', 0, 0.06, 0.4, 150); break;
      case 'event': [72, 76, 79, 84].forEach((n, i) => tone(midi(n), 'sine', i * 0.09, 0.05, 1.2)); break;
      case 'page': nz(0, 0.03, 0.08, 'highpass', 4000); break;
      case 'warp': tone(80, 'sawtooth', 0, 0.1, 1.5, 900); nz(0.2, 0.08, 1.2, 'bandpass', 1500); break;
      case 'type': tone(1600 + Math.random() * 400, 'sine', 0, 0.015, 0.02); break;
    }
  }
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem(CONFIG.muteKey, muted ? '1' : '0'); } catch (e) { }
    if (master) master.gain.value = muted ? 0 : 0.8;
    return muted;
  }
  return { init, bgm, stopBgm, se, toggleMute, get muted() { return muted; }, get ctx() { return ctx; }, drum, lead, pad, bass, bell };
})();
