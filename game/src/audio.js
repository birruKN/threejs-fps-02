// Sound: every effect is synthesised with WebAudio — no audio files, no
// network. A short noise buffer through filters makes gunfire; oscillators
// make beeps and the round jingles. Everything no-ops until the first user
// gesture creates the context.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function noise(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = null, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    unlock,
    shot(kind) {
      if (kind === 'rifle') { noise(0.14, 900, 0.5); tone(160, 0.09, 0.25, 'square', 60); }
      else if (kind === 'smg') { noise(0.09, 1400, 0.4); tone(220, 0.06, 0.18, 'square', 90); }
      else { noise(0.11, 1100, 0.45); tone(190, 0.08, 0.22, 'square', 70); }
    },
    enemyShot(distance) {
      const g = Math.max(0.06, 0.4 - distance * 0.006);
      noise(0.12, 700, g);
    },
    dryClick() { tone(1800, 0.03, 0.12, 'square'); },
    reload() { tone(900, 0.04, 0.1, 'square'); tone(650, 0.04, 0.1, 'square', null, 0.18); },
    hit() { tone(2400, 0.05, 0.16, 'sine'); },
    kill() { tone(2400, 0.05, 0.16, 'sine'); tone(3200, 0.08, 0.16, 'sine', null, 0.07); },
    hurt() { tone(140, 0.15, 0.3, 'sawtooth', 70); },
    explosion() {
      noise(0.9, 300, 0.9);
      tone(70, 0.7, 0.5, 'sine', 30);
    },
    beep(planted) {
      tone(planted ? 1250 : 950, 0.09, 0.2, 'square');
    },
    plantDone() { tone(950, 0.1, 0.2, 'square'); tone(1250, 0.14, 0.2, 'square', null, 0.12); },
    defuseTick() { tone(1600, 0.04, 0.12, 'sine'); },
    buy() { tone(700, 0.06, 0.14, 'sine'); tone(1050, 0.08, 0.14, 'sine', null, 0.07); },
    roundWin() {
      tone(523, 0.12, 0.2, 'sine'); tone(659, 0.12, 0.2, 'sine', null, 0.12);
      tone(784, 0.22, 0.2, 'sine', null, 0.24);
    },
    roundLose() {
      tone(392, 0.16, 0.2, 'sine'); tone(311, 0.16, 0.2, 'sine', null, 0.16);
      tone(233, 0.3, 0.2, 'sine', null, 0.32);
    },
  };
}
