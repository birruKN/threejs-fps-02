// Bots: five Jackals attack, four Vanguard bots hold the sites with the
// player. One bot class, two roles. Attackers walk a BFS path over the
// waypoint graph to their site, hold angles, and the carrier plants when the
// site is clear. Holders take a post, sweep their view, and react to what
// they see and hear. Combat is a think tick (every 0.12 s) plus burst fire
// with distance-based hit chance — no aimbot, no wallbangs.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES, SPAWNS, findPath, collide } from './map.js';
import { WEAPONS } from './weapons.js';

const NAMES_V = ['HAVOC', 'BRICK', 'WREN', 'DUSK'];
const NAMES_J = ['VIPER', 'ASH', 'ROOK', 'FLINT', 'NOVA'];
const THINK_EVERY = 0.12;
const EYE = 1.55;

function makeBotMesh(team) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: team === 'vanguard' ? PALETTE.vanguard : PALETTE.jackal, roughness: 0.8,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.9 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.9 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.32), legMat);
  legs.position.y = 0.31;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.34), bodyMat);
  torso.position.y = 0.98;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.32), darkMat);
  head.position.y = 1.56;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.08, 0.05),
    new THREE.MeshStandardMaterial({ color: team === 'vanguard' ? 0x9ff5ec : 0xffb199, emissive: team === 'vanguard' ? 0x2a8a80 : 0x8a2a1a, emissiveIntensity: 0.9 }),
  );
  visor.position.set(0, 1.58, 0.17);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.78), darkMat);
  gun.position.set(0.22, 1.28, 0.3);
  for (const mesh of [legs, torso, head, visor, gun]) {
    mesh.castShadow = true;
    group.add(mesh);
  }
  group.userData.bodyMesh = torso;
  group.userData.headMesh = head;
  return group;
}

