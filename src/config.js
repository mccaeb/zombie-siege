// All gameplay tuning lives here. Units are metres and seconds.

export const WORLD = {
  size: 100,          // arena is size × size, centred on 0,0
  pathWidth: 4.6,
  graveRows: 9,
  trees: 11
};

export const CAMERA = {
  fov: 40,
  pitch: 58,          // degrees down from horizontal (90 = straight down)
  distance: 22,       // starting distance from player
  maxZoomOut: 1.8,    // camera pulls back to this × distance as the horde grows
  lookAhead: 2.2      // how far the camera leans towards where you aim
};

export const PLAYER = { radius: 0.75, speed: 11.5, maxHp: 100, invuln: 0.45 };

export const ZOMBIES = {
  walker: { radius: 0.75, hp: 3,  speed: 3.1, dmg: 12, pts: 10, scale: 1.0,  shirt: 0x4a4a5e, skin: 0x8fa36b, eye: 0xff2d1e },
  runner: { radius: 0.65, hp: 2,  speed: 6.9, dmg: 9,  pts: 15, scale: 0.9,  shirt: 0x6e3a32, skin: 0xa1b073, eye: 0xff2d1e },
  brute:  { radius: 1.3,  hp: 16, speed: 2.2, dmg: 25, pts: 50, scale: 1.75, shirt: 0x3c4432, skin: 0x76895a, eye: 0xff6e28 }
};

// Weapons are permanent once found. mag = base magazine; Bigger Mags adds +50% each level.
export const WEAPONS = {
  pistol:  { name: 'Pistol',       mag: 12, rate: 0.16,  reload: 1.0, spread: 0.035, pellets: 1, speed: 48, life: 0.65, kick: 0.25, recoil: 0.12, shake: 0.12, snd: 'pistol' },
  dual:    { name: 'Dual pistols', mag: 24, rate: 0.085, reload: 1.4, spread: 0.05,  pellets: 1, speed: 48, life: 0.65, kick: 0.2,  recoil: 0.1,  shake: 0.1,  snd: 'dual' },
  smg:     { name: 'SMG',          mag: 32, rate: 0.065, reload: 1.6, spread: 0.09,  pellets: 1, speed: 50, life: 0.6,  kick: 0.15, recoil: 0.07, shake: 0.08, snd: 'smg' },
  shotgun: { name: 'Shotgun',      mag: 6,  rate: 0.55,  reload: 1.7, spread: 0.28,  pellets: 7, speed: 43, life: 0.38, kick: 1.1,  recoil: 0.3,  shake: 0.45, snd: 'shotgun' }
};
export const WEAPON_ORDER = ['pistol', 'dual', 'smg', 'shotgun'];
export const MAG_MAX_LEVEL = 3;

export const DROPS = {
  upgradeCooldown: 90,   // seconds between random upgrade drops
  firstUpgradeAfter: 45,
  supplyEveryWaves: 3,   // guaranteed upgrade crate every N waves
  bruteChance: 0.2,
  zombieChance: 0.015,
  medkitBelowHp: 70,
  pickupLife: 15,
  supplyLife: 30
};

export const WAVES = {
  base: 5, perWave: 4,
  breakSeconds: 3.4,
  clearHeal: 15,
  maxAlive: w => Math.min(60, 22 + w * 3),
  spawnGap: w => Math.max(0.2, 1.05 - w * 0.07),
  speedMult: w => Math.min(1.45, 1 + 0.035 * (w - 1)),
  runnerChance: w => (w >= 3 ? Math.min(0.38, 0.1 + 0.05 * (w - 3)) : 0),
  bruteChance: w => (w >= 5 ? Math.min(0.16, 0.04 + 0.025 * (w - 5)) : 0)
};

// Day/night. Hours: day 07–18, dusk 18–20, night 20–05, dawn 05–07.
export const DAY = {
  startHour: 16.5,
  secondsPerHour(h) {
    if (h >= 7 && h < 18) return 180 / 11;   // day lasts 3 min
    if (h >= 20 || h < 5) return 240 / 9;    // night lasts 4 min
    return 15;                                // dusk and dawn 30 s each
  },
  nightSpeedBonus: 0.15,  // zombies faster at night
  daySpeedPenalty: 0.18   // and slower in daylight
};
