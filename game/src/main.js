// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. Owns the wiring — combat raycasts, grenades, round flow,
// buy/defuse input, death and spectating — and the deterministic shot mode
// (?shot=start|play|bomb|end&seed=N) that renders a frozen frame and sets
// window.__shotReady for captures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeRng } from './rng.js';
import { createMap, SITES, SPAWNS } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createMatch } from './rounds.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const rng = makeRng(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const match = createMatch();
const arsenal = createArsenal();
const player = createPlayer(map.colliders, SPAWNS.vanguard[1]);
const bomb = createBomb(scene, {
  audio,
  onPlanted(site) {
    hud.setBombStatus('⚠ BOMB PLANTED — DEFUSE IT', 'danger');
    bots.onBombPlanted(site);
  },
  onDefused() {
    hud.setBombStatus('', null);
    endRound('vanguard', 'Bomb defused — site held.');
  },
  onExploded(pos) {
    effects.explosion(pos);
    audio.explosion();
    blastDamage(pos, 9);
    hud.setBombStatus('', null);
    endRound('jackal', 'The bomb detonated at the site.');
  },
});

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const shootDir = new THREE.Vector3();
const grenades = [];
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let dryClickAt = 0;
let spectateBot = null;
let buyOpen = false;
let simBots = true; // false during shot setups so bots hold their marks

function losClear(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.01) return true;
  raycaster.set(from, new THREE.Vector3(dx / dist, dy / dist, dz / dist));
  raycaster.far = dist - 0.3;
  return raycaster.intersectObjects(map.shootables, false).length === 0;
}

// One hitscan trace against the world and the living bots.
function raycast(origin, dir, maxDist) {
  raycaster.set(origin, dir);
  raycaster.far = maxDist;
  const targets = map.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit) return null;
  const data = hit.object.userData || {};
  return {
    point: hit.point,
    normal: hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0),
    distance: hit.distance,
    object: hit.object,
    bot: data.bot || null,
    part: data.part || null,
  };
}

const bots = createBots(scene, map, {
  raycast,
  losClear,
  playerState: () => player.state,
  playerMoving: () => player.groundSpeed() > 1.5,
  tracer: (from, to) => effects.tracer(from, to),
  muzzle: (at, dir) => effects.muzzle(at, dir),
  sparkBurst: (point, normal) => effects.sparkBurst(point, normal),
  audioEnemyShot: (dist) => audio.enemyShot(dist),
  damagePlayer: (dmg, fromPos, headshot) => damagePlayer(dmg, fromPos, headshot, null),
  damageBot: (bot, dmg, part, attacker) => damageBot(bot, dmg, part, attacker),
  bombStartPlant: (siteCenter) => bomb.startPlant(siteCenter),
  bombAbortPlant: () => bomb.abortPlant(),
  bombPlanted: () => bomb.planted(),
  bombStatus: () => bomb.state.status,
  bombStartDefuse: () => bomb.startDefuse(),
  bombDefused: () => bomb.defused(),
}, rng);

const input = createInput(renderer.domElement, onLockChange);

function endRound(winner, reason) {
  if (!match.endRound(winner, reason)) return;
  if (winner === 'vanguard') audio.roundWin();
  else audio.roundLose();
  hud.setBombStatus('', null);
  hud.setPlantProgress('', null);
  if (document.pointerLockElement) document.exitPointerLock();
}

function resetRound() {
  player.reset(SPAWNS.vanguard[1]);
  arsenal.refill();
  arsenal.state.grenades = 0;
  bomb.reset();
  bots.reset();
  grenades.length = 0;
  spectateBot = null;
  hud.setSpectate(null);
  hud.setHealth(100);
  hud.setArmor(0);
  hud.setAmmo(arsenal.currentAmmo().mag, arsenal.currentAmmo().reserve, false);
  hud.setWeaponName(arsenal.currentDef().name);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.scoreV, match.state.scoreJ);
  hud.setRound(match.state.round);
  hud.setBombStatus('', null);
  match.startRound();
  // The buy menu never auto-opens: it would cover the start overlay on the
  // first round. Press B during the buy phase to open it.
  hud.showBuy(false, match.state.money, arsenal.owned);
  buyOpen = false;
  input.clearPressed();
}

