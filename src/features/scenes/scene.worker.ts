/// <reference lib="webworker" />
import { SCENE_FPS, SceneRunner, type Schedule } from './runner';
import { cleanScene } from './scenes';

/*
 * Draws the scene off the main thread, so scene motion never competes with typing. The page still has to
 * show each frame. Each new frame waits until the page says it showed the last one, so a slow device
 * gets fewer frames and keeps time for keys. Without that wait, the CI WebKit spent every moment
 * showing frames and ran no other work.
 */

export type SceneMessage =
  | { type: 'start'; canvas: OffscreenCanvas; scene: string; width: number; height: number; moving: boolean }
  | { type: 'resize'; width: number; height: number }
  | { type: 'scene'; scene: string }
  | { type: 'moving'; moving: boolean }
  /** The page showed a frame and has had a turn for its other work. */
  | { type: 'shown' };

declare const self: DedicatedWorkerGlobalScope;

let runner: SceneRunner | null = null;
let shown = true;
let waiting: (() => void) | null = null;

/** The next frame comes after the frame time and after the page showed the last frame. */
const pagedSchedule: Schedule = (run) => {
  let cancelled = false;
  const go = () => {
    if (cancelled) return;
    shown = false;
    run();
  };
  const id = setTimeout(() => {
    if (cancelled) return;
    if (shown) go();
    else waiting = go;
  }, 1000 / SCENE_FPS);
  return () => {
    cancelled = true;
    clearTimeout(id);
    waiting = null;
  };
};

self.onmessage = (event: MessageEvent<SceneMessage>) => {
  const message = event.data;
  if (message.type === 'shown') {
    shown = true;
    const next = waiting;
    waiting = null;
    next?.();
    return;
  }
  if (message.type === 'start') {
    runner = new SceneRunner(message.canvas, pagedSchedule);
    runner.resize(message.width, message.height);
    const scene = cleanScene(message.scene);
    if (scene !== 'none') runner.setScene(scene);
    runner.setMoving(message.moving);
    return;
  }
  if (!runner) return;
  if (message.type === 'resize') runner.resize(message.width, message.height);
  else if (message.type === 'moving') {
    if (message.moving) shown = true;
    runner.setMoving(message.moving);
  } else {
    const scene = cleanScene(message.scene);
    if (scene !== 'none') runner.setScene(scene);
  }
};
