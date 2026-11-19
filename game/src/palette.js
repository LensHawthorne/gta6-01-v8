// Palette, names, districts and dialogue lines for Solara Bay.
// Every name, place and person here is invented for this game.

export const PALETTE = {
  skyDayTop: 0x6fb9e8,
  skyDayBottom: 0xcfeef7,
  skyNightTop: 0x0b1c33,
  skyNightBottom: 0x27435e,
  sun: 0xffe9a8,
  sand: 0xe9d6a4,
  water: 0x2fa8b8,
  waterDeep: 0x1d7f9e,
  asphalt: 0x767e88,
  asphaltLight: 0x8a929c,
  sidewalk: 0xcbbfa4,
  grass: 0x7fae62,
  // Bright, varied facades — never dark flat boxes.
  facades: [
    0xf2e3c6, // warm cream
    0xe8a06a, // terracotta
    0xe8a7b8, // pastel rose
    0x9cc8d8, // pale glass blue
    0xe8c95c, // mustard
    0xf6d9b8, // peach
    0xa8d8c8, // mint
    0xd8b8e8, // lilac
    0xf0f0e8, // off-white
    0xe88a6a, // coral
  ],
  roofs: [0x8a6a4a, 0x6a7a8a, 0xa85a3a, 0x4a6a7a, 0x9a8a6a],
  carColors: [
    0xe8382e, 0xffb02e, 0x2fa8b8, 0x7a4fd0, 0x2ecc71, 0xff6a9a,
    0xf2f2f2, 0x3a7bd5, 0xff7a2e, 0x9a5a2e, 0x27d3a2, 0xd23a6a,
  ],
  pedShirts: [
    0xe8382e, 0xffb02e, 0x2fa8b8, 0x7a4fd0, 0x2ecc71, 0xff6a9a,
    0xf2f2f2, 0x3a7bd5, 0xff7a2e, 0x9a5a2e, 0x27d3a2, 0xd23a6a,
    0xffe066, 0x8a2be2, 0x00b3a4, 0xff8c42,
  ],
  pedPants: [0x2e3a4a, 0x4a3a2e, 0x6a6a7a, 0x1e2e3e, 0x7a5a3a, 0x3a4a5a],
  skinTones: [0xf2c89a, 0xd9a06a, 0x8a5a3a, 0xe8b88a, 0xc98a5a, 0x6a4530],
};

export const DISTRICTS = [
  { name: 'Beachfront', x0: 200, z0: -320, x1: 340, z1: 320 },
  { name: 'Marina', x0: 200, z0: -320, x1: 340, z1: -140 },
  { name: 'Downtown', x0: -120, z0: -120, x1: 120, z1: 120 },
  { name: 'Night Market', x0: -260, z0: 96, x1: -120, z1: 260 },
  { name: 'Old Town', x0: -260, z0: -260, x1: -120, z1: 96 },
  { name: 'Harbor Heights', x0: -120, z0: -260, x1: 200, z1: -120 },
  { name: 'Palm Row', x0: -120, z0: 120, x1: 200, z1: 260 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d.name;
  }
  return 'Solara Bay';
}

// PCPD units: every unit has a name, a callsign and a role the HUD shows.
export const POLICE_UNITS = [
  { callsign: 'Unit 7', name: 'Vega', role: 'Interceptor' },
  { callsign: 'Unit 12', name: 'Marsh', role: 'Pursuit' },
  { callsign: 'Unit 3', name: 'Okafor', role: 'Blockade' },
  { callsign: 'Unit 19', name: 'Reyes', role: 'Pursuit' },
  { callsign: 'Unit 5', name: 'Kowalski', role: 'Interceptor' },
  { callsign: 'Unit 22', name: 'Tanaka', role: 'Blockade' },
  { callsign: 'Unit 9', name: 'Doyle', role: 'Pursuit' },
  { callsign: 'Unit 14', name: 'Ferro', role: 'Interceptor' },
  { callsign: 'Air 1', name: 'Hawk', role: 'Helicopter' },
];

export const CREW = [
  { name: 'Faro', role: 'Fixer', ability: "Faro's Eye" },
  { name: 'Lena', role: 'Driver', ability: 'Nitro Boost' },
  { name: 'Otis', role: 'Muscle', ability: 'Ghost' },
];

export const RANKS = [
  { rp: 0, name: 'Rookie' },
  { rp: 100, name: 'Runner' },
  { rp: 250, name: 'Wheelman' },
  { rp: 500, name: 'Hustler' },
  { rp: 900, name: 'Bay Boss' },
  { rp: 1500, name: 'King of the Bay' },
];

export function rankFor(rp) {
  let out = RANKS[0];
  for (const r of RANKS) if (rp >= r.rp) out = r;
  return out.name;
}

export const FARO_LINES = {
  intro: "Mara. You're out. Good. The bay missed you — the money didn't. First job: wheels.",
  m1done: "Nice wheels. Now bring it to Faro's Garage.",
  m2start: "Two stars! Now lose the cops — stay clean until the stars fade.",
  m2done: "Clean. The PCPD has the memory of a goldfish.",
  m3start: "Bay Tour: pier, marina, south beach, north point. Drive the coast, show the flag.",
  m4start: "Sunset Run. Three checkpoints, 75 seconds. Lena timed it. Don't embarrass her.",
  m5start: "Dock thugs are shaking down the pier. On foot. Handle it.",
  m6start: "Night Market. Pick up six crates for the stall. Keep it quiet.",
  m7start: "Package for the marina. The PCPD will notice. Make them work for it.",
  m8start: "Last job, Mara. Five stars, sixty seconds at the tower. Then you're the Bay King.",
  win: "That's the whole bay, Mara. Every street knows your name now.",
};

export const NPC_BANTER = [
  "Nice day for the bay, huh?",
  "I saw the cops fly past — wasn't me!",
  "You hear about the new pier?",
  "Faro's looking for drivers, I hear.",
  "Sun's out, rent's due.",
  "That car looks stolen. Nice.",
  "The market's got the best fish tonight.",
  "I used to run this street. Then I got a job.",
];

export const RADIO_STATIONS = [
  { name: 'Bay FM', desc: 'Solara Pop', tempo: 116, minor: false },
  { name: 'Harbor Rock', desc: 'Guitar Nights', tempo: 96, minor: true },
  { name: 'Night Drive', desc: 'Lo-fi Coast', tempo: 78, minor: true },
];
