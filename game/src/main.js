// EMBERLINE — boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. main.js owns the wiring only: shooting, round flow, buying,
// planting and defusing, and the screenshot staging. The rules live in the
// modules it wires together (state, bots, weapons, bomb, player, hud).
//
// ?shot=start|play|buy|end with &seed=N stages a deterministic frame for a
// capture: it plays the real simulation forward, freezes it, renders twice and
// sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { rng } from './rng.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE_PRICE, ARMOUR_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_TIME, DEFUSE_TIME } from './bomb.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createState, PHASE, BUY_TIME, ROUND_TIME } from './state.js';
import { audio } from './audio.js';

const FIXED_STEP = 1 / 60;
const BASE_FOV = 74;
const SCOPED_FOV = 40;
const NOISE_PLAYER_SHOT = 26;
const NOISE_BOT_SHOT = 18;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
if (shot) rng.seed(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2f38');
scene.fog = new THREE.Fog(new THREE.Color('#2a2f38'), 30, 70);
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const game = createState();
const world = createWorld(scene);
const effects = createEffects(scene);
const bomb = createBomb(scene);
const player = createPlayer(world.colliders, MAP.spawns.wardens[0]);
const arsenal = createArsenal(camera);
const hud = createHud({ onBuy: (id) => buyItem(id) });

// The player as a bot target: feet position, eye height, crouch state, alive.
const playerTarget = {
  isPlayer: true,
  name: 'You',
  position: player.state.position,
  get crouching() {
    return player.state.crouching;
  },
  get alive() {
    return player.state.alive;
  },
  get eye() {
    return player.state.eye;
  },
};

const bots = createBots(scene, world, {
  getPlayer: () => playerTarget,
  playerSpeed: () => player.groundSpeed(),
  getBomb: () => ({
    status: bomb.state.status,
    position: bomb.state.position,
    site: bomb.state.site,
    siteAt: (position) => bomb.siteAt(position),
  }),
  onKill: (killer, victim, headshot) => {
    const killerName = killer && killer.name ? killer.name : 'You';
    const byPlayer = killerName === 'You';
    hud.addKill(killerName, victim.name, headshot, byPlayer);
    if (byPlayer) {
      game.addKillReward();
      hud.setMoney(game.state.money);
    }
  },
  onPlayerDamage: (amount, attacker) => {
    if (staging || !player.state.alive) return;
    const died = player.damage(amount);
    hud.flashDamage();
    audio.hurt();
    hud.setHealth(player.state.health);
    hud.setArmour(player.state.armour);
    if (died) {
      game.addDeath();
      hud.addKill(attacker.name, 'You', false, false);
      hud.setHint('You are down — your team fights on.');
      if (bomb.state.status === 'carried' && bomb.state.carrier === 'player') bomb.drop(player.state.position);
      bomb.state.progress = 0;
      bomb.state.acting = null;
    }
  },
  onBotShot: (bot, from, to, hit) => {
    effects.tracer(from, to);
    const distance = from.distanceTo(player.state.position);
    audio.distantShoot(distance);
    bots.hear(from, NOISE_BOT_SHOT, elapsed);
  },
  onBombDropped: (position) => bomb.drop(position),
  onBotPickupBomb: (bot) => {
    bomb.pickup(bot);
    bot.carryingBomb = true;
    hud.setBombStatus(`BOMB: WITH ${bot.name.toUpperCase()}`);
  },
});

const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const farPoint = new THREE.Vector3();

const body = player.state;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;
let staging = false; // true while a ?shot= capture plays the sim forward: the player cannot die mid-stage.
let triggerLatched = false;
let lastWeapon = 'pistol';
let shakeTime = 0;
let shakeAmp = 0;

function syncCamera() {
  let shakeX = 0;
  let shakeY = 0;
  if (shakeTime > 0) {
    shakeX = (rng.next() - 0.5) * shakeAmp;
    shakeY = (rng.next() - 0.5) * shakeAmp;
  }
  camera.position.set(body.position.x + shakeX, body.position.y + body.eye + shakeY, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const aiming = input.state.aiming && arsenal.def().scoped && game.state.phase === PHASE.LIVE;
  const targetFov = aiming ? SCOPED_FOV : BASE_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.35;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  const def = arsenal.def();
  if (!arsenal.takeRound()) {
    audio.empty();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (rng.next() * 2 - 1) * spread;
  direction.y += (rng.next() * 2 - 1) * spread;
  direction.z += (rng.next() * 2 - 1) * spread;
  direction.normalize();
  muzzle.set(0.24, -0.17, -0.9);
  camera.localToWorld(muzzle);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (hit) {
    effects.tracer(muzzle, hit.point);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const headshot = hit.object.userData.part === 'head';
      const damage = Math.round(def.damage * (headshot ? def.headMult : 1));
      const wasAlive = bot.alive;
      bots.damage(bot, damage, { name: 'You' });
      const killed = wasAlive && !bot.alive;
      effects.puff(hit.point, true);
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(killed);
    } else {
      effects.puff(hit.point, false);
    }
  } else {
    farPoint.copy(camera.position).addScaledVector(direction, 100);
    effects.tracer(muzzle, farPoint);
  }
  arsenal.pullTrigger();
  player.recoil(def.kick + rng.next() * def.kick * 0.5, (rng.next() * 2 - 1) * def.kick * 0.4);
  audio.shoot(def.kind);
  bots.hear(body.position, NOISE_PLAYER_SHOT, elapsed);
  hud.setAmmo(arsenal.ammo[arsenal.state.current].mag, arsenal.ammo[arsenal.state.current].reserve);
  return true;
}

function explodeGrenade(position, radius, damage) {
  effects.explode(position);
  audio.explosion();
  const playerDistance = player.state.position.distanceTo(position);
  if (playerDistance < radius && player.state.alive) {
    const falloff = 1 - playerDistance / radius;
    const died = player.damage(Math.round(damage * falloff));
    hud.flashDamage();
    hud.setHealth(player.state.health);
    if (died) {
      game.addDeath();
      hud.addKill('HE Charge', 'You', false, false);
      if (bomb.state.status === 'carried' && bomb.state.carrier === 'player') bomb.drop(player.state.position);
    }
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const distance = bot.group.position.distanceTo(position);
    if (distance >= radius) continue;
    bots.damage(bot, Math.round(damage * (1 - distance / radius)), { name: 'You' });
  }
  if (playerDistance < 14) {
    shakeTime = 0.4;
    shakeAmp = 0.12 * (1 - playerDistance / 14);
  }
}

function buyItem(id) {
  if (game.state.phase !== PHASE.BUY) return;
  if (id === 'grenade') {
    if (arsenal.state.grenades >= 2) return;
    if (!game.spend(GRENADE_PRICE)) return;
    arsenal.state.grenades += 1;
  } else if (id === 'armour') {
    if (player.state.armour >= 100) return;
    if (!game.spend(ARMOUR_PRICE)) return;
    player.state.armour = 100;
    hud.setArmour(100);
  } else {
    if (!game.spend(WEAPONS[id].price)) return;
    lastWeapon = arsenal.state.current;
    arsenal.buy(id);
  }
  audio.buy();
  hud.setMoney(game.state.money);
  hud.setWeapon(arsenal.def().name.toUpperCase(), arsenal.state.grenades);
  hud.setAmmo(arsenal.ammo[arsenal.state.current].mag, arsenal.ammo[arsenal.state.current].reserve);
}

function switchWeapon(id) {
  if (id === arsenal.state.current) return;
  const from = arsenal.state.current;
  if (arsenal.switchTo(id)) {
    lastWeapon = from;
    hud.setWeapon(arsenal.def().name.toUpperCase(), arsenal.state.grenades);
    hud.setAmmo(arsenal.ammo[id].mag, arsenal.ammo[id].reserve);
  }
}

function resetRound() {
  player.reset(MAP.spawns.wardens[0]);
  bots.reset(game.state.round);
  bomb.reset();
  hud.hideBanner();
  hud.setUseProgress(null, null);
  hud.setHealth(100);
  hud.setArmour(player.state.armour);
  hud.setAmmo(arsenal.ammo[arsenal.state.current].mag, arsenal.ammo[arsenal.state.current].reserve);
  hud.setWeapon(arsenal.def().name.toUpperCase(), arsenal.state.grenades);
  hud.setScore(game.state.score.wardens, game.state.score.raiders, game.state.round);
  hud.setMoney(game.state.money);
  hud.setBombStatus('BOMB: CARRIED');
  hud.setHint('Press B to buy · Round starts soon');
  syncCamera();
}

function startMatch() {
  game.startMatch();
  arsenal.refillAll();
  arsenal.state.grenades = 0;
  player.state.armour = 0;
  resetRound();
}

function endRound(winner, reason) {
  game.endRound(winner, reason);
  const won = winner === 'wardens';
  hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', `${reason} · ${game.state.score.wardens} — ${game.state.score.raiders}`);
  hud.setScore(game.state.score.wardens, game.state.score.raiders, game.state.round);
  hud.setMoney(game.state.money);
  hud.setUseProgress(null, null);
  hud.hideBuyMenu();
  audio.roundEnd(won);
}

function checkRoundEnd() {
  if (game.state.phase !== PHASE.LIVE) return;
  if (bomb.state.status === 'planted' && bomb.state.timer <= 0) {
    effects.explode(bomb.state.position);
    audio.explosion();
    shakeTime = 0.6;
    shakeAmp = 0.2;
    bomb.state.status = 'exploded';
    endRound('wardens', 'Bomb detonated');
    return;
  }
  if (bots.aliveCount('raiders') === 0) {
    endRound('wardens', 'Raiders eliminated');
    return;
  }
  const wardensAlive = bots.aliveCount('wardens') + (player.state.alive ? 1 : 0);
  if (wardensAlive === 0) {
    endRound('raiders', 'Wardens eliminated');
    return;
  }
  if (bomb.state.status !== 'planted' && game.state.timeLeft <= 0) {
    endRound('raiders', 'Time expired');
  }
}

function stepPlantDefuse(dt) {
  const bombState = bomb.state;
  if (game.state.phase !== PHASE.LIVE) return;
  // The player plants by holding E inside a site ring while carrying the bomb.
  if (bombState.status === 'carried' && bombState.carrier === 'player' && player.state.alive) {
    const site = bomb.siteAt(body.position);
    if (site && input.state.keys.has('KeyE')) {
      bombState.progress += dt / PLANT_TIME;
      bombState.acting = 'player';
      hud.setUseProgress('PLANTING BOMB', Math.min(1, bombState.progress));
      if (bombState.progress >= 1) {
        bomb.plantAt(site, body.position);
        audio.plant();
        hud.setBombStatus(`BOMB PLANTED — SITE ${site}`, true);
        hud.setHint('Bomb planted — defend it!');
      }
      return;
    }
    if (bombState.progress > 0) {
      bombState.progress = 0;
      bombState.acting = null;
      hud.setUseProgress(null, null);
    }
    return;
  }
  // A carrier bot plants once it reaches its site.
  if (bombState.status === 'carried' && bombState.carrier && bombState.carrier !== 'player') {
    const carrier = bombState.carrier;
    const site = carrier.intent === 'plant' && carrier.alive ? bomb.siteAt(carrier.group.position) : null;
    if (site) {
      bombState.progress += dt / PLANT_TIME;
      bombState.acting = carrier;
      hud.setUseProgress(`${carrier.name.toUpperCase()} IS PLANTING`, Math.min(1, bombState.progress));
      if (bombState.progress >= 1) {
        bomb.plantAt(site, carrier.group.position);
        audio.plant();
        hud.setBombStatus(`BOMB PLANTED — SITE ${site}`, true);
        hud.setHint('Bomb planted — defend it!');
      }
      return;
    }
    if (bombState.progress > 0) {
      bombState.progress = 0;
      bombState.acting = null;
      hud.setUseProgress(null, null);
    }
    return;
  }
  // A Raider defuses a planted bomb by standing at it.
  if (bombState.status === 'planted') {
    const defuser = bots.bots.find((bot) => bot.team === 'raiders' && bot.alive && bot.intent === 'defuse'
      && bot.group.position.distanceTo(bombState.position) < 2.2);
    if (defuser) {
      bombState.progress += dt / DEFUSE_TIME;
      bombState.acting = defuser;
      hud.setUseProgress('BOMB BEING DEFUSED!', Math.min(1, bombState.progress));
      if (bombState.progress >= 1) {
        bombState.status = 'defused';
        audio.defuse();
        endRound('raiders', 'Bomb defused');
      }
      return;
    }
    if (bombState.progress > 0) {
      bombState.progress = 0;
      bombState.acting = null;
      hud.setUseProgress(null, null);
    }
  }
}

function updateHud() {
  const state = game.state;
  hud.setTimer(state.phase === PHASE.BUY ? state.timeLeft : state.phase === PHASE.LIVE ? state.timeLeft : 0);
  if (state.phase === PHASE.LIVE) {
    if (bomb.state.status === 'planted') {
      hud.setBombStatus(`BOMB PLANTED — ${Math.max(0, bomb.state.timer).toFixed(0)}s`, true);
    } else if (bomb.state.status === 'carried' && bomb.state.carrier === 'player') {
      hud.setBombStatus('BOMB: CARRIED');
      if (player.state.alive) {
        hud.setHint(bomb.siteAt(body.position)
          ? 'Hold E to plant the bomb'
          : 'Plant the bomb at A (Furnace) or B (Silo)');
      }
    } else if (bomb.state.status === 'dropped') {
      hud.setBombStatus('BOMB: DROPPED');
    }
  } else if (state.phase === PHASE.BUY) {
    hud.setHint(`Press B to buy · Round starts in ${Math.max(0, Math.ceil(state.timeLeft))}s`);
  }
  hud.setCrosshairSpread(arsenal.spread(player.groundSpeed(), input.state.aiming));
}

function step(dt) {
  elapsed += dt;
  const state = game.state;
  shakeTime = Math.max(0, shakeTime - dt);

  if (state.phase === PHASE.BUY) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      game.beginLive();
      hud.hideBuyMenu();
      hud.setHint('Plant the bomb at A (Furnace) or B (Silo)');
    }
  } else if (state.phase === PHASE.LIVE) {
    if (bomb.state.status !== 'planted') state.timeLeft -= dt;
    player.step(dt, input.state.keys);
    bots.step(dt, elapsed, true);
    arsenal.step(dt, world.colliders, explodeGrenade);
    bomb.step(dt, (fast) => audio.beep(fast));
    stepPlantDefuse(dt);
    checkRoundEnd();
  } else if (state.phase === PHASE.ROUND_END) {
    bots.step(dt, elapsed, false);
    arsenal.step(dt, world.colliders, explodeGrenade);
    state.roundEndLeft -= dt;
    if (state.roundEndLeft <= 0) {
      if (game.nextRound()) {
        resetRound();
      } else {
        const won = state.matchWinner === 'wardens';
        hud.showMatchEnd(won, `${state.score.wardens} — ${state.score.raiders}`);
        input.releaseLock();
      }
    }
  }
  effects.step(dt);
  updateHud();
}