export function createBots(scene, map, api, rng) {
  const bots = [];
  const shootables = map.shootables;

  function spawnBot(team, index, name) {
    const mesh = makeBotMesh(team);
    scene.add(mesh);
    const bot = {
      id: `${team[0]}${index}`,
      team, name, index,
      alive: true,
      hp: 100,
      armor: 0,
      position: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      speed: 3.4,
      weapon: 'rifle',
      role: 'hold',
      state: 'move',
      path: [],
      pathIndex: 0,
      targetSite: 'A',
      holdPos: null,
      holdYaw: 0,
      scanPhase: rng.next() * Math.PI * 2,
      thinkAt: rng.next() * THINK_EVERY,
      target: null,
      burstLeft: 0,
      burstAt: 0,
      pauseUntil: 0,
      hearUntil: 0,
      hearYaw: 0,
      plantAt: 0,
      defuseAt: 0,
      carrier: false,
      mesh,
    };
    mesh.userData.bodyMesh.userData = { bot, part: 'body' };
    mesh.userData.headMesh.userData = { bot, part: 'head' };
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) {
    const bot = spawnBot('vanguard', i, NAMES_V[i]);
    bot.weapon = i % 2 === 0 ? 'rifle' : 'smg';
  }
  for (let i = 0; i < 5; i += 1) {
    const bot = spawnBot('jackal', i, NAMES_J[i]);
    bot.weapon = i < 3 ? 'rifle' : 'smg';
  }

  function reset() {
    // Jackals: three push A, two push B; the first Jackal carries the bomb.
    const sitePlan = ['A', 'A', 'A', 'B', 'B'];
    let ji = 0;
    for (const bot of bots) {
      bot.alive = true;
      bot.hp = 100;
      bot.armor = 0;
      bot.target = null;
      bot.burstLeft = 0;
      bot.plantAt = 0;
      bot.defuseAt = 0;
      bot.hearUntil = 0;
      bot.mesh.visible = true;
      bot.mesh.rotation.set(0, 0, 0);
      bot.mesh.position.y = 0;
      if (bot.team === 'jackal') {
        const spawn = SPAWNS.jackal[ji % SPAWNS.jackal.length];
        bot.position.set(spawn.x, 0, spawn.z);
        bot.yaw = spawn.yaw;
        bot.role = 'attack';
        bot.targetSite = sitePlan[ji];
        bot.carrier = ji === 0;
        bot.path = findPath(bot.position, SITES[bot.targetSite].center);
        bot.pathIndex = 0;
        bot.state = 'move';
        ji += 1;
      } else {
        const spawn = SPAWNS.vanguard[bot.index % SPAWNS.vanguard.length];
        bot.position.set(spawn.x, 0, spawn.z);
        bot.yaw = spawn.yaw;
        bot.role = 'hold';
        bot.carrier = false;
        const holds = [
          { x: 13, z: -15.5, yaw: 0.6 }, { x: -13, z: -15.5, yaw: -0.6 },
          { x: 0, z: -11, yaw: 0 }, { x: 4, z: -16, yaw: 0.3 },
        ];
        const hold = holds[bot.index % holds.length];
        bot.holdPos = { x: hold.x, z: hold.z };
        bot.holdYaw = hold.yaw;
        bot.path = findPath(bot.position, bot.holdPos);
        bot.pathIndex = 0;
        bot.state = 'move';
      }
      syncMesh(bot);
    }
  }

  function syncMesh(bot) {
    bot.mesh.position.set(bot.position.x, bot.position.y, bot.position.z);
    bot.mesh.rotation.y = bot.yaw;
  }

  function eyePos(bot) {
    return new THREE.Vector3(bot.position.x, bot.position.y + EYE, bot.position.z);
  }

  function canSee(bot, targetPos, maxDist) {
    const from = eyePos(bot);
    const dx = targetPos.x - from.x, dy = targetPos.y - from.y, dz = targetPos.z - from.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxDist) return false;
    // Must be roughly in front unless very close.
    if (dist > 3) {
      const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot < -0.15) return false;
    }
    return api.losClear(from, targetPos);
  }

  function nearestVisibleEnemy(bot, player, now) {
    let best = null;
    let bestDist = Infinity;
    const enemies = bots.filter((b) => b.alive && b.team !== bot.team);
    for (const enemy of enemies) {
      const tp = new THREE.Vector3(enemy.position.x, enemy.position.y + 1.2, enemy.position.z);
      if (!canSee(bot, tp, 55)) continue;
      const d = bot.position.distanceTo(enemy.position);
      if (d < bestDist) { bestDist = d; best = { kind: 'bot', bot: enemy, dist: d }; }
    }
    if (player.alive && bot.team === 'jackal') {
      const tp = new THREE.Vector3(player.position.x, player.position.y + (player.crouched ? 0.9 : 1.3), player.position.z);
      if (canSee(bot, tp, 55)) {
        const d = bot.position.distanceTo(player.position);
        if (d < bestDist) { bestDist = d; best = { kind: 'player', dist: d }; }
      }
    }
    return best;
  }

  function aimAt(bot, targetPos, dt) {
    const dx = targetPos.x - bot.position.x;
    const dz = targetPos.z - bot.position.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    bot.yaw += turn;
  }

  // One burst round. The errored ray is traced against the world; a hit on
  // another bot is crossfire. The intended target is tested geometrically:
  // the player has no mesh, so the ray's closest approach to the player's
  // capsule decides, and only when nothing solid stops the ray first.
  function fireBurstShot(bot, target, now) {
    const def = WEAPONS[bot.weapon];
    const from = eyePos(bot);
    from.x += Math.sin(bot.yaw) * 0.4;
    from.z += Math.cos(bot.yaw) * 0.4;
    from.y -= 0.25;
    let targetPos;
    let targetBot = null;
    if (target.kind === 'player') {
      const p = api.playerState();
      targetPos = new THREE.Vector3(p.position.x, p.position.y + (p.crouched ? 0.9 : 1.3), p.position.z);
    } else {
      targetBot = target.bot;
      targetPos = new THREE.Vector3(targetBot.position.x, targetBot.position.y + 1.2, targetBot.position.z);
    }
    const dist = from.distanceTo(targetPos);
    const perfect = targetPos.clone().sub(from).normalize();
    // Error grows with distance and with a moving target.
    const err = 0.02 + dist * 0.0016 + (target.kind === 'player' && api.playerMoving() ? 0.02 : 0);
    const dir = perfect.clone();
    dir.x += (rng.next() - 0.5) * err * 2;
    dir.y += (rng.next() - 0.5) * err * 1.2;
    dir.z += (rng.next() - 0.5) * err * 2;
    dir.normalize();
    const hit = api.raycast(from, dir, def.range);
    const end = hit ? hit.point : from.clone().add(dir.clone().multiplyScalar(def.range));
    api.tracer(from, end);
    api.muzzle(from, dir);
    api.audioEnemyShot(bot.position.distanceTo(api.playerState().position));
    if (hit && hit.bot && hit.bot !== targetBot) {
      // Crossfire on a bot that walked into the line.
      const dmg = def.damage * (hit.part === 'head' ? def.headMult : 1);
      api.damageBot(hit.bot, dmg, hit.part, bot);
      return;
    }
    if (hit && !hit.bot) {
      // A wall stopped the round; sparks where it landed.
      if (hit.distance < dist + 0.5) { api.sparkBurst(hit.point, hit.normal); return; }
    }
    // Closest approach of the errored ray to the target's chest and head.
    const toTarget = targetPos.clone().sub(from);
    const along = toTarget.dot(dir);
    if (along < 0 || along > dist + 2) return;
    const closest = from.clone().add(dir.clone().multiplyScalar(along));
    const headPos = targetPos.clone();
    headPos.y += target.kind === 'player' ? 0.3 : 0.35;
    const headDist = closest.distanceTo(headPos);
    const bodyDist = closest.distanceTo(targetPos);
    const falloff = dist > 30 ? 0.85 : 1;
    if (headDist < 0.24) {
      const dmg = def.damage * def.headMult * falloff;
      if (target.kind === 'player') api.damagePlayer(dmg, bot.position, true);
      else api.damageBot(targetBot, dmg, 'head', bot);
    } else if (bodyDist < 0.5) {
      const dmg = def.damage * falloff;
      if (target.kind === 'player') api.damagePlayer(dmg, bot.position, false);
      else api.damageBot(targetBot, dmg, 'body', bot);
    }
  }

  function think(bot, player, now) {
    if (!bot.alive) return;
    const target = nearestVisibleEnemy(bot, player, now);
    bot.target = target;
    if (target) {
      if (bot.state === 'plant') api.bombAbortPlant();
      bot.state = 'engage';
      if (bot.burstLeft <= 0 && now >= bot.burstAt) {
        bot.burstLeft = 3 + Math.floor(rng.next() * 3);
        bot.burstAt = now + 0.55 + rng.next() * 0.5;
      }
      return;
    }
    if (bot.state === 'engage') {
      bot.state = bot.role === 'attack' ? 'move' : 'hold';
      if (bot.role === 'attack' && bot.pathIndex >= bot.path.length) bot.state = 'hold';
    }
  }

  function stepBot(bot, dt, player, now, canFight) {
    if (!bot.alive) return;
    if (!canFight && bot.state === 'engage') {
      // Buy phase: walk to position, never fight — rounds must not be
      // decided before the live phase starts.
      bot.state = bot.role === 'attack' ? 'move' : 'hold';
      bot.target = null;
    }
    if (canFight && now >= bot.thinkAt) {
      bot.thinkAt = now + THINK_EVERY;
      think(bot, player, now);
    }

    if (bot.state === 'engage' && bot.target) {
      const tp = bot.target.kind === 'player'
        ? new THREE.Vector3(api.playerState().position.x, api.playerState().position.y + 1.2, api.playerState().position.z)
        : new THREE.Vector3(bot.target.bot.position.x, bot.target.bot.position.y + 1.2, bot.target.bot.position.z);
      aimAt(bot, tp, dt);
      if (bot.burstLeft > 0 && now >= bot.burstAt - 0.6) {
        // Fire one round per think-step while the burst lasts.
        if (now >= (bot.lastShot || 0) + 0.11) {
          bot.lastShot = now;
          bot.burstLeft -= 1;
          fireBurstShot(bot, bot.target, now);
          if (bot.burstLeft <= 0) bot.burstAt = now + 0.55 + rng.next() * 0.5;
        }
      }
      syncMesh(bot);
      return;
    }

    if (bot.state === 'plant') {
      // Carrier channels the plant; the bomb module owns the timer.
      if (now >= bot.plantAt) {
        bot.state = 'hold';
        api.bombPlanted();
      }
      syncMesh(bot);
      return;
    }

    if (bot.state === 'defuse') {
      if (now >= bot.defuseAt) {
        bot.state = 'hold';
        api.bombDefused();
      }
      syncMesh(bot);
      return;
    }

    if (bot.state === 'move' && bot.pathIndex < bot.path.length) {
      const wp = bot.path[bot.pathIndex];
      const dx = wp.x - bot.position.x, dz = wp.z - bot.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        bot.pathIndex += 1;
        if (bot.pathIndex >= bot.path.length) {
          bot.state = bot.role === 'attack' ? 'arrive' : 'hold';
          if (bot.role === 'attack') onArriveSite(bot, now);
          return;
        }
      } else {
        const stepLen = bot.speed * dt;
        bot.position.x += (dx / dist) * stepLen;
        bot.position.z += (dz / dist) * stepLen;
        const want = Math.atan2(-dx, -dz);
        let diff = want - bot.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        bot.yaw += Math.max(-4 * dt, Math.min(4 * dt, diff));
        collide(bot.position, 0.35, 1.7, map.colliders);
      }
      syncMesh(bot);
      return;
    }

    if (bot.state === 'arrive') {
      // At the site: carrier plants when no defender is close and visible.
      if (bot.carrier && api.bombStatus() === 'carried') {
        const defenderNear = bots.some((b) => b.alive && b.team === 'vanguard' && b.position.distanceTo(bot.position) < 14);
        const playerNear = api.playerState().alive && api.playerState().position.distanceTo(bot.position) < 14;
        if (!defenderNear && !playerNear) {
          bot.state = 'plant';
          bot.plantAt = now + 3.2;
          api.bombStartPlant(SITES[bot.targetSite].center);
          return;
        }
      }
      // Non-carriers hold the site and sweep.
      bot.scanPhase += dt * 0.7;
      bot.yaw = bot.holdYaw + Math.sin(bot.scanPhase) * 0.9;
      syncMesh(bot);
      return;
    }

    // Hold: sweep the view, turn toward heard noise.
    bot.scanPhase += dt * 0.7;
    let baseYaw = bot.holdYaw + Math.sin(bot.scanPhase) * 0.9;
    if (now < bot.hearUntil) baseYaw = bot.hearYaw;
    bot.yaw = baseYaw;
    syncMesh(bot);
  }

  function onArriveSite(bot, now) {
    bot.holdYaw = bot.yaw;
    bot.state = 'arrive';
  }

  // `now` is simulation time (same clock as the bots' think ticks).
  function hear(x, z, team, now) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      const d = Math.hypot(bot.position.x - x, bot.position.z - z);
      if (d < 26) {
        bot.hearUntil = now + 2;
        bot.hearYaw = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
      }
    }
  }

  function onBombPlanted(sitePos) {
    // Nearest living Vanguard bot runs to defuse.
    let best = null;
    let bestD = Infinity;
    for (const bot of bots) {
      if (!bot.alive || bot.team !== 'vanguard') continue;
      const d = bot.position.distanceTo(new THREE.Vector3(sitePos.x, 0, sitePos.z));
      if (d < bestD) { bestD = d; best = bot; }
    }
    if (best) {
      best.role = 'defuse';
      best.state = 'move';
      best.path = findPath(best.position, sitePos);
      best.pathIndex = 0;
      best.defuseTarget = sitePos;
      best.defusing = true;
    }
  }

  function onBotArrivedDefuse(bot, now) {
    bot.state = 'defuse';
    bot.defuseAt = now + 5;
    bot.defusing = false;
    api.bombStartDefuse();
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    let rest = amount;
    if (bot.armor > 0) {
      const absorbed = Math.min(bot.armor, rest * 0.5);
      bot.armor -= absorbed;
      rest -= absorbed;
    }
    bot.hp -= rest;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.state = 'dead';
      bot.mesh.rotation.z = Math.PI / 2;
      bot.mesh.position.y = 0.15;
      bot.mesh.userData.bodyMesh.userData = {};
      bot.mesh.userData.headMesh.userData = {};
      return true;
    }
    return false;
  }

  function step(dt, player, now, canFight = true) {
    for (const bot of bots) {
      // Defuse arrival check lives here so the main loop stays simple: a
      // defuse bot lands in 'hold' when its path ends, so check the flag.
      if (bot.alive && bot.defusing && bot.state === 'hold' && bot.pathIndex >= bot.path.length) {
        onBotArrivedDefuse(bot, now);
      }
      stepBot(bot, dt, player, now, canFight);
    }
  }

  function aliveCount(team) {
    return bots.filter((b) => b.alive && b.team === team).length;
  }

  return {
    bots, reset, step, hear, damage, onBombPlanted, aliveCount, syncMesh,
    hitMeshes() {
      const list = [];
      for (const bot of bots) {
        if (!bot.alive) continue;
        list.push(bot.mesh.userData.bodyMesh, bot.mesh.userData.headMesh);
      }
      return list;
    },
  };
}
