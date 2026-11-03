/// <reference lib="webworker" />
import { SceneRunner } from './runner';
import { cleanScene } from './scenes';

/* Draws the scene off the main thread, so scene motion never competes with typing. */

export type SceneMessage =
  | { type: 'start'; canvas: OffscreenCanvas; scene: string; width: number; height: number; moving: boolean }
  | { type: 'resize'; width: number; height: number }
  | { type: 'scene'; scene: string }
  | { type: 'moving'; moving: boolean };

declare const self: DedicatedWorkerGlobalScope;

let runner: SceneRunner | null = null;

self.onmessage = (event: MessageEvent<SceneMessage>) => {
  const message = event.data;
  if (message.type === 'start') {
    runner = new SceneRunner(message.canvas);
    runner.resize(message.width, message.height);
    const scene = cleanScene(message.scene);
    if (scene !== 'none') runner.setScene(scene);
    runner.setMoving(message.moving);
    return;
  }
  if (!runner) return;
  if (message.type === 'resize') runner.resize(message.width, message.height);
  else if (message.type === 'moving') runner.setMoving(message.moving);
  else {
    const scene = cleanScene(message.scene);
    if (scene !== 'none') runner.setScene(scene);
  }
};
