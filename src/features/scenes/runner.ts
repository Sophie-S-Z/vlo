import { createArt, STILL_TIME, type SceneArt } from './art';
import type { SceneId } from './scenes';

/*
 * Runs one scene on one canvas, in the scene worker or on the main thread. Motion runs at 30 frames a
 * second, only while the page allows it. Scene time stops while motion stops, so the scene picks up where
 * it left off.
 */

/** Frames a second for scene motion. */
export const SCENE_FPS = 30;

export type SceneCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Schedules `run` for the next frame and returns a function that cancels it. */
export type Schedule = (run: () => void) => () => void;

export const timerSchedule: Schedule = (run) => {
  const id = setTimeout(run, 1000 / SCENE_FPS);
  return () => {
    clearTimeout(id);
  };
};

export class SceneRunner {
  private art: SceneArt | null = null;
  private scene: SceneId | null = null;
  private moving = false;
  private width = 1;
  private height = 1;
  /** Scene time in seconds, which advances only while the scene moves. */
  private time = STILL_TIME;
  private last = 0;
  private cancel: (() => void) | null = null;

  constructor(
    private readonly canvas: SceneCanvas,
    private readonly schedule: Schedule = timerSchedule,
    private readonly now: () => number = () => performance.now(),
  ) {}

  setScene(scene: SceneId): void {
    if (scene === this.scene) return;
    this.scene = scene;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.art = createArt(scene, ctx);
    this.art.resize(this.width, this.height);
    this.paint();
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.art?.resize(w, h);
    this.paint();
  }

  setMoving(moving: boolean): void {
    if (moving === this.moving) return;
    this.moving = moving;
    if (moving) {
      this.last = this.now();
      this.loop();
    } else {
      this.cancel?.();
      this.cancel = null;
    }
  }

  stop(): void {
    this.setMoving(false);
    this.art = null;
  }

  private loop(): void {
    this.cancel = this.schedule(() => {
      if (!this.moving) return;
      const now = this.now();
      // A long gap, such as a slow frame, counts as one frame, so nothing jumps.
      this.time += Math.min((now - this.last) / 1000, 0.1);
      this.last = now;
      this.paint();
      this.loop();
    });
  }

  private paint(): void {
    this.art?.draw(this.time);
  }
}
