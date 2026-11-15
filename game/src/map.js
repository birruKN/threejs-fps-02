// EMBER YARD: the map. A 56 x 40 m dusk freight yard with two bomb sites,
// three lanes, and cover everywhere. All geometry is boxes/cylinders with
// canvas textures; every solid is both a collider and a bullet stop.
// Layout (x east, z south; Vanguard spawns north, Jackals south):
//   Site A (19,-13) warehouse NE | Site B (-19,-13) container yard NW | mid at x=0.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { asphaltTexture, containerTexture, hazardTexture, siteTexture, crateTexture } from './textures.js';

const HALF_X = 28;
const HALF_Z = 20;

export const SITES = {
  A: { letter: 'A', center: { x: 19, z: -13 }, radius: 5.5 },
  B: { letter: 'B', center: { x: -19, z: -13 }, radius: 5.5 },
};

export const SPAWNS = {
  vanguard: [
    { x: -4, z: -17, yaw: 0 }, { x: 0, z: -17.5, yaw: 0 }, { x: 4, z: -17, yaw: 0 },
    { x: -8, z: -15, yaw: 0.4 }, { x: 8, z: -15, yaw: -0.4 },
  ],
  jackal: [
    { x: -4, z: 17, yaw: Math.PI }, { x: 0, z: 17.5, yaw: Math.PI }, { x: 4, z: 17, yaw: Math.PI },
    { x: -8, z: 15, yaw: Math.PI - 0.4 }, { x: 8, z: 15, yaw: Math.PI + 0.4 },
  ],
};

// Waypoint graph: lanes the bots walk. Nodes are open ground; edges are clear
// sightlines between them. BFS over this graph gives every bot its path.
export const NODES = {
  JS: { x: 0, z: 17 }, AL1: { x: 10, z: 15 }, AL2: { x: 20, z: 12 }, AL3: { x: 24, z: 4 },
  AL4: { x: 22, z: -4 }, AL5: { x: 20, z: -9 }, A: { x: 19, z: -13 },
  BL1: { x: -10, z: 15 }, BL2: { x: -20, z: 12 }, BL3: { x: -24, z: 4 },
  BL4: { x: -22, z: -4 }, BL5: { x: -20, z: -9 }, B: { x: -19, z: -13 },
  M1: { x: 0, z: 12 }, M2: { x: 0, z: 6 }, M3: { x: 0, z: 0 }, M4: { x: 0, z: -6 },
  MA: { x: 10, z: -10 }, MB: { x: -10, z: -10 },
  VS: { x: 0, z: -17 }, HA: { x: 13, z: -15.5 }, HB: { x: -13, z: -15.5 }, HM: { x: 0, z: -11 },
  C1: { x: 8, z: 9 }, C2: { x: -8, z: 9 },
};

const EDGES = [
  ['JS', 'AL1'], ['AL1', 'AL2'], ['AL2', 'AL3'], ['AL3', 'AL4'], ['AL4', 'AL5'], ['AL5', 'A'],
  ['JS', 'BL1'], ['BL1', 'BL2'], ['BL2', 'BL3'], ['BL3', 'BL4'], ['BL4', 'BL5'], ['BL5', 'B'],
  ['JS', 'M1'], ['M1', 'M2'], ['M2', 'M3'], ['M3', 'M4'], ['M4', 'MA'], ['MA', 'A'],
  ['M4', 'MB'], ['MB', 'B'], ['M4', 'VS'], ['VS', 'HA'], ['VS', 'HB'], ['VS', 'HM'],
  ['HA', 'A'], ['HB', 'B'], ['HM', 'MA'], ['HM', 'MB'],
  ['M1', 'C1'], ['C1', 'AL2'], ['M1', 'C2'], ['C2', 'BL2'],
  ['AL3', 'M3'], ['BL3', 'M3'], ['AL4', 'MA'], ['BL4', 'MB'],
];

const ADJ = {};
for (const id of Object.keys(NODES)) ADJ[id] = [];
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }

