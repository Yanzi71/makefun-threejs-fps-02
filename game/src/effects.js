// Transient effects, all pooled: tracer lines, impact puffs and the explosion
// flash. Nothing is allocated in the hot loop — the pools are built once and the
// oldest live effect is reused when the pool is full.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const PUFFS = 24;

export function createEffects(scene) {
  const tracerMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMaterial);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerCursor = 0;

  const puffGeometry = new THREE.SphereGeometry(0.12, 8, 6);
  const puffMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ink), transparent: true, opacity: 0.8 });
  const bloodMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger), transparent: true, opacity: 0.85 });
  const puffs = [];
  for (let i = 0; i < PUFFS; i += 1) {
    const mesh = new THREE.Mesh(puffGeometry, puffMaterial);
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0, blood: false });
  }
  let puffCursor = 0;

  const explosion = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  explosion.visible = false;
  scene.add(explosion);
  const explosionLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 30);
  scene.add(explosionLight);
  let explosionLife = 0;

  function step(dt) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      if (tracer.life <= 0) tracer.line.visible = false;
    }
    for (const puff of puffs) {
      if (puff.life <= 0) continue;
      puff.life -= dt;
      const scale = 1 + (0.35 - puff.life) * 3;
      puff.mesh.scale.setScalar(Math.max(0.1, scale));
      puff.mesh.material.opacity = Math.max(0, puff.life / 0.35) * 0.85;
      if (puff.life <= 0) puff.mesh.visible = false;
    }
    if (explosionLife > 0) {
      explosionLife -= dt;
      const t = 1 - Math.max(0, explosionLife) / 0.9;
      explosion.scale.setScalar(1 + t * 7);
      explosion.material.opacity = Math.max(0, 0.85 * (1 - t));
      explosionLight.intensity = Math.max(0, 400 * (1 - t));
      if (explosionLife <= 0) {
        explosion.visible = false;
        explosionLight.intensity = 0;
      }
    }
  }

  return {
    step,
    tracer(from, to) {
      const slot = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % TRACERS;
      const positions = slot.line.geometry.attributes.position.array;
      positions[0] = from.x;
      positions[1] = from.y;
      positions[2] = from.z;
      positions[3] = to.x;
      positions[4] = to.y;
      positions[5] = to.z;
      slot.line.geometry.attributes.position.needsUpdate = true;
      slot.line.visible = true;
      slot.life = 0.09;
    },
    puff(point, blood) {
      const slot = puffs[puffCursor];
      puffCursor = (puffCursor + 1) % PUFFS;
      slot.mesh.material = blood ? bloodMaterial : puffMaterial;
      slot.mesh.position.copy(point);
      slot.mesh.scale.setScalar(1);
      slot.mesh.visible = true;
      slot.life = 0.35;
    },
    explode(point) {
      explosion.position.copy(point);
      explosion.position.y = Math.max(0.6, point.y);
      explosionLight.position.copy(point);
      explosionLight.position.y = Math.max(1, point.y);
      explosion.visible = true;
      explosionLife = 0.9;
    },
  };
}
