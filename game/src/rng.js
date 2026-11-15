// One small seeded RNG for the whole game. Deterministic in shot mode
// (seed from the URL), time-seeded in normal play. Bots, spread and scatter
// all draw from this so a capture can be replayed exactly.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(lo, hi) { return lo + next() * (hi - lo); },
    pick(list) { return list[Math.floor(next() * list.length)]; },
    int(lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
  };
}
