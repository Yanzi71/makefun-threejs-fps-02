// The bomb: carried, dropped, planted, defused or exploded. The Wardens attack,
// so the player (or a friendly bot that picks it up) plants it at a site by
// holding the use key inside the site ring; a Raider defuses it the same way.
// A planted bomb ticks for 35 seconds with accelerating beeps, then ends the round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';

export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 35;

export function createBomb(scene) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 }),
  );
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  lamp.position.set(0.12, 0.13, 0);
  body.add(lamp);
  body.visible = false;
  scene.add(body);

  const state = {
    status: 'carried', // carried | dropped | planted | exploded | defused
    carrier: 'player', // 'player' | bot object | null
    site: null,
    position: new THREE.Vector3(),
    timer: 0,
    progress: 0, // plant or defuse progress, 0..1
    acting: null, // who is currently planting/defusing
    lastBeep: 0,
  };

  function siteAt(position) {
    for (const [key, site] of Object.entries(MAP.sites)) {
      const dx = position.x - site.x;
      const dz = position.z - site.z;
      if (dx * dx + dz * dz <= site.radius * site.radius) return key;
    }
    return null;
  }

  return {
    state,
    siteAt,
    mesh: body,
    drop(position) {
      state.status = 'dropped';
      state.carrier = null;
      state.position.copy(position);
      state.position.y = 0.12;
      body.position.copy(state.position);
      body.visible = true;
    },
    pickup(bot) {
      state.status = 'carried';
      state.carrier = bot;
      body.visible = false;
    },
    plantAt(siteKey, position) {
      state.status = 'planted';
      state.site = siteKey;
      state.carrier = null;
      state.timer = BOMB_TIMER;
      state.progress = 0;
      state.acting = null;
      state.position.copy(position);
      state.position.y = 0.12;
      body.position.copy(state.position);
      body.visible = true;
    },
    reset() {
      state.status = 'carried';
      state.carrier = 'player';
      state.site = null;
      state.timer = 0;
      state.progress = 0;
      state.acting = null;
      body.visible = false;
    },
    step(dt, onBeep) {
      if (state.status !== 'planted') return;
      state.timer -= dt;
      // Beeps accelerate as the timer runs down: every 1s, then every 0.4s.
      const interval = state.timer < 10 ? 0.4 : 1;
      state.lastBeep += dt;
      if (state.lastBeep >= interval) {
        state.lastBeep = 0;
        lamp.material.color.setHex(0xffffff);
        setTimeout(() => lamp.material.color.setHex(new THREE.Color(PALETTE.danger).getHex()), 60);
        onBeep(state.timer < 10);
      }
    },
  };
}
