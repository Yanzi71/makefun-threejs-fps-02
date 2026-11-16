// One seeded random source for the whole game, so a screenshot run (seed=N) plays
// the same bots the same way every time. Gameplay uses the shared instance; the
// screenshot modes reseed it before staging the scene.
export function mulberry32(initial) {
  let a = initial >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The game's live random stream. Reseeded by main.js for ?shot= captures.
export const rng = {
  next: mulberry32((Date.now() % 2147483647) || 1),
  seed(value) {
    this.next = mulberry32(value || 1);
  },
  range(min, max) {
    return min + this.next() * (max - min);
  },
  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  },
};
