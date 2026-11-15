// Weapons: three guns and a frag grenade. One definition per weapon; the
// arsenal tracks ammo, cooldowns and recoil per weapon so switching keeps
// each gun's state. Spread punishes moving and firing fast — stopping to aim
// pays, exactly as the bounty asks.
export const WEAPONS = {
  pistol: {
    name: 'P9 SIDEARM', short: 'P9', price: 0, slot: 1,
    damage: 30, headMult: 3, mag: 12, reserve: 36, rate: 0.16, auto: false,
    reload: 1.3, spread: 0.006, moveSpread: 0.010, kick: 0.010, range: 60,
  },
  rifle: {
    name: 'VK-47 RIFLE', short: 'VK-47', price: 2700, slot: 2,
    damage: 34, headMult: 4, mag: 30, reserve: 90, rate: 0.10, auto: true,
    reload: 2.2, spread: 0.008, moveSpread: 0.022, kick: 0.016, range: 90,
  },
  smg: {
    name: 'RAPTOR-9 SMG', short: 'RAPTOR-9', price: 1500, slot: 3,
    damage: 26, headMult: 3, mag: 32, reserve: 96, rate: 0.075, auto: true,
    reload: 1.9, spread: 0.012, moveSpread: 0.026, kick: 0.011, range: 55,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const BUY_ITEMS = [
  { id: 'rifle', label: 'VK-47 RIFLE', price: 2700, desc: 'Auto · 34 dmg · headshot x4' },
  { id: 'smg', label: 'RAPTOR-9 SMG', price: 1500, desc: 'Fast auto · 26 dmg · close range' },
  { id: 'grenade', label: 'FRAG GRENADE', price: 300, desc: 'Throw with G · blast radius 6 m' },
  { id: 'armor', label: 'KEVLAR VEST', price: 650, desc: 'Absorbs half of incoming damage' },
];

export function createArsenal() {
  const owned = {
    pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    rifle: null,
    smg: null,
  };
  const state = {
    current: 'pistol',
    cooldown: 0,
    reloading: 0,
    reloadFor: null,
    bloom: 0, // grows while firing, decays when still
    grenades: 0,
    triggerHeld: false,
  };

  function currentDef() { return WEAPONS[state.current]; }
  function currentAmmo() { return owned[state.current]; }

  function canFire() {
    const ammo = currentAmmo();
    return state.cooldown <= 0 && state.reloading <= 0 && ammo && ammo.mag > 0;
  }

  function ready() { return state.cooldown <= 0 && state.reloading <= 0; }

  // Returns the shot's spread, or null when no round leaves the barrel.
  function fire(moving, airborne) {
    if (!canFire()) return null;
    const def = currentDef();
    const ammo = currentAmmo();
    ammo.mag -= 1;
    state.cooldown = def.rate;
    state.bloom = Math.min(1, state.bloom + 0.22);
    let spread = def.spread + state.bloom * 0.014;
    if (moving) spread += def.moveSpread;
    if (airborne) spread += 0.03;
    return { spread, kick: def.kick, damage: def.damage, headMult: def.headMult, range: def.range };
  }

  function startReload() {
    const ammo = currentAmmo();
    const def = currentDef();
    if (state.reloading > 0 || !ammo || ammo.reserve <= 0 || ammo.mag >= def.mag) return false;
    state.reloading = def.reload;
    state.reloadFor = state.current;
    return true;
  }

  function switchTo(id) {
    if (!owned[id] || id === state.current) return false;
    state.current = id;
    state.cooldown = Math.max(state.cooldown, 0.25);
    state.reloading = 0;
    state.reloadFor = null;
    return true;
  }

  function buy(id) {
    if (id === 'grenade' || id === 'armor') return id; // handled by the match
    if (owned[id]) return null;
    owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    return id;
  }

  function refill() {
    owned.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
    if (owned.rifle) owned.rifle = { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve };
    if (owned.smg) owned.smg = { mag: WEAPONS.smg.mag, reserve: WEAPONS.smg.reserve };
    state.current = owned.rifle ? 'rifle' : owned.smg ? 'smg' : 'pistol';
    state.cooldown = 0;
    state.reloading = 0;
    state.bloom = 0;
  }

  function step(dt) {
    if (state.cooldown > 0) state.cooldown -= dt;
    state.bloom = Math.max(0, state.bloom - dt * 1.6);
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) {
        const def = WEAPONS[state.reloadFor];
        const ammo = owned[state.reloadFor];
        const need = def.mag - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        ammo.reserve -= take;
        state.reloadFor = null;
      }
    }
  }

  function spreadNow(moving, airborne) {
    const def = currentDef();
    let spread = def.spread + state.bloom * 0.014;
    if (moving) spread += def.moveSpread;
    if (airborne) spread += 0.03;
    return spread;
  }

  return {
    state, owned, currentDef, currentAmmo, canFire, ready, fire,
    startReload, switchTo, buy, refill, step, spreadNow,
  };
}
