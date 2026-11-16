// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. Besides the held-key set it reports edge presses (keys hit
// since the last read) so buy-menu keys, grenade throws and reloads fire once per
// press, and it tracks the right mouse button for the DMR scope.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, pressed, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    state.firing = false;
    state.aiming = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      // Newer Chrome returns a promise that rejects when lock is unavailable
      // (headless, no gesture); swallow it — the overlay reappears for a retry.
      try {
        const result = canvas.requestPointerLock();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch {
        /* pointer lock unavailable; the overlay covers the retry */
      }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // True once per physical press; the set is cleared every rendered frame.
    wasPressed(code) {
      return pressed.has(code);
    },
    clearPressed() {
      pressed.clear();
    },
  };
}
