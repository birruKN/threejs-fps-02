// Effects: tracers, muzzle flashes, impact sparks and the bomb blast.
// Everything is pooled and reused — no new objects in the hot loop.
import * as THREE from 'three';

const TRACER_POOL = 14;
const SPARK_POOL = 10;
const SPARKS_PER_BURST = 14;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0,
    }));
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS_PER_BURST * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.09, transparent: true, opacity: 0,
    }));
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, life: 0, vel: new Float32Array(SPARKS_PER_BURST * 3) });
  }
  let sparkIndex = 0;

  // Muzzle flash: a small additive plane that lives one frame at the barrel.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc46b, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  flash.frustumCulled = false;
  scene.add(flash);
  let flashLife = 0;

  // Bomb blast: an expanding shell + a light that fades with it.
  const blastMat = new THREE.MeshBasicMaterial({
    color: 0xff8a3c, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), blastMat);
  blast.frustumCulled = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xff8a3c, 0, 30, 1.6);
  scene.add(blastLight);
  let blastLife = 0;
  let blastPos = new THREE.Vector3();

  function tracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const attr = t.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.life = 0.09;
  }

  function sparkBurst(point, normal) {
    const s = sparks[sparkIndex];
    sparkIndex = (sparkIndex + 1) % SPARK_POOL;
    const attr = s.points.geometry.getAttribute('position');
    for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
      attr.setXYZ(i, point.x, point.y, point.z);
      const spread = 2.2;
      s.vel[i * 3] = normal.x * 2 + (Math.random() - 0.5) * spread;
      s.vel[i * 3 + 1] = normal.y * 2 + Math.random() * 2.4;
      s.vel[i * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * spread;
    }
    attr.needsUpdate = true;
    s.points.material.opacity = 1;
    s.life = 0.35;
  }

  function muzzle(at, direction) {
    flash.position.copy(at);
    flash.lookAt(at.clone().add(direction));
    flash.rotation.z = Math.random() * Math.PI;
    flashMat.opacity = 0.95;
    flashLife = 0.05;
  }

  function explosion(point) {
    blastPos.copy(point);
    blast.position.copy(point);
    blastLife = 0.7;
    blastLight.position.copy(point);
    blastLight.position.y += 1;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const attr = s.points.geometry.getAttribute('position');
      for (let i = 0; i < SPARKS_PER_BURST; i += 1) {
        s.vel[i * 3 + 1] -= 9 * dt;
        attr.setXYZ(i,
          attr.getX(i) + s.vel[i * 3] * dt,
          attr.getY(i) + s.vel[i * 3 + 1] * dt,
          attr.getZ(i) + s.vel[i * 3 + 2] * dt);
      }
      attr.needsUpdate = true;
      s.points.material.opacity = Math.max(0, s.life / 0.35);
    }
    if (flashLife > 0) {
      flashLife -= dt;
      if (flashLife <= 0) flashMat.opacity = 0;
    }
    if (blastLife > 0) {
      blastLife -= dt;
      const k = Math.max(0, blastLife / 0.7);
      const radius = (1 - k) * 9 + 0.5;
      blast.scale.setScalar(radius);
      blastMat.opacity = k * 0.55;
      blastLight.intensity = k * 220;
      if (blastLife <= 0) { blastMat.opacity = 0; blastLight.intensity = 0; }
    }
  }

  return { tracer, sparkBurst, muzzle, explosion, step };
}
