import { on } from './lifecycle';
import type { Camera } from '../render/camera';

const EDGE = 8;
const SPEED = 900; // CSS px per second at zoom 1

/** Arrow keys, screen-edge scrolling, middle-button drag and wheel zoom (spec §9.2). */
export class CameraInput {
  private keys = new Set<string>();
  private mouse = { x: -1, y: -1, inside: false };
  private drag: { x: number; y: number } | null = null;
  scrollSpeed = 1;
  edgeScroll = true;
  /** Touchpad mode: two-finger scroll pans, pinch (reported as Ctrl + wheel) zooms. */
  touchpad = false;

  constructor(
    private readonly camera: Camera,
    canvas: HTMLElement,
  ) {
    on(window, 'keydown', (e) => {
      if (e.key.startsWith('Arrow')) {
        this.keys.add(e.key);
        e.preventDefault();
      }
    });
    on(window, 'keyup', (e) => this.keys.delete(e.key));
    on(window, 'blur', () => this.keys.clear());
    on(document, 'pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY, inside: true };
      if (this.drag) {
        camera.panScreen(this.drag.x - e.clientX, this.drag.y - e.clientY);
        this.drag = { x: e.clientX, y: e.clientY };
      }
    });
    on(document, 'pointerleave', () => (this.mouse.inside = false));
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 1) {
        this.drag = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    });
    on(window, 'pointerup', (e) => e.button === 1 && (this.drag = null));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.touchpad) camera.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
        else if (e.ctrlKey) camera.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
        else camera.panScreen(e.deltaX * this.scrollSpeed, e.deltaY * this.scrollSpeed);
      },
      { passive: false },
    );
  }

  update(dt: number) {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft')) dx--;
    if (this.keys.has('ArrowRight')) dx++;
    if (this.keys.has('ArrowUp')) dy--;
    if (this.keys.has('ArrowDown')) dy++;
    const { x, y, inside } = this.mouse;
    if (this.edgeScroll && inside && !this.drag && x >= 0) {
      if (x < EDGE) dx--;
      if (x > this.camera.viewW - EDGE) dx++;
      if (y < EDGE) dy--;
      if (y > this.camera.viewH - EDGE) dy++;
    }
    if (dx || dy) this.camera.panScreen(dx * SPEED * this.scrollSpeed * dt, dy * SPEED * this.scrollSpeed * dt);
  }
}
