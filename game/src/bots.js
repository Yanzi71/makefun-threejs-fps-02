// The bots: two friendly Wardens and three enemy Raiders. Each bot pathfinds over
// the map's waypoint graph (BFS), sees with a raycast (distance, field of view,
// line of sight), hears gunfire and investigates it, and fights in bursts with a
// reaction delay and distance-based accuracy. Raiders hold the sites, push mid,
// retake and defuse; Wardens push their assigned site, retrieve a dropped bomb
// and plant it. One shared raycaster, staggered think ticks, no allocation in the
// step loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './map.js';
import { rng } from './rng.js';

const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.7;
const EYE_HEIGHT = 1.5;
const VISION_RANGE = 46;
const VISION_FOV = 1.9; // radians, ~109 degrees
const THINK_INTERVAL = 0.12;

const NAMES = {
  wardens: ['Vex', 'Mira'],
  raiders: ['Rook', 'Havoc', 'Sable'],
};

function buildAdjacency() {
  const adjacency = {};
  for (const id of Object.keys(MAP.graph.nodes)) adjacency[id] = [];
  for (const [a, b] of MAP.graph.edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return adjacency;
}
const ADJACENCY = buildAdjacency();

function nearestNode(x, z) {
  let best = null;
  let bestDistance = Infinity;
  for (const [id, [nx, nz]] of Object.entries(MAP.graph.nodes)) {
    const dx = nx - x;
    const dz = nz - z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

// Breadth-first search over the waypoint graph. Returns waypoints as [x, z]
// pairs from the caller's position to the target node (or point).
function findPath(fromX, fromZ, toNodeId, toPoint) {
  const start = nearestNode(fromX, fromZ);
  const target = toNodeId ?? nearestNode(toPoint[0], toPoint[1]);
  const previous = { [start]: null };
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === target) break;
    for (const next of ADJACENCY[current]) {
      if (!(next in previous)) {
        previous[next] = current;
        queue.push(next);
      }
    }
  }
  if (!(target in previous)) return [];
  const nodes = [];
  let cursor = target;
  while (cursor !== null) {
    nodes.unshift(cursor);
    cursor = previous[cursor];
  }
  const waypoints = nodes.map((id) => MAP.graph.nodes[id]);
  if (toPoint) waypoints.push(toPoint);
  return waypoints;
}

export function createBots(scene, world, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = VISION_RANGE + 2;
  const eye = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const probe = new THREE.Box3();
  const tmpDirection = new THREE.Vector3();

  const teamMaterial = {
    wardens: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, metalness: 0.1 }),
    raiders: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.6, metalness: 0.1 }),
  };
  const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6, metalness: 0.05 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.62, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.15, 14, 10);
  const legGeometry = new THREE.BoxGeometry(0.16, 0.55, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.55);

  const bots = [];
  const hitMeshes = [];

  function makeBot(team, index, spawn) {
    const group = new THREE.Group();
    group.position.set(spawn.x, 0, spawn.z);
    const legL = new THREE.Mesh(legGeometry, legMaterial);
    legL.position.set(-0.12, 0.28, 0);
    const legR = new THREE.Mesh(legGeometry, legMaterial);
    legR.position.set(0.12, 0.28, 0);
    const torso = new THREE.Mesh(torsoGeometry, teamMaterial[team]);
    torso.position.y = 0.88;
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.45;
    const gun = new THREE.Mesh(gunGeometry, legMaterial);
    gun.position.set(0.16, 1.02, -0.32);
    group.add(legL, legR, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    group.rotation.y = spawn.yaw;
    scene.add(group);

    const bot = {
      name: NAMES[team][index],
      team,
      index,
      group,
      torso,
      head,
      health: 100,
      alive: true,
      fall: 0,
      yaw: spawn.yaw,
      state: 'route',
      path: [],
      pathIndex: 0,
      target: null,
      lastSeen: -10,
      lastSeenPos: new THREE.Vector3(),
      reactionAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      thinkTimer: index * 0.04,
      speed: 3.4 + rng.next() * 0.5,
      holdYaw: spawn.yaw,
      scanPhase: rng.next() * Math.PI * 2,
      intent: null,
      stuckTimer: 0,
      stuckPos: new THREE.Vector3(spawn.x, 0, spawn.z),
      investigatePos: null,
      alertedAt: -10,
      holdUntil: 0,
      siteKey: null,
      role: null,
      carryingBomb: false,
      strafeDir: 1,
      strafeTimer: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  MAP.spawns.wardens.slice(1).forEach((spawn, i) => makeBot('wardens', i, spawn));
  MAP.spawns.raiders.forEach((spawn, i) => makeBot('raiders', i, spawn));

  function overlaps(x, z) {
    probe.min.set(x - BOT_RADIUS, 0.05, z - BOT_RADIUS);
    probe.max.set(x + BOT_RADIUS, BOT_HEIGHT - 0.05, z + BOT_RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function moveToward(bot, dt, targetX, targetZ, speed) {
    const dx = targetX - bot.group.position.x;
    const dz = targetZ - bot.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) return true;
    const stepX = (dx / distance) * speed * dt;
    const stepZ = (dz / distance) * speed * dt;
    const nextX = bot.group.position.x + stepX;
    if (!overlaps(nextX, bot.group.position.z)) bot.group.position.x = nextX;
    const nextZ = bot.group.position.z + stepZ;
    if (!overlaps(bot.group.position.x, nextZ)) bot.group.position.z = nextZ;
    // Face the direction of travel.
    const targetYaw = Math.atan2(-dx, -dz);
    bot.yaw = turnToward(bot.yaw, targetYaw, dt * 8);
    return distance < 0.4;
  }

  function turnToward(current, target, maxDelta) {
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) <= maxDelta) return target;
    return current + Math.sign(delta) * maxDelta;
  }

  function visibleEnemy(bot, now) {
    eye.set(bot.group.position.x, EYE_HEIGHT, bot.group.position.z);
    const candidates = [];
    const player = hooks.getPlayer();
    if (bot.team === 'raiders' && player.alive) candidates.push(player);
    for (const other of bots) {
      if (other.team !== bot.team && other.alive) candidates.push(other);
    }
    let best = null;
    let bestDistance = Infinity;
    for (const enemy of candidates) {
      const enemyPos = enemy.isPlayer ? enemy.position : enemy.group.position;
      const enemyEye = enemy.isPlayer ? enemy.eye : EYE_HEIGHT;
      toTarget.set(enemyPos.x - eye.x, enemyPos.y + enemyEye - 0.35 - eye.y, enemyPos.z - eye.z);
      const distance = toTarget.length();
      if (distance > VISION_RANGE || distance >= bestDistance) continue;
      // Field of view: the target must be in front of the bot.
      ahead.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
      tmpDirection.copy(toTarget).normalize();
      if (Math.acos(Math.max(-1, Math.min(1, ahead.dot(tmpDirection)))) > VISION_FOV / 2) continue;
      raycaster.set(eye, tmpDirection);
      const hit = raycaster.intersectObjects(world.shootables, false)[0];
      if (hit && hit.distance < distance - 0.6) continue;
      best = enemy;
      bestDistance = distance;
    }
    return best;
  }

  function fireAt(bot, enemy, now) {
    const from = new THREE.Vector3(bot.group.position.x + 0.16, 1.1, bot.group.position.z);
    const enemyPos = enemy.isPlayer ? enemy.position : enemy.group.position;
    const enemyEye = enemy.isPlayer ? enemy.eye : EYE_HEIGHT;
    const to = new THREE.Vector3(enemyPos.x, enemyPos.y + enemyEye - 0.35, enemyPos.z);
    const distance = from.distanceTo(to);
    // Accuracy falls with distance; a moving or crouching target is harder to hit.
    let chance = Math.max(0.08, Math.min(0.62, 0.62 - distance * 0.011));
    const targetSpeed = enemy.isPlayer ? hooks.playerSpeed() : 3.5;
    if (targetSpeed > 2) chance *= 0.7;
    if (enemy.isPlayer && enemy.crouching) chance *= 0.85;
    const hit = rng.next() < chance;
    const headshot = hit && rng.next() < 0.12;
    if (hit) {
      const damage = Math.round((13 + rng.next() * 12) * (headshot ? 2.5 : 1));
      if (enemy.isPlayer) hooks.onPlayerDamage(damage, bot.group.position);
      else damageBot(enemy, damage, bot);
    } else {
      // A miss still throws a tracer past the target.
      to.x += (rng.next() - 0.5) * 1.6;
      to.y += (rng.next() - 0.5) * 1.2;
      to.z += (rng.next() - 0.5) * 1.6;
    }
    hooks.onBotShot(bot, from, to, hit);
  }

  function damageBot(bot, amount, killer) {
    if (!bot.alive) return;
    bot.health -= amount;
    if (bot.health > 0) return;
    bot.alive = false;
    bot.health = 0;
    bot.fall = 0;
    bot.intent = null;
    if (bot.carryingBomb) {
      bot.carryingBomb = false;
      hooks.onBombDropped(bot.group.position);
    }
    hooks.onKill(killer, bot, false);
  }

  function setPath(bot, waypoints) {
    bot.path = waypoints;
    bot.pathIndex = 0;
  }

  function followPath(bot, dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const [x, z] = bot.path[bot.pathIndex];
    if (moveToward(bot, dt, x, z, bot.speed)) bot.pathIndex += 1;
    return bot.pathIndex >= bot.path.length;
  }

  function think(bot, now) {
    const bomb = hooks.getBomb();
    const enemy = visibleEnemy(bot, now);
    if (enemy) {
      bot.target = enemy;
      bot.lastSeen = now;
      const enemyPos = enemy.isPlayer ? enemy.position : enemy.group.position;
      bot.lastSeenPos.copy(enemyPos);
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactionAt = now + 0.35 + rng.next() * 0.3;
        bot.burstLeft = 0;
        bot.burstTimer = 0.2;
      }
      return;
    }
    if (bot.state === 'engage') {
      // Lost sight: chase the last known position briefly, then give up.
      if (now - bot.lastSeen < 2.5) {
        bot.investigatePos = bot.lastSeenPos;
        bot.alertedAt = now;
        bot.state = 'investigate';
        setPath(bot, findPath(bot.group.position.x, bot.group.position.z, null, [bot.lastSeenPos.x, bot.lastSeenPos.z]));
      } else {
        bot.target = null;
        bot.state = 'route';
        assignRolePath(bot);
      }
      return;
    }
    // Bomb logic outranks the default role.
    if (bot.team === 'wardens' && bot.carryingBomb) {
      if (bomb.siteAt && bomb.siteAt(bot.group.position)) {
        bot.state = 'plant';
        bot.intent = 'plant';
        return;
      }
      bot.intent = null;
      if (bot.state !== 'route' || bot.pathIndex >= bot.path.length) {
        setPath(bot, findPath(bot.group.position.x, bot.group.position.z, bot.siteKey === 'A' ? 'aSite' : 'bSite'));
        bot.state = 'route';
      }
      return;
    }
    if (bot.team === 'wardens' && bomb.status === 'dropped') {
      // The nearest living Warden retrieves the bomb.
      const retriever = bots.filter((b) => b.team === 'wardens' && b.alive)
        .sort((a, b) => a.group.position.distanceToSquared(bomb.position) - b.group.position.distanceToSquared(bomb.position))[0];
      if (retriever === bot) {
        bot.state = 'pickup';
        setPath(bot, findPath(bot.group.position.x, bot.group.position.z, null, [bomb.position.x, bomb.position.z]));
        return;
      }
    }
    if (bot.team === 'raiders' && bomb.status === 'planted') {
      const siteNode = bomb.site === 'A' ? 'aSite' : 'bSite';
      const distance = bot.group.position.distanceTo(bomb.position);
      if (distance < 2.2) {
        bot.state = 'defuse';
        bot.intent = 'defuse';
        return;
      }
      bot.intent = null;
      if (bot.state !== 'retake' || bot.pathIndex >= bot.path.length) {
        setPath(bot, findPath(bot.group.position.x, bot.group.position.z, siteNode));
        bot.state = 'retake';
      }
      return;
    }
    if (bot.investigatePos && now - bot.alertedAt < 6 && bot.state !== 'investigate') {
      bot.state = 'investigate';
      setPath(bot, findPath(bot.group.position.x, bot.group.position.z, null, [bot.investigatePos.x, bot.investigatePos.z]));
      return;
    }
    if (bot.state === 'investigate') {
      if (bot.pathIndex >= bot.path.length) {
        bot.investigatePos = null;
        bot.state = 'route';
        assignRolePath(bot);
      }
      return;
    }
    if (bot.state === 'route' && bot.pathIndex >= bot.path.length) {
      bot.state = 'hold';
      // Roamers pause briefly, then pick a new spot; holders stay put.
      bot.holdUntil = bot.role === 'roam' ? now + 4 + rng.next() * 4 : now + 9999;
    }
    if (bot.state === 'hold' && bot.role === 'roam' && now > bot.holdUntil) {
      bot.holdUntil = now + 6 + rng.next() * 6;
      const spot = rng.pick(['midN', 'midW', 'midE', 'aAppr', 'bAppr']);
      setPath(bot, findPath(bot.group.position.x, bot.group.position.z, spot));
      bot.state = 'route';
    }
  }

  function assignRolePath(bot) {
    if (bot.team === 'wardens') {
      const siteNode = bot.siteKey === 'A' ? 'aSite' : 'bSite';
      // Alternate the lane by round so the push varies: long/short or mid.
      const via = rng.next() < 0.5 ? (bot.siteKey === 'A' ? 'long2' : 'short2') : 'midHall';
      const first = findPath(bot.group.position.x, bot.group.position.z, via);
      const second = findPath(MAP.graph.nodes[via][0], MAP.graph.nodes[via][1], siteNode);
      setPath(bot, first.concat(second.slice(1)));
      bot.state = 'route';
    } else if (bot.role === 'holdA' || bot.role === 'holdB') {
      const node = bot.role === 'holdA' ? 'aHold' : 'bHold';
      setPath(bot, findPath(bot.group.position.x, bot.group.position.z, node));
      bot.state = 'route';
    } else {
      setPath(bot, findPath(bot.group.position.x, bot.group.position.z, 'midN'));
      bot.state = 'route';
    }
  }

  function step(dt, now, live = true) {
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.group.rotation.x = -bot.fall * 1.5;
          bot.group.position.y = -bot.fall * 0.1;
        }
        continue;
      }
      // Between rounds the bots stand down; only the death animation runs.
      if (!live) continue;
      bot.thinkTimer -= dt;
      if (bot.thinkTimer <= 0) {
        bot.thinkTimer = THINK_INTERVAL;
        think(bot, now);
      }

      if (bot.state === 'engage' && bot.target) {
        const targetPos = bot.target.isPlayer ? bot.target.position : bot.target.group.position;
        const targetEye = bot.target.isPlayer ? bot.target.eye : EYE_HEIGHT;
        // Face the target, strafe slowly, and fire in bursts once reacted.
        const dx = targetPos.x - bot.group.position.x;
        const dz = targetPos.z - bot.group.position.z;
        bot.yaw = turnToward(bot.yaw, Math.atan2(-dx, -dz), dt * 10);
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.7 + rng.next() * 0.8;
          bot.strafeDir = rng.next() < 0.5 ? -1 : 1;
        }
        const sideX = -Math.cos(bot.yaw) * bot.strafeDir;
        const sideZ = Math.sin(bot.yaw) * bot.strafeDir;
        const nextX = bot.group.position.x + sideX * 1.4 * dt;
        if (!overlaps(nextX, bot.group.position.z)) bot.group.position.x = nextX;
        const nextZ = bot.group.position.z + sideZ * 1.4 * dt;
        if (!overlaps(bot.group.position.x, nextZ)) bot.group.position.z = nextZ;
        bot.burstTimer -= dt;
        if (now >= bot.reactionAt && bot.burstTimer <= 0) {
          if (bot.burstLeft > 0) {
            bot.burstLeft -= 1;
            bot.burstTimer = 0.12;
            fireAt(bot, bot.target, now);
          } else {
            bot.burstLeft = 3 + Math.floor(rng.next() * 3);
            bot.burstTimer = 0.5 + rng.next() * 0.5;
          }
        }
      } else if (bot.state === 'route' || bot.state === 'investigate' || bot.state === 'retake' || bot.state === 'pickup') {
        const arrived = followPath(bot, dt);
        if (bot.state === 'pickup' && arrived) {
          hooks.onBotPickupBomb(bot);
          bot.state = 'route';
          assignRolePath(bot);
        }
        // Stuck detection: no progress in 1.2 s skips a waypoint.
        if (bot.group.position.distanceToSquared(bot.stuckPos) < 0.09) {
          bot.stuckTimer += dt;
          if (bot.stuckTimer > 1.2) {
            bot.stuckTimer = 0;
            bot.pathIndex += 1;
          }
        } else {
          bot.stuckTimer = 0;
          bot.stuckPos.copy(bot.group.position);
        }
      } else if (bot.state === 'hold') {
        // Scan the approach: slow yaw sweep around the hold direction.
        bot.yaw = bot.holdYaw + Math.sin(now * 0.5 + bot.scanPhase) * 0.7;
      } else if (bot.state === 'plant' || bot.state === 'defuse') {
        // Stand still and work; main.js advances the progress.
        bot.yaw = turnToward(bot.yaw, bot.holdYaw, dt * 6);
      }

      // Separation: bots never stack on each other.
      for (const other of bots) {
        if (other === bot || !other.alive) continue;
        const dx = bot.group.position.x - other.group.position.x;
        const dz = bot.group.position.z - other.group.position.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > 0.0001 && distanceSq < 0.49) {
          const distance = Math.sqrt(distanceSq);
          const push = (0.7 - distance) * 0.5 * dt * 8;
          bot.group.position.x += (dx / distance) * push;
          bot.group.position.z += (dz / distance) * push;
        }
      }

      bot.group.rotation.y = bot.yaw;
      // A simple walk bob while moving.
      const moving = bot.state === 'route' || bot.state === 'investigate' || bot.state === 'retake' || bot.state === 'pickup';
      bot.group.position.y = moving ? Math.abs(Math.sin(now * 9 + bot.index)) * 0.03 : 0;
    }
  }

  return {
    bots,
    hitMeshes,
    step,
    damage(bot, amount, killer) {
      damageBot(bot, amount, killer);
    },
    hear(position, radius, now) {
      for (const bot of bots) {
        if (!bot.alive || bot.state === 'engage') continue;
        if (bot.group.position.distanceTo(position) <= radius) {
          bot.investigatePos = position.clone();
          bot.alertedAt = now;
        }
      }
    },
    reset(round) {
      const wardenSpawns = MAP.spawns.wardens.slice(1);
      const raiderSpawns = MAP.spawns.raiders;
      for (const bot of bots) {
        const spawn = bot.team === 'wardens' ? wardenSpawns[bot.index] : raiderSpawns[bot.index];
        bot.group.position.set(spawn.x, 0, spawn.z);
        bot.group.rotation.set(0, spawn.yaw, 0);
        bot.health = 100;
        bot.alive = true;
        bot.fall = 0;
        bot.yaw = spawn.yaw;
        bot.holdYaw = spawn.yaw;
        bot.target = null;
        bot.intent = null;
        bot.carryingBomb = false;
        bot.investigatePos = null;
        bot.alertedAt = -10;
        bot.burstLeft = 0;
        bot.burstTimer = 0;
        if (bot.team === 'wardens') {
          // Alternate the assigned site each round.
          bot.siteKey = (bot.index + round) % 2 === 0 ? 'A' : 'B';
          bot.role = 'push';
        } else {
          bot.role = bot.index === 0 ? 'holdA' : bot.index === 1 ? 'roam' : 'holdB';
          bot.holdYaw = Math.PI;
        }
        assignRolePath(bot);
      }
    },
    aliveCount(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
  };
}