function damagePlayer(dmg, fromPos, headshot, killerBot) {
  if (!player.state.alive) return;
  const died = player.damage(dmg);
  hud.setHealth(player.state.hp);
  hud.setArmor(player.state.armor);
  hud.damageFlash();
  audio.hurt();
  if (died) {
    const killer = killerBot ? killerBot.name : 'JACKALS';
    hud.addKill(killer, 'YOU', !!headshot, false, true);
    spectateBot = bots.bots.find((b) => b.alive && b.team === 'vanguard') || null;
    hud.setSpectate(spectateBot ? spectateBot.name : null);
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showOverlay('dead', {});
  }
}

function damageBot(bot, dmg, part, attacker) {
  const died = bots.damage(bot, dmg, part);
  if (!died) return;
  const isPlayerKill = attacker === player;
  const killerName = isPlayerKill ? 'YOU' : attacker ? attacker.name : 'VANGUARD';
  hud.addKill(killerName, bot.name, part === 'head', isPlayerKill, false);
  if (bot.team === 'jackal') {
    match.addKillReward();
    hud.setMoney(match.state.money);
    if (isPlayerKill) audio.kill();
  }
  if (bot.carrier) apiBombCarrierDown();
}

function apiBombCarrierDown() {
  // The bomb drops where the carrier fell: another Jackal picks it up by
  // walking to the site anyway (carrier flag moves to the next living one).
  const next = bots.bots.find((b) => b.alive && b.team === 'jackal');
  if (next) next.carrier = true;
}

function blastDamage(pos, radius) {
  const falloff = (d) => Math.max(8, 110 * (1 - d / radius));
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.position.distanceTo(pos);
    if (d > radius) continue;
    const blocked = !losClear(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), new THREE.Vector3(bot.position.x, bot.position.y + 1.2, bot.position.z));
    damageBot(bot, falloff(d) * (blocked ? 0.4 : 1), 'body', null);
  }
  if (player.state.alive) {
    const d = player.state.position.distanceTo(pos);
    if (d <= radius) {
      const blocked = !losClear(new THREE.Vector3(pos.x, pos.y + 0.5, pos.z), new THREE.Vector3(player.state.position.x, player.state.position.y + 1.2, player.state.position.z));
      damagePlayer(falloff(d) * (blocked ? 0.4 : 1), pos, false, null);
    }
  }
}

function shootPlayer() {
  const def = arsenal.currentDef();
  const shot = arsenal.fire(player.groundSpeed() > 1.5, !player.state.onGround);
  if (!shot) {
    if (elapsed - dryClickAt > 0.25) { dryClickAt = elapsed; audio.dryClick(); }
    return;
  }
  camera.getWorldDirection(shootDir);
  shootDir.x += (rng.next() * 2 - 1) * shot.spread;
  shootDir.y += (rng.next() * 2 - 1) * shot.spread;
  shootDir.z += (rng.next() * 2 - 1) * shot.spread;
  shootDir.normalize();
  const muzzlePos = camera.position.clone().add(shootDir.clone().multiplyScalar(0.6));
  muzzlePos.y -= 0.18;
  effects.muzzle(muzzlePos, shootDir);
  audio.shot(arsenal.state.current);
  bots.hear(player.state.position.x, player.state.position.z, 'vanguard', elapsed);
  const hit = raycast(camera.position, shootDir, shot.range);
  const end = hit ? hit.point : camera.position.clone().add(shootDir.clone().multiplyScalar(shot.range));
  effects.tracer(muzzlePos, end);
  if (!hit) return;
  if (hit.bot) {
    const dmg = shot.damage * (hit.part === 'head' ? shot.headMult : 1) * (hit.distance > 30 ? 0.85 : 1);
    hud.hitmarker(false);
    damageBot(hit.bot, dmg, hit.part, player);
    if (hit.bot.alive) audio.hit();
  } else {
    effects.sparkBurst(hit.point, hit.normal);
  }
  player.recoil(shot.kick, (rng.next() * 2 - 1) * shot.kick * 0.4);
  hud.setAmmo(arsenal.currentAmmo().mag, arsenal.currentAmmo().reserve, false);
}

function throwGrenade() {
  if (arsenal.state.grenades <= 0 || match.state.phase !== 'live') return;
  arsenal.state.grenades -= 1;
  camera.getWorldDirection(shootDir);
  const pos = camera.position.clone().add(shootDir.clone().multiplyScalar(0.5));
  const vel = shootDir.clone().multiplyScalar(15);
  vel.y += 4.2;
  grenades.push({ pos, vel, fuse: 2.4, bounced: false });
  audio.reload();
}