export function nearestNode(x, z) {
  let best = 'JS';
  let bestD = Infinity;
  for (const [id, n] of Object.entries(NODES)) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

// Breadth-first path over the waypoint graph. Returns an array of {x, z}
// waypoints from the node nearest `from` to the node nearest `to`.
export function findPath(from, to) {
  const start = nearestNode(from.x, from.z);
  const goal = nearestNode(to.x, to.z);
  if (start === goal) return [{ x: to.x, z: to.z }];
  const prev = { [start]: null };
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const next of ADJ[cur]) {
      if (!(next in prev)) { prev[next] = cur; queue.push(next); }
    }
  }
  if (!(goal in prev)) return [{ x: to.x, z: to.z }];
  const ids = [];
  let cur = goal;
  while (cur) { ids.unshift(cur); cur = prev[cur]; }
  const points = ids.map((id) => ({ x: NODES[id].x, z: NODES[id].z }));
  points[points.length - 1] = { x: to.x, z: to.z };
  return points;
}

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  const mat = (color, roughness = 0.92, metalness = 0.04) => new THREE.MeshStandardMaterial({
    color, roughness, metalness,
  });
  const materials = {
    ground: new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.96, metalness: 0 }),
    concrete: mat(PALETTE.concrete),
    concreteDark: mat(PALETTE.concreteDark),
    rust: new THREE.MeshStandardMaterial({ map: containerTexture('#a34a24', '#c65a2e'), roughness: 0.75, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ map: containerTexture('#1f5b66', '#2e7f8a'), roughness: 0.75, metalness: 0.25 }),
    ochre: new THREE.MeshStandardMaterial({ map: containerTexture('#8a6520', '#b98a2f'), roughness: 0.75, metalness: 0.25 }),
    steel: mat(PALETTE.steel, 0.5, 0.6),
    wood: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9, metalness: 0 }),
    hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8, metalness: 0.1 }),
  };

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(rTop, rBottom, h, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // Approximate the cylinder with a square collider.
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - rBottom, y - h / 2, z - rBottom),
      new THREE.Vector3(x + rBottom, y + h / 2, z + rBottom),
    ));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF_X * 2 + 4, HALF_Z * 2 + 4), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);
  box(HALF_X * 2 + 0.8, 4.6, 0.4, 0, 2.3, -HALF_Z - 0.2, 'concrete');
  box(HALF_X * 2 + 0.8, 4.6, 0.4, 0, 2.3, HALF_Z + 0.2, 'concrete');
  box(0.4, 4.6, HALF_Z * 2 + 0.8, -HALF_X - 0.2, 2.3, 0, 'concrete');
  box(0.4, 4.6, HALF_Z * 2 + 0.8, HALF_X + 0.2, 2.3, 0, 'concrete');

  // Site A warehouse: three walls with a wide door gap on the south side.
  box(11, 4.2, 0.4, 19, 2.1, -17.6, 'concrete');
  box(0.4, 4.2, 9.6, 24.4, 2.1, -12.8, 'concrete');
  box(4.4, 4.2, 0.4, 15.8, 2.1, -8.4, 'concrete');
  box(3.4, 4.2, 0.4, 22.6, 2.1, -8.4, 'concrete');
  box(6, 2.6, 2.4, 21.5, 1.3, -14.5, 'rust'); // container inside A
  box(1.2, 1.1, 1.2, 16.5, 0.55, -11.5, 'wood');
  box(1.2, 1.1, 1.2, 17.8, 0.55, -10.6, 'wood');

  // Site B container yard: stacked containers, open on the east side.
  box(11, 4.2, 0.4, -19, 2.1, -17.6, 'concrete');
  box(0.4, 4.2, 9.6, -24.4, 2.1, -12.8, 'concrete');
  box(6, 2.6, 2.4, -21.5, 1.3, -14.5, 'teal');
  box(6, 2.6, 2.4, -21.5, 3.9, -14.5, 'ochre'); // stacked second level
  box(2.4, 2.6, 6, -16.5, 1.3, -11, 'rust');
  box(1.2, 1.1, 1.2, -17.5, 0.55, -15.5, 'wood');

  // Mid: a low wall with a door gap, a tank, and the crane legs.
  box(4.6, 2.2, 0.6, -4.6, 1.1, 0, 'concreteDark');
  box(4.6, 2.2, 0.6, 4.6, 1.1, 0, 'concreteDark');
  cylinder(1.6, 1.6, 3.4, -6, 1.7, -2, 'steel');
  box(0.7, 8.5, 0.7, -5, 4.25, -10, 'steel');
  box(0.7, 8.5, 0.7, 5, 4.25, -10, 'steel');
  box(10.7, 0.7, 0.7, 0, 8.5, -10, 'steel');

  // Field containers and crates: the lanes' cover.
  box(6, 2.6, 2.4, 11, 1.3, 6, 'ochre');
  box(6, 2.6, 2.4, -11, 1.3, 6, 'rust');
  box(2.4, 2.6, 6, 16, 1.3, 2, 'teal');
  box(2.4, 2.6, 6, -16, 1.3, 2, 'ochre');
  box(2.4, 2.6, 6, 23, 1.3, 8, 'rust');
  box(2.4, 2.6, 6, -23, 1.3, 8, 'teal');
  box(1.2, 1.1, 1.2, 6, 0.55, 10, 'wood');
  box(1.2, 1.1, 1.2, -6, 0.55, 10, 'wood');
  box(1.2, 1.1, 1.2, 7.2, 0.55, 10.6, 'wood');
  box(1.2, 1.1, 1.2, -7.2, 0.55, 10.6, 'wood');
  box(3.2, 1.1, 1.2, 0, 0.55, 13.5, 'concreteDark');
  box(1.2, 1.1, 3.2, 13, 0.55, -6, 'wood');
  box(1.2, 1.1, 3.2, -13, 0.55, -6, 'wood');
  box(2.4, 0.9, 1.2, 2.5, 0.45, -14, 'concreteDark');
  box(2.4, 0.9, 1.2, -2.5, 0.45, -14, 'concreteDark');

  // Site markers: hazard apron + big letter painted on the ground.
  for (const site of Object.values(SITES)) {
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(site.radius * 2, site.radius * 2), materials.hazard);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(site.center.x, 0.02, site.center.z);
    apron.receiveShadow = true;
    group.add(apron);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({
        map: siteTexture(site.letter, site.letter === 'A' ? '#c65a2e' : '#2e7f8a'),
        transparent: true, depthWrite: false,
      }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(site.center.x, 0.03, site.center.z);
    group.add(letter);
  }

  // Light: low amber sun from the west, cool dusk fill, two amber floodlights over the sites.
  // Bright enough that the yard reads at a glance even in the shadowed lanes.
  const sky = new THREE.HemisphereLight(0x8fa3d9, 0x4a3f30, 1.5);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffb347, 3.2);
  sun.position.set(-22, 12, 14);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x8fa3d9, 0.85);
  fill.position.set(18, 10, -14);
  scene.add(fill);
  for (const site of Object.values(SITES)) {
    // Lamp sits on the pole top (offset from the site centre) so it never
    // hangs in the middle of the player's sightline over a bomb site.
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffc46b }),
    );
    lamp.position.set(site.center.x + 2.6, 5.6, site.center.z + 2.6);
    group.add(lamp);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.6, 0.18), materials.steel);
    pole.position.set(site.center.x + 2.6, 2.8, site.center.z + 2.6);
    pole.castShadow = true;
    group.add(pole);
    const light = new THREE.PointLight(0xffb347, 28, 22, 1.8);
    light.position.set(site.center.x, 5.2, site.center.z);
    scene.add(light);
  }

  return { colliders, shootables, group };
}

