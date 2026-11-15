// The bomb: carried, planting, planted, defused, exploded. The carrier bot
// channels the plant; the player (or a Vanguard bot) channels the defuse by
// holding E near it. Planted, it ticks down 35 s with accelerating beeps.
import * as THREE from 'three';

const PLANT_TIME = 3.2;
const DEFUSE_TIME = 5;
const EXPLODE_TIME = 35;

export function createBomb(scene, api) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.22, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.6, metalness: 0.4 }),
  );
  box.castShadow = true;
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xe5484d, emissiveIntensity: 2 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lightMat);
  lamp.position.set(0.12, 0.13, 0);
  group.add(box, lamp);
  group.visible = false;
  scene.add(group);

  const state = {
    status: 'carried', // carried | planting | planted | defused | exploded
    site: null,
    position: new THREE.Vector3(),
    plantProgress: 0,
    defuseProgress: 0,
    timer: 0,
    beepAt: 0,
    blinkAt: 0,
  };

  function startPlant(siteCenter) {
    state.status = 'planting';
    state.site = siteCenter;
    state.position.set(siteCenter.x, 0.11, siteCenter.z);
    state.plantProgress = 0;
    group.position.copy(state.position);
    group.visible = true;
  }

  function abortPlant() {
    if (state.status !== 'planting') return;
    state.status = 'carried';
    state.plantProgress = 0;
    group.visible = false;
  }

  function planted() {
    state.status = 'planted';
    state.timer = EXPLODE_TIME;
    state.beepAt = 0;
    api.audio.plantDone();
    api.onPlanted(state.site);
  }

  function startDefuse() {
    if (state.status !== 'planted') return;
    state.defuseProgress = 0;
  }

  function defused() {
    state.status = 'defused';
    api.onDefused();
  }

  function step(dt, defusing, now) {
    if (state.status === 'planting') {
      state.plantProgress += dt / PLANT_TIME;
      if (Math.floor(now * 4) !== Math.floor((now - dt) * 4)) api.audio.beep(false);
      if (state.plantProgress >= 1) planted();
    } else if (state.status === 'planted') {
      state.timer -= dt;
      // Beeps accelerate as the timer runs down.
      const interval = 0.25 + (state.timer / EXPLODE_TIME) * 0.75;
      if (now >= state.beepAt) {
        state.beepAt = now + interval;
        api.audio.beep(true);
      }
      // Blink the lamp.
      if (now >= state.blinkAt) {
        state.blinkAt = now + interval / 2;
        lightMat.emissiveIntensity = lightMat.emissiveIntensity > 1 ? 0.2 : 2;
      }
      if (defusing) {
        state.defuseProgress += dt / DEFUSE_TIME;
        if (Math.floor(now * 2) !== Math.floor((now - dt) * 2)) api.audio.defuseTick();
        if (state.defuseProgress >= 1) defused();
      } else {
        state.defuseProgress = Math.max(0, state.defuseProgress - dt / DEFUSE_TIME / 2);
      }
      // A defuse that lands on the same frame as the timer must win: the
      // status is no longer 'planted' once defused() runs.
      if (state.status === 'planted' && state.timer <= 0) {
        state.status = 'exploded';
        api.onExploded(state.position);
      }
    }
  }

  function reset() {
    state.status = 'carried';
    state.site = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.timer = 0;
    group.visible = false;
  }

  return { state, startPlant, abortPlant, planted, startDefuse, defused, step, reset };
}