function explodeGrenade(g) {
  effects.explosion(g.pos);
  audio.explosion();
  bots.hear(g.pos.x, g.pos.z, 'vanguard', elapsed);
  blastDamage(g.pos, 6);
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 16 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // Ground bounce; walls stop the throw (approximate via the map collider).
    if (g.pos.y < 0.12) {
      g.pos.y = 0.12;
      g.vel.y = Math.abs(g.vel.y) * 0.45;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
      g.bounced = true;
    }
    g.fuse -= dt * (g.bounced ? 1.6 : 1);
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function buyItem(id) {
  if (match.state.phase !== 'buy') return;
  if (id === 'grenade' && arsenal.state.grenades >= 2) return;
  if (!match.buy(id)) return;
  if (id === 'grenade') arsenal.state.grenades += 1;
  else if (id === 'armor') player.state.armor = 100;
  else {
    arsenal.buy(id);
    arsenal.switchTo(id);
  }
  audio.buy();
  hud.setMoney(match.state.money);
  hud.setArmor(player.state.armor);
  hud.setAmmo(arsenal.currentAmmo().mag, arsenal.currentAmmo().reserve, false);
  hud.setWeaponName(arsenal.currentDef().name);
  hud.showBuy(true, match.state.money, arsenal.owned);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    if (buyOpen) { hud.showBuy(false, match.state.money, arsenal.owned); buyOpen = false; }
  } else if (match.state.phase !== 'match' && !buyOpen) {
    // No overlay while the buy menu is open — the menu is the click target.
    hud.showOverlay(player.state.alive ? 'paused' : 'dead', {});
  }
}

// Clicking the game view while live re-locks the pointer (e.g. after the buy
// timer closed the menu while it was open).
renderer.domElement.addEventListener('click', () => {
  if (shot) return;
  if (!input.state.locked && match.state.phase === 'live' && player.state.alive && !buyOpen) {
    input.requestLock();
  }
});

hud.onPlay(() => {
  if (shot) return;
  const kind = document.getElementById('play').dataset.kind;
  if (kind === 'match') { window.location.reload(); return; }
  if (kind === 'dead') { hud.hideOverlay(); return; }
  if (buyOpen) { hud.showBuy(false, match.state.money, arsenal.owned); buyOpen = false; }
  input.requestLock();
});
hud.onBuyClick((id) => buyItem(id));

input.setKeyHandler((code) => {
  if (shot) return;
  if (code === 'KeyB' && match.state.phase === 'buy') {
    buyOpen = !buyOpen;
    hud.showBuy(buyOpen, match.state.money, arsenal.owned);
    if (buyOpen && document.pointerLockElement) document.exitPointerLock();
    if (!buyOpen) input.requestLock();
  }
  // Digits switch weapons outside the buy phase; inside it they buy (buyKeys
  // in step() owns that, so the two never double-charge).
  if (match.state.phase !== 'buy') {
    if (code === 'Digit1') { if (arsenal.switchTo('pistol')) hud.setWeaponName(arsenal.currentDef().name); }
    if (code === 'Digit2') { if (arsenal.switchTo('rifle')) hud.setWeaponName(arsenal.currentDef().name); }
    if (code === 'Digit3') { if (arsenal.switchTo('smg')) hud.setWeaponName(arsenal.currentDef().name); }
  }
  if (code === 'Digit4') throwGrenade();
  if (code === 'KeyG') throwGrenade();
});

function buyKeys() {
  // Number keys 1-4 buy during the buy phase; outside it they switch weapons.
  if (match.state.phase !== 'buy') return;
  if (input.takePressed('Digit1')) buyItem('rifle');
  if (input.takePressed('Digit2')) buyItem('smg');
  if (input.takePressed('Digit3')) buyItem('grenade');
  if (input.takePressed('Digit4')) buyItem('armor');
}

