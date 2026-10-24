/** One pointer for the whole page: every pet reads it and looks from where it sits. */
type Listener = () => void;
export const pointer = { x: -1, y: -1, at: 0 };
const listeners = new Set<Listener>();
let installed = false;

export function onPointer(fn: Listener) {
  if (!installed && typeof window !== 'undefined') {
    installed = true;
    const move = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.at = performance.now();
      listeners.forEach((l) => l());
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
  }
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
