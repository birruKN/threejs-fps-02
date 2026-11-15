// Input: pointer lock, keyboard, mouse. Keeps one small state object; the
// simulation reads it, the renderer never touches it directly.
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    firing: false,
    lookX: 0,
    lookY: 0,
    wheel: 0,
    locked: false,
  };
  const pressed = new Set();
  let onKey = null;

  function requestLock() {
    // requestPointerLock returns a promise in newer Chrome; a denied lock
    // (e.g. no user gesture yet) must not surface as an uncaught error.
    try {
      const result = canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Older browsers throw synchronously; the lock simply stays off.
    }
  }

  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(state.locked);
    if (!state.locked) state.firing = false;
  });

  document.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });

  document.addEventListener('mousedown', (event) => {
    if (!state.locked || event.button !== 0) return;
    state.firing = true;
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });

  document.addEventListener('wheel', (event) => {
    if (state.locked) state.wheel += Math.sign(event.deltaY);
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    state.keys.add(event.code);
    pressed.add(event.code);
    if (onKey) onKey(event.code);
  });

  document.addEventListener('keyup', (event) => {
    state.keys.delete(event.code);
  });

  window.addEventListener('blur', () => {
    state.keys.clear();
    state.firing = false;
  });

  return {
    state,
    requestLock,
    setKeyHandler(handler) { onKey = handler; },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    takeWheel() {
      const w = state.wheel;
      state.wheel = 0;
      return w;
    },
    // Discrete presses consumed once per frame (buy keys, grenade, interact).
    takePressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    clearPressed() { pressed.clear(); },
  };
}