function step(dt) {
  elapsed += dt;
  match.step(dt);
  arsenal.step(dt);
  effects.step(dt);

  if (match.state.phase === 'buy') {
    buyKeys();
    if (match.state.timer <= 0) {
      match.beginLive();
      hud.showBuy(false, match.state.money, arsenal.owned);
      buyOpen = false;
      input.clearPressed();
      hud.setBombStatus('DEFEND BOTH SITES — STOP THE PLANT', 'warn');
      setTimeout(() => { if (match.state.phase === 'live' && bomb.state.status === 'carried') hud.setBombStatus('', null); }, 4000);
      if (!input.state.locked && !shot) hud.showOverlay('paused', {});
    }
  }

  if (match.state.phase === 'live' || match.state.phase === 'buy') {
    player.step(dt, input.state.keys);
    if (simBots) bots.step(dt, player.state, elapsed, match.state.phase === 'live');
  }

  // Grenades fly in every phase.
  stepGrenades(dt);

  // Bomb: plant channel, planted countdown, defuse channel.
  const nearBomb = bomb.state.status === 'planted'
    && player.state.alive
    && player.state.position.distanceTo(bomb.state.position) < 2.4;
  const botDefusing = bots.bots.some((b) => b.alive && b.team === 'vanguard' && b.state === 'defuse');
  const defusing = (nearBomb && input.state.keys.has('KeyE')) || botDefusing;
  bomb.step(dt, defusing, elapsed);
  if (bomb.state.status === 'planted') {
    hud.setTimer(bomb.state.timer);
    if (nearBomb && player.state.alive) hud.setHint('HOLD E — DEFUSING');
    else hud.setHint('');
    hud.setPlantProgress(
      botDefusing ? 'TEAMMATE DEFUSING' : 'DEFUSING',
      botDefusing || nearBomb ? bomb.state.defuseProgress : null,
    );
  } else if (bomb.state.status === 'planting') {
    hud.setPlantProgress('BOMB BEING PLANTED', bomb.state.plantProgress);
  } else {
    hud.setPlantProgress('', null);
    if (match.state.phase === 'live') hud.setHint('');
  }

  // Firing (live phase only, player alive, pointer locked or shot mode).
  const canShoot = (match.state.phase === 'live') && player.state.alive && (input.state.locked || shot);
  if (canShoot) {
    const def = arsenal.currentDef();
    const trigger = def.auto ? input.state.firing : (input.state.firing && !prevFiring);
    if (trigger && arsenal.ready()) shootPlayer();
    if (input.state.firing && arsenal.currentAmmo().mag === 0 && arsenal.ready()) {
      if (elapsed - dryClickAt > 0.3) { dryClickAt = elapsed; audio.dryClick(); }
    }
  }
  prevFiring = input.state.firing;

  if (input.takePressed('KeyR') && match.state.phase === 'live') {
    if (arsenal.startReload()) audio.reload();
  }
  const wheel = input.takeWheel();
  if (wheel !== 0 && match.state.phase === 'live') {
    const owned = ['pistol', 'rifle', 'smg'].filter((id) => arsenal.owned[id]);
    const idx = owned.indexOf(arsenal.state.current);
    const next = owned[(idx + (wheel > 0 ? 1 : owned.length - 1)) % owned.length];
    if (arsenal.switchTo(next)) hud.setWeaponName(arsenal.currentDef().name);
  }

  // Round end conditions.
  if (match.state.phase === 'live') {
    const jackals = bots.aliveCount('jackal');
    const vanguard = bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0);
    if (bomb.state.status === 'planted') {
      if (vanguard === 0) endRound('jackal', 'Squad eliminated — the bomb will detonate.');
    } else if (bomb.state.status === 'planting') {
      if (jackals === 0) endRound('vanguard', 'Site cleared — plant stopped.');
      else if (vanguard === 0) endRound('jackal', 'Squad eliminated.');
    } else if (jackals === 0) {
      endRound('vanguard', 'All Jackals eliminated — site held.');
    } else if (vanguard === 0) {
      endRound('jackal', 'Squad eliminated.');
    } else if (match.state.timer <= 0) {
      endRound('vanguard', 'Time expired — sites held.');
    }
  }

  if (match.state.phase === 'end' && match.state.timer <= 0) {
    if (match.endMatchIfDecided()) {
      hud.showOverlay('match', { winner: match.state.winner, scoreV: match.state.scoreV, scoreJ: match.state.scoreJ });
    } else {
      match.nextRound();
      resetRound();
    }
  }

  // HUD readouts.
  hud.setHealth(player.state.hp);
  hud.setArmor(player.state.armor);
  if (match.state.phase !== 'live' || bomb.state.status !== 'planted') hud.setTimer(match.state.timer);
  hud.setAmmo(arsenal.currentAmmo().mag, arsenal.currentAmmo().reserve, arsenal.state.reloading > 0);
  hud.crosshairGap(arsenal.spreadNow(player.groundSpeed() > 1.5, !player.state.onGround));
  hud.setScore(match.state.scoreV, match.state.scoreJ);
  hud.setRound(match.state.round);
  if (arsenal.state.reloading > 0) hud.setWeaponName(`${arsenal.currentDef().name} — RELOADING`);
  else hud.setWeaponName(arsenal.currentDef().name);
}

