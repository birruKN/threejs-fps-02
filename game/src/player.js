// The player: acceleration movement, crouch, jump, collision, recoil.
// One state object; step() is pure simulation (no DOM, no rendering).
import * as THREE from 'three';
import { collide } from './map.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const RADIUS = 0.35;
const HEIGHT_STAND = 1.72;
const HEIGHT_CROUCH = 1.18;
const WALK_SPEED = 5.1;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 11;
const GRAVITY = 22;
const JUMP_SPEED = 7.2;

export function createPlayer(colliders, spawn) {
  const state = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw,
    pitch: 0,
    eye: EYE_STAND,
    height: HEIGHT_STAND,
    crouched: false,
    onGround: true,
    hp: 100,
    armor: 0,
    alive: true,
    recoilPitch: 0,
    recoilYaw: 0,
  };

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch -= dy * 0.0021;
    const limit = Math.PI / 2 - 0.01;
    state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
  }

  function recoil(pitchKick, yawKick) {
    state.recoilPitch += pitchKick;
    state.recoilYaw += yawKick;
  }

  function step(dt, keys) {
    if (!state.alive) return;
    const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouched = wantCrouch;
    const targetEye = wantCrouch ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 14);
    state.height = wantCrouch ? HEIGHT_CROUCH : HEIGHT_STAND;

    // Wish direction in world space from yaw.
    let fx = 0, fz = 0;
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    if (keys.has('KeyW')) { fx -= sin; fz -= cos; }
    if (keys.has('KeyS')) { fx += sin; fz += cos; }
    if (keys.has('KeyA')) { fx -= cos; fz += sin; }
    if (keys.has('KeyD')) { fx += cos; fz -= sin; }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }

    const speed = wantCrouch ? CROUCH_SPEED : WALK_SPEED;
    const vx = state.velocity.x, vz = state.velocity.z;
    // Accelerate toward the wish velocity; friction when no input.
    const targetVx = fx * speed, targetVz = fz * speed;
    const rate = len > 0 ? ACCEL : FRICTION * 2.2;
    state.velocity.x = vx + (targetVx - vx) * Math.min(1, rate * dt / speed * 5.1);
    state.velocity.z = vz + (targetVz - vz) * Math.min(1, rate * dt / speed * 5.1);

    if (state.onGround && keys.has('Space') && !wantCrouch) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;

    state.position.x += state.velocity.x * dt;
    state.position.z += state.velocity.z * dt;
    state.position.y += state.velocity.y * dt;
    state.onGround = collide(state.position, RADIUS, state.height, colliders);
    if (state.onGround && state.velocity.y < 0) state.velocity.y = 0;
    if (state.position.y < 0) { state.position.y = 0; state.velocity.y = 0; state.onGround = true; }

    // Recoil decays back toward zero.
    state.recoilPitch *= Math.max(0, 1 - dt * 7);
    state.recoilYaw *= Math.max(0, 1 - dt * 7);
  }

  function groundSpeed() {
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  // Damage with armour absorbing half. Returns true when this kills.
  function damage(amount) {
    if (!state.alive) return false;
    let rest = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, rest * 0.5);
      state.armor -= absorbed;
      rest -= absorbed;
    }
    state.hp -= rest;
    if (state.hp <= 0) {
      state.hp = 0;
      state.alive = false;
      return true;
    }
    return false;
  }

  function reset(spawnPoint) {
    state.position.set(spawnPoint.x, 0, spawnPoint.z);
    state.velocity.set(0, 0, 0);
    state.yaw = spawnPoint.yaw;
    state.pitch = 0;
    state.hp = 100;
    state.armor = 0;
    state.alive = true;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
  }

  return { state, look, recoil, step, groundSpeed, damage, reset };
}