function handleInput() {
  const state = game.state;
  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH_END) return;
  if (input.wasPressed('KeyB') && state.phase === PHASE.BUY) {
    if (hud.buyMenuOpen()) {
      hud.hideBuyMenu();
      input.requestLock();
    } else {
      hud.showBuyMenu();
      input.releaseLock();
    }
  }
  if (hud.buyMenuOpen()) {
    const buyKeys = { Digit1: 'smg', Digit2: 'rifle', Digit3: 'dmr', Digit4: 'grenade', Digit5: 'armour' };
    for (const [code, id] of Object.entries(buyKeys)) {
      if (input.wasPressed(code)) buyItem(id);
    }
    return;
  }
  if (!input.state.locked || state.phase !== PHASE.LIVE || !player.state.alive) return;
  if (input.wasPressed('KeyR') && arsenal.reload()) audio.reload();
  if (input.wasPressed('KeyG') && arsenal.throwGrenade(
    new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z),
    camera.getWorldDirection(new THREE.Vector3()), scene,
  )) {
    hud.setWeapon(arsenal.def().name.toUpperCase(), arsenal.state.grenades);
  }
  if (input.wasPressed('Digit1')) switchWeapon('pistol');
  if (input.wasPressed('Digit2') && arsenal.state.primary) switchWeapon(arsenal.state.primary);
  if (input.wasPressed('KeyQ')) {
    const other = arsenal.state.current === 'pistol' ? arsenal.state.primary : 'pistol';
    if (other) switchWeapon(other);
  }
  const def = arsenal.def();
  if (input.state.firing && arsenal.ready()) {
    if (def.auto) {
      shoot(arsenal.spread(player.groundSpeed(), input.state.aiming));
    } else if (!triggerLatched) {
      triggerLatched = true;
      shoot(arsenal.spread(player.groundSpeed(), input.state.aiming));
    }
  }
  if (!input.state.firing) triggerLatched = false;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) player.look(look.x, look.y);
    handleInput();
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
  input.clearPressed();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
    hud.hideBuyMenu();
  } else if (!hud.buyMenuOpen() && (game.state.phase === PHASE.LIVE || game.state.phase === PHASE.BUY)) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.state.phase === PHASE.MENU || game.state.phase === PHASE.MATCH_END) startMatch();
  hud.hideOverlay();
  input.requestLock();
});

