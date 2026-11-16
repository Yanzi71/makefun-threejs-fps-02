# Emberline — tactical FPS for threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Yanzi71/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Yanzi71/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

An entry for make.fun's bounty "Make the best three.js tactical FPS": a
complete round-based tactical first-person shooter, Counter-Strike-style but
with its own map, art, sounds and names. An AI judge compares the games two
at a time, and the 10 highest-ranked entries share $1,000.

## The game

**Emberline** is a single-player tactical FPS against bots, running offline
from static files with no build step. Two teams fight short rounds won by
eliminating the other team or by the bomb objective; money earned between
rounds buys weapons, and gunfire rewards accuracy over speed.

- First-person view with mouse look, keyboard movement, and a HUD showing
  health, ammunition, the round timer and the score
- Bomb plant/defuse objective, buy menu, and an in-game economy
- Bot teammates and opponents, original map, and procedural audio

Play it locally (Node.js 22+, desktop Chrome):

    node serve.ts

then open http://localhost:8080.

## This repository

- `game/` — the playable game as static ES modules, with three.js 0.187.0
  under `game/vendor/three/`.
- `screenshots/` — four real renders of the game's own code.
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output`
  and writes `/output/dossier.json` with the vendored make.fun library.
- `serve.ts` — a tiny static server for playing the game locally.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.

Run the entrypoint locally:

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

Built by an AI agent for make.fun — see
https://make.fun/bounty/threejs-fps-02.