function syncCamera() {
  if (!player.state.alive && spectateBot) {
    camera.position.set(spectateBot.position.x, spectateBot.position.y + 1.55, spectateBot.position.z);
    camera.rotation.set(0, spectateBot.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(
    player.state.pitch + player.state.recoilPitch,
    player.state.yaw + player.state.recoilYaw,
    0, 'YXZ',
  );
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.state.alive && (input.state.locked || shot)) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const p = player.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false, 0, {});
  buyOpen = false;
  simBots = false;
  resetRound();
  match.beginLive();
  hud.setBombStatus('', null);
  if (name === 'start') {
    // Vanguard spawn, looking south down mid: crane, containers, both lanes.
    player.state.position.set(0, 0, -15);
    player.state.yaw = Math.PI + 0.3;
    player.state.pitch = 0.02;
    settle(30);
    hud.showOverlay('start', {});
  } else if (name === 'play') {
    player.state.position.set(0, 0, 8);
    const jackal = bots.bots.find((b) => b.team === 'jackal');
    // In the mid gap (x=0 is open between the two mid wall segments), so the
    // enemy is visible down the player's sightline instead of behind a wall.
    jackal.position.set(-1, 0, -4);
    jackal.state = 'hold';
    jackal.holdYaw = Math.PI;
    jackal.path = [];
    jackal.pathIndex = 0;
    bots.syncMesh(jackal);
    settle(20);
    // Buy the rifle for the shot so the HUD shows the real loadout.
    if (!arsenal.owned.rifle) { arsenal.buy('rifle'); arsenal.switchTo('rifle'); }
    aimAt(new THREE.Vector3(jackal.position.x, jackal.position.y + 1.2, jackal.position.z));
    arsenal.state.cooldown = 0; // weapon-switch cooldown would eat the shot
    shootPlayer();
    settle(10);
    aimAt(new THREE.Vector3(jackal.position.x, jackal.position.y + 1.2, jackal.position.z));
    arsenal.state.cooldown = 0;
    shootPlayer();
    settle(6);
  } else if (name === 'bomb') {
    // Just south of site A's door gap, looking straight at the planted bomb.
    player.state.position.set(18, 0, -4.5);
    bomb.startPlant(SITES.A.center);
    bomb.state.plantProgress = 1;
    bomb.planted();
    bomb.state.timer = 12;
    const jackal = bots.bots.find((b) => b.team === 'jackal' && b.index === 1);
    jackal.position.set(22, 0, -10);
    jackal.state = 'hold';
    jackal.holdYaw = Math.PI * 0.75;
    jackal.path = [];
    jackal.pathIndex = 0;
    bots.syncMesh(jackal);
    settle(20);
    aimAt(new THREE.Vector3(SITES.A.center.x, 1, SITES.A.center.z));
    hud.setBombStatus('⚠ BOMB PLANTED — DEFUSE IT', 'danger');
    settle(4);
  } else if (name === 'end') {
    player.state.position.set(0, 0, -8);
    player.state.yaw = 0.5;
    settle(20);
    endRound('vanguard', 'All Jackals eliminated — site held.');
    hud.showOverlay('round', { winner: 'vanguard', reason: 'All Jackals eliminated — site held.' });
    settle(4);
  }
  simBots = true;
  hud.setScore(match.state.scoreV, match.state.scoreJ);
  hud.setMoney(match.state.money);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for automated play-testing (read-only state + a lock helper).
window.__game = {
  get state() {
    return {
      phase: match.state.phase,
      elapsed,
      round: match.state.round,
      scoreV: match.state.scoreV,
      scoreJ: match.state.scoreJ,
      timer: match.state.timer,
      money: match.state.money,
      hp: player.state.hp,
      alive: player.state.alive,
      pos: { x: player.state.position.x, y: player.state.position.y, z: player.state.position.z },
      yaw: player.state.yaw,
      jackals: bots.aliveCount('jackal'),
      vanguard: bots.aliveCount('vanguard'),
      bomb: bomb.state.status,
      bombTimer: bomb.state.timer,
      grenades: arsenal.state.grenades,
      weapon: arsenal.state.current,
      mag: arsenal.currentAmmo().mag,
    };
  },
  bots,
  player,
  match,
  bomb,
  arsenal,
  forceLock() { input.state.locked = true; onLockChange(true); },
  teleport(x, z, yaw) {
    player.state.position.set(x, 0, z);
    if (yaw !== undefined) player.state.yaw = yaw;
  },
};

syncCamera();
resetRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