document.getElementById('buy-menu').addEventListener('click', (event) => {
  if (event.target.id === 'buy-menu') {
    hud.hideBuyMenu();
    input.requestLock();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Screenshot staging: play the real simulation forward, then freeze. ----
function settle(seconds) {
  const steps = Math.round(seconds / FIXED_STEP);
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
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

function findVisibleRaider(fromPositions) {
  for (const [x, z] of fromPositions) {
    body.position.set(x, 0, z);
    for (const bot of bots.bots) {
      if (bot.team !== 'raiders' || !bot.alive) continue;
      const target = new THREE.Vector3(bot.group.position.x, 1.2, bot.group.position.z);
      aimAt(target);
      camera.getWorldDirection(direction);
      scene.updateMatrixWorld(true);
      raycaster.set(camera.position, direction);
      const hit = raycaster.intersectObjects(shootables, false)[0];
      if (hit && hit.object.userData.bot === bot) return bot;
    }
  }
  return null;
}

function runShot(name) {
  staging = true;
  hud.hideOverlay();
  startMatch();
  if (name === 'buy') {
    game.state.money = 4050;
    hud.setMoney(4050);
    body.position.set(0, 0, 15.5);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    hud.showBuyMenu();
  } else if (name === 'end') {
    game.beginLive();
    settle(6);
    for (const bot of bots.bots) {
      if (bot.team === 'raiders' && bot.alive) bots.damage(bot, 1000, { name: 'You' });
    }
    settle(0.5);
    body.position.set(-2, 0, 6);
    aimAt(new THREE.Vector3(0, 1.4, -8));
  } else {
    game.beginLive();
    settle(name === 'play' ? 10 : 7);
    if (name === 'play') {
      arsenal.buy('rifle');
      hud.setWeapon('VK-47 CARBINE', 0);
      const bot = findVisibleRaider([[0, 3.5], [-6, 0], [6, 0], [0, -4], [-12, 4], [12, 4]]);
      if (bot) {
        aimAt(new THREE.Vector3(bot.group.position.x, 1.2, bot.group.position.z));
        shoot(0);
      } else {
        body.position.set(0, 0, 3.5);
        aimAt(new THREE.Vector3(0, 1.4, -10));
        shoot(0);
      }
    } else {
      body.position.set(0, 0, 15.5);
      aimAt(new THREE.Vector3(0, 1.4, -6));
      hud.showOverlay('start');
    }
  }
  hud.setScore(game.state.score.wardens, game.state.score.raiders, game.state.round);
  hud.setAmmo(arsenal.ammo[arsenal.state.current].mag, arsenal.ammo[arsenal.state.current].reserve);
  hud.setMoney(game.state.money);
  staging = false;
  paintTwiceThenReady();
}

syncCamera();
hud.setScore(0, 0, 1);
hud.setMoney(game.state.money);
if (shot) runShot(shot);
else requestAnimationFrame(frame);
