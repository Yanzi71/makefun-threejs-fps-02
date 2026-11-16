// The map as geometry: every MAP box becomes a mesh, a player/bot collider and a
// surface bullets stop on. Decor (site rings, light strips, pipes) is visual only
// and never collides. One directional key light with shadows, one cool fill, and a
// hemisphere gradient make the dusk-foundry look from the palette alone.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.5 : 0.92,
      metalness: name === 'surface' || name === 'hairline' ? 0.25 : 0.05,
    });
  }
  const floorMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.95, metalness: 0.1 });

  const colliders = [];
  const shootables = [];

  for (const [w, h, d, x, y, z, material] of MAP.boxes) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material === 'canvas' && y < 0 ? floorMaterial : materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
  }

  // Site markers: flat amber rings on the floor so a site reads at a glance.
  const ringGeometry = new THREE.RingGeometry(3.4, 4.4, 40);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  for (const site of Object.values(MAP.sites)) {
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
  }

  // Amber light strips along the hall doorways: the map's wayfinding.
  const stripGeometry = new THREE.BoxGeometry(4, 0.14, 0.14);
  const stripMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  for (const z of [-2, -9]) {
    const strip = new THREE.Mesh(stripGeometry, stripMaterial);
    strip.position.set(0, 3.3, z);
    group.add(strip);
  }

  // Pipes along the west and east walls: plain cylinders, visual only.
  const pipeGeometry = new THREE.CylinderGeometry(0.16, 0.16, 36, 10);
  for (const x of [-23.6, 23.6]) {
    const pipe = new THREE.Mesh(pipeGeometry, materials.hairline);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 3.1, 0);
    group.add(pipe);
  }

  // Light: a low amber sun from the west, a cool slate fill, a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6b80'), new THREE.Color(PALETTE.canvas), 0.9);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45c'), 2.4);
  key.position.set(-18, 20, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color('#7d8ea3'), 0.6);
  fill.position.set(14, 12, 16);
  scene.add(fill);

  return { colliders, shootables, group, materials };
}