// Resolve an AABB body (position = feet centre) against the map colliders.
// Moves `pos` out of every overlapping box, axis by axis. Returns true when
// the body stands on something (ground or a low box top).
export function collide(pos, radius, height, colliders) {
  let grounded = false;
  for (const box of colliders) {
    const minX = box.min.x - radius, maxX = box.max.x + radius;
    const minZ = box.min.z - radius, maxZ = box.max.z + radius;
    const minY = box.min.y - height, maxY = box.max.y;
    if (pos.x < minX || pos.x > maxX || pos.z < minZ || pos.z > maxZ || pos.y < minY || pos.y > maxY) continue;
    // Penetration on each axis; push out along the smallest.
    const dxl = pos.x - minX, dxr = maxX - pos.x;
    const dzl = pos.z - minZ, dzr = maxZ - pos.z;
    const dyt = maxY - pos.y, dyb = pos.y - minY;
    const m = Math.min(dxl, dxr, dzl, dzr, dyt, dyb);
    if (m === dyt) { pos.y = maxY; grounded = true; }
    else if (m === dyb) { pos.y = minY; }
    else if (m === dxl) { pos.x = minX; }
    else if (m === dxr) { pos.x = maxX; }
    else if (m === dzl) { pos.z = minZ; }
    else { pos.z = maxZ; }
  }
  if (pos.y <= 0) { pos.y = 0; grounded = true; }
  return grounded;
}
