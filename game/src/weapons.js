// The arsenal: four hitscan weapons and one throwable. Each definition owns its
// damage, fire rate, magazine, price and spread, so balancing is data, not code.
// The arsenal also owns the first-person view models (one per weapon, toggled),
// the muzzle flash, and the grenades in flight — their arc, bounce and fuse.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P9 Sidearm', price: 0, damage: 34, headMult: 3, mag: 12, reserveMax: 48, fireGap: 0.16, auto: false, reload: 1.4, spreadStill: 0.004, spreadMove: 0.02, kick: 0.006, kind: 'pistol' },
  smg: { name: 'Raptor-9 SMG', price: 1200, damage: 22, headMult: 2.6, mag: 32, reserveMax: 128, fireGap: 0.075, auto: true, reload: 2.0, spreadStill: 0.006, spreadMove: 0.032, kick: 0.004, kind: 'smg' },
  rifle: { name: 'VK-47 Carbine', price: 2500, damage: 32, headMult: 3.2, mag: 30, reserveMax: 90, fireGap: 0.1, auto: true, reload: 2.2, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, kind: 'rifle' },
  dmr: { name: 'Longbow DMR', price: 3800, damage: 78, headMult: 3.5, mag: 10, reserveMax: 30, fireGap: 0.55, auto: false, reload: 2.8, spreadStill: 0.0006, spreadMove: 0.04, kick: 0.02, kind: 'dmr', scoped: true },
};
export const GRENADE_PRICE = 300;
export const ARMOUR_PRICE = 650;
const GRENADE_FUSE = 1.6;
const GRENADE_RADIUS = 6;
const GRENADE_DAMAGE = 95;
const MUZZLE_TIME = 0.06;

function box(w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function createArsenal(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6b4a2f'), roughness: 0.8, metalness: 0.05 });

  // One view model per weapon; only the current one is visible.
  const models = {};
  const pistol = new THREE.Group();
  pistol.add(box(0.07, 0.09, 0.26, 0, 0, 0, dark), box(0.05, 0.05, 0.12, 0, 0.02, -0.18, steel), box(0.06, 0.14, 0.07, 0, -0.1, 0.07, wood));
  models.pistol = pistol;
  const smg = new THREE.Group();
  smg.add(box(0.08, 0.1, 0.4, 0, 0, 0, dark), box(0.04, 0.04, 0.24, 0, 0.02, -0.3, steel), box(0.06, 0.2, 0.08, 0, -0.14, -0.05, steel), box(0.07, 0.08, 0.16, 0, -0.01, 0.26, dark));
  models.smg = smg;
  const rifle = new THREE.Group();
  rifle.add(box(0.09, 0.1, 0.46, 0, 0, 0, steel), box(0.045, 0.045, 0.42, 0, 0.025, -0.42, dark), box(0.075, 0.08, 0.24, 0, -0.02, 0.32, wood), box(0.06, 0.12, 0.08, 0, -0.1, 0.02, dark));
  models.rifle = rifle;
  const dmr = new THREE.Group();
  dmr.add(box(0.08, 0.09, 0.5, 0, 0, 0, dark), box(0.035, 0.035, 0.55, 0, 0.02, -0.5, steel), box(0.07, 0.07, 0.28, 0, -0.01, 0.36, wood));
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12), steel);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.09, -0.05);
  dmr.add(scope);
  models.dmr = dmr;
  for (const model of Object.values(models)) {
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
  }
  models.pistol.visible = true;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.15, -0.6);
  camera.add(flashLight);

  const grenadeGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.5, metalness: 0.3 });
  const grenades = [];
  const probe = new THREE.Box3();

  const ammo = {};
  for (const [id, def] of Object.entries(WEAPONS)) ammo[id] = { mag: def.mag, reserve: def.reserveMax };
  const owned = new Set(['pistol']);
  const state = { current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0, primary: null };

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt, colliders, onExplode) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      const total = def().reload;
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (total - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - ammo[state.current].mag;
        const take = Math.min(need, ammo[state.current].reserve);
        ammo[state.current].mag += take;
        ammo[state.current].reserve -= take;
      }
    }
    // Grenades: gravity, a bounce off any collider, then the fuse.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const grenade = grenades[i];
      grenade.fuse -= dt;
      grenade.velocity.y -= 18 * dt;
      grenade.position.x += grenade.velocity.x * dt;
      grenade.position.y += grenade.velocity.y * dt;
      grenade.position.z += grenade.velocity.z * dt;
      probe.min.set(grenade.position.x - 0.09, grenade.position.y - 0.09, grenade.position.z - 0.09);
      probe.max.set(grenade.position.x + 0.09, grenade.position.y + 0.09, grenade.position.z + 0.09);
      for (const collider of colliders) {
        if (!probe.intersectsBox(collider)) continue;
        const dx = Math.min(probe.max.x - collider.min.x, collider.max.x - probe.min.x);
        const dy = Math.min(probe.max.y - collider.min.y, collider.max.y - probe.min.y);
        const dz = Math.min(probe.max.z - collider.min.z, collider.max.z - probe.min.z);
        if (dy <= dx && dy <= dz) {
          grenade.position.y = grenade.velocity.y < 0 ? collider.max.y + 0.09 : collider.min.y - 0.09;
          grenade.velocity.y = -grenade.velocity.y * 0.45;
          grenade.velocity.x *= 0.7;
          grenade.velocity.z *= 0.7;
        } else if (dx <= dz) {
          grenade.position.x = grenade.velocity.x < 0 ? collider.max.x + 0.09 : collider.min.x - 0.09;
          grenade.velocity.x = -grenade.velocity.x * 0.45;
        } else {
          grenade.position.z = grenade.velocity.z < 0 ? collider.max.z + 0.09 : collider.min.z - 0.09;
          grenade.velocity.z = -grenade.velocity.z * 0.45;
        }
      }
      grenade.mesh.position.copy(grenade.position);
      if (grenade.fuse <= 0) {
        grenade.mesh.removeFromParent();
        grenades.splice(i, 1);
        onExplode(grenade.position, GRENADE_RADIUS, GRENADE_DAMAGE);
      }
    }
  }

  return {
    state,
    ammo,
    owned,
    def,
    step,
    ready() {
      return ammo[state.current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.05 + def().kick * 2;
    },
    takeRound() {
      if (ammo[state.current].mag <= 0) return false;
      ammo[state.current].mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || ammo[state.current].mag === def().mag || ammo[state.current].reserve === 0) return false;
      state.reloadLeft = def().reload;
      return true;
    },
    spread(speed, aiming) {
      const d = def();
      let value = d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
      if (aiming && d.scoped) value *= 0.25;
      return value;
    },
    switchTo(id) {
      if (!owned.has(id) || id === state.current) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.reloadLeft = 0;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    buy(id) {
      // Buying a primary replaces the old one; the pistol is always owned.
      if (id !== 'pistol') {
        if (state.primary) owned.delete(state.primary);
        state.primary = id;
      }
      owned.add(id);
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserveMax };
      this.switchTo(id);
    },
    throwGrenade(origin, direction, scene) {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
      const position = origin.clone();
      const velocity = direction.clone().multiplyScalar(13);
      velocity.y += 3.5;
      mesh.position.copy(position);
      scene.add(mesh);
      grenades.push({ mesh, position, velocity, fuse: GRENADE_FUSE });
      return true;
    },
    refillAll() {
      for (const [id, d] of Object.entries(WEAPONS)) ammo[id] = { mag: d.mag, reserve: d.reserveMax };
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
  };
}
