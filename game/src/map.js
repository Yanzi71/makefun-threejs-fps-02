// FOUNDRY YARD, the map: a 48 x 36 m industrial yard at dusk. The Wardens (the
// player's team) attack from the south spawn; the Raiders defend two bomb sites in
// the north — A "Furnace" in the west, B "Silo" in the east. Three lanes connect
// them: Long (west), Mid (through the furnace hall, two doorways) and Short (east).
// Every entry is data only; world.js turns it into meshes and colliders, bots.js
// pathfinds over the waypoint graph.
//
// Boxes are [width, height, depth, x, y, z, material]. y is the centre height, so a
// box of height h sitting on the floor has y = h / 2.
export const MAP = {
  name: 'Foundry Yard',
  bounds: { minX: -24, maxX: 24, minZ: -18, maxZ: 18 },
  sites: {
    A: { name: 'Furnace', x: -17, z: -11, radius: 4.5 },
    B: { name: 'Silo', x: 17, z: -11, radius: 4.5 },
  },
  spawns: {
    wardens: [
      { x: 0, z: 15.5, yaw: 0 },
      { x: -2.5, z: 15.5, yaw: 0 },
      { x: 2.5, z: 15.5, yaw: 0 },
    ],
    raiders: [
      { x: -14, z: -16, yaw: Math.PI },
      { x: 0, z: -15.5, yaw: Math.PI },
      { x: 13.5, z: -16, yaw: Math.PI },
    ],
  },
  // Waypoint graph for bot pathfinding (BFS in bots.js). Every edge is a straight
  // leg that clears the boxes below; bots walk node to node with AABB collision.
  graph: {
    nodes: {
      wSpawn: [0, 15.5],
      wWest: [-8, 13],
      wEast: [8, 13],
      long1: [-16, 11],
      long2: [-19.5, 3],
      long3: [-18.5, -1],
      long4: [-18, -8],
      short1: [16, 11],
      short2: [19.5, 3],
      short3: [18.5, -1],
      short4: [18, -8],
      mid1: [0, 6],
      midS: [0, 0],
      midHall: [0, -5.5],
      midN: [0, -10],
      midW: [-6, -10.8],
      midE: [6, -10.8],
      aAppr: [-12, -12],
      aSite: [-17, -11],
      aHold: [-14.5, -10.5],
      bAppr: [12, -12],
      bSite: [17, -11],
      bHold: [14.5, -10.5],
      rSpawn: [0, -15.5],
      rWest: [-14, -16],
      rEast: [13.5, -16],
    },
    edges: [
      ['wSpawn', 'wWest'], ['wSpawn', 'wEast'], ['wSpawn', 'mid1'],
      ['wWest', 'long1'], ['long1', 'long2'], ['long2', 'long3'], ['long3', 'long4'],
      ['long4', 'aSite'], ['long4', 'aAppr'],
      ['wEast', 'short1'], ['short1', 'short2'], ['short2', 'short3'], ['short3', 'short4'],
      ['short4', 'bSite'], ['short4', 'bAppr'],
      ['mid1', 'midS'], ['midS', 'midHall'], ['midHall', 'midN'],
      ['midN', 'midW'], ['midN', 'midE'],
      ['midW', 'aAppr'], ['midE', 'bAppr'],
      ['aAppr', 'aSite'], ['aAppr', 'aHold'], ['aHold', 'aSite'],
      ['bAppr', 'bSite'], ['bAppr', 'bHold'], ['bHold', 'bSite'],
      ['rSpawn', 'rWest'], ['rSpawn', 'rEast'], ['rSpawn', 'midN'],
      ['rWest', 'aAppr'], ['rWest', 'aHold'],
      ['rEast', 'bAppr'], ['rEast', 'bHold'],
    ],
  },
  // Defender hold spots: [x, z, yaw]. Yaw PI faces south, toward the attackers.
  holds: {
    siteA: [-14.5, -10.5, Math.PI],
    siteA2: [-19.5, -8.5, Math.PI * 0.75],
    siteB: [14.5, -10.5, Math.PI],
    siteB2: [19.5, -8.5, Math.PI * 1.25],
    mid: [0, -10.5, Math.PI],
  },
  boxes: [
    // Floor and perimeter.
    [48.4, 0.4, 36.4, 0, -0.2, 0, 'canvas'],
    [0.4, 4.2, 36.4, -24.2, 2.1, 0, 'surface'],
    [0.4, 4.2, 36.4, 24.2, 2.1, 0, 'surface'],
    [48.4, 4.2, 0.4, 0, 2.1, -18.2, 'surface'],
    [48.4, 4.2, 0.4, 0, 2.1, 18.2, 'surface'],
    // Furnace hall (mid): a room x -9..9, z -9..-2, with a 4 m doorway in each end.
    [7, 3.4, 0.4, -5.5, 1.7, -2, 'surface'],
    [7, 3.4, 0.4, 5.5, 1.7, -2, 'surface'],
    [7, 3.4, 0.4, -5.5, 1.7, -9, 'surface'],
    [7, 3.4, 0.4, 5.5, 1.7, -9, 'surface'],
    [0.4, 3.4, 7.4, -9, 1.7, -5.5, 'surface'],
    [0.4, 3.4, 7.4, 9, 1.7, -5.5, 'surface'],
    // Site A: the furnace block and its chimney.
    [5, 2.6, 3.6, -18.5, 1.3, -13.5, 'hairline'],
    [1.6, 7, 1.6, -21.5, 3.5, -15, 'surface'],
    [1.6, 2.2, 1.6, -21, 1.1, -15, 'hairline'],
    // Site B: the silo and its hopper.
    [4, 6, 4, 17, 3, -14, 'surface'],
    [2.4, 1.6, 2.4, 20, 0.8, -15.5, 'hairline'],
    // Long (west) lane cover.
    [4.5, 2.4, 2.2, -14, 1.2, 8, 'hairline'],
    [1.6, 1.1, 1.6, -20, 0.55, 6, 'hairline'],
    [1.6, 1.1, 1.6, -20, 0.55, -4, 'hairline'],
    [1.6, 1.1, 1.6, -18, 0.55, 11.5, 'hairline'],
    // Short (east) lane cover.
    [4.5, 2.4, 2.2, 14, 1.2, 8, 'hairline'],
    [1.6, 1.1, 1.6, 20, 0.55, 6, 'hairline'],
    [1.6, 1.1, 1.6, 20, 0.55, -4, 'hairline'],
    [1.6, 1.1, 1.6, 18, 0.55, 11.5, 'hairline'],
    // Mid approach cover.
    [3, 1.1, 0.6, -4, 0.55, 4, 'hairline'],
    [3, 1.1, 0.6, 4, 0.55, 4, 'hairline'],
    [1.2, 1.2, 1.2, 0, 0.6, 10.5, 'hairline'],
    // Site A cover.
    [1.6, 1.1, 1.6, -13.5, 0.55, -10.5, 'hairline'],
    [1.6, 1.1, 1.6, -19.5, 0.55, -8.5, 'hairline'],
    [3, 1.1, 0.6, -11.5, 0.55, -15, 'hairline'],
    // Site B cover.
    [1.6, 1.1, 1.6, 13.5, 0.55, -10.5, 'hairline'],
    [1.6, 1.1, 1.6, 19.5, 0.55, -8.5, 'hairline'],
    [3, 1.1, 0.6, 11.5, 0.55, -15, 'hairline'],
    // Spawn pillars.
    [1, 3.4, 1, -6, 1.7, 12, 'hairline'],
    [1, 3.4, 1, 6, 1.7, 12, 'hairline'],
    [1, 3.4, 1, -6, 1.7, -12, 'hairline'],
    [1, 3.4, 1, 6, 1.7, -12, 'hairline'],
  ],
};
