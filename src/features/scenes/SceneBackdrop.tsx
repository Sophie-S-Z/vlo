import { useEffect, useRef, useState } from 'react';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { SCENE_FPS, SceneRunner, type Schedule } from './runner';
import type { SceneMessage, ScenePicture } from './scene.worker';
import { sceneInfo, type SceneId } from './scenes';
import { markSceneSlow, useSceneSlow, watchSceneFrames } from './slowScene';

/*
 * The scene behind the manuscript column (plan Task A8). It stays in view while the text scrolls. Motion
 * runs only while the writer is not typing, the tab shows, the scene is on screen, and Calm mode and
 * reduced motion are off, and the device draws it fast enough. Otherwise the scene is a still picture.
 * When the scene stays still for a while (Calm mode, reduced motion, or a slow device), Vlo shows the
 * scene as an image and hides the canvas. A slow device then paints no canvas and no extra layer under
 * the page, so each key paints sooner.
 */

/** The most device pixels per CSS pixel the scene draws at. The art is soft, so more costs without gain. */
const MAX_SCALE = 1.5;

const frameSchedule: Schedule = (run) => {
  const start = performance.now();
  let id = 0;
  const step = (now: number) => {
    if (now - start >= 1000 / SCENE_FPS - 2) run();
    else id = requestAnimationFrame(step);
  };
  id = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(id);
  };
};

function canUseWorker(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
  );
}

/** True while the writer types: the editor sets `data-typing` on the root element. */
function useTyping(): boolean {
  const [typing, setTyping] = useState(() => document.documentElement.dataset.typing === 'true');
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTyping(root.dataset.typing === 'true');
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-typing'] });
    return () => {
      observer.disconnect();
    };
  }, []);
  return typing;
}

function useTabShown(): boolean {
  const [shown, setShown] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => {
      setShown(!document.hidden);
    };
    document.addEventListener('visibilitychange', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
    };
  }, []);
  return shown;
}

interface Driver {
  scene: (scene: SceneId) => void;
  resize: (width: number, height: number) => void;
  moving: (moving: boolean) => void;
  /** The scene as it stands, as a PNG file, or null when the canvas cannot make one. */
  picture: () => Promise<Blob | null>;
  stop: () => void;
}

function workerDriver(canvas: HTMLCanvasElement, scene: SceneId, onFail: () => void): Driver {
  const offscreen = canvas.transferControlToOffscreen();
  const worker = new Worker(new URL('./scene.worker.ts', import.meta.url), { type: 'module' });
  const pictures = new Map<number, (blob: Blob | null) => void>();
  let lastPicture = 0;
  const endPictures = () => {
    for (const resolve of pictures.values()) resolve(null);
    pictures.clear();
  };
  worker.onerror = () => {
    worker.terminate();
    endPictures();
    onFail();
  };
  worker.onmessage = (event: MessageEvent<ScenePicture>) => {
    const resolve = pictures.get(event.data.id);
    pictures.delete(event.data.id);
    resolve?.(event.data.blob);
  };
  const post = (message: SceneMessage, transfer: Transferable[] = []) => {
    worker.postMessage(message, transfer);
  };
  post({ type: 'start', canvas: offscreen, scene, width: 1, height: 1, moving: false }, [offscreen]);
  // While the scene moves, the page tells the worker after each frame it shows. The message waits for a
  // task after the frame, so keys and other work queued before it run first.
  let frame = 0;
  let task: ReturnType<typeof setTimeout> | undefined;
  const stopShown = () => {
    cancelAnimationFrame(frame);
    clearTimeout(task);
  };
  const tellShown = () => {
    frame = requestAnimationFrame(() => {
      task = setTimeout(() => {
        post({ type: 'shown' });
        tellShown();
      }, 0);
    });
  };
  return {
    scene: (next) => {
      post({ type: 'scene', scene: next });
    },
    resize: (width, height) => {
      post({ type: 'resize', width, height });
    },
    moving: (moving) => {
      stopShown();
      post({ type: 'moving', moving });
      if (moving) tellShown();
    },
    picture: () =>
      new Promise((resolve) => {
        lastPicture += 1;
        pictures.set(lastPicture, resolve);
        post({ type: 'picture', id: lastPicture });
      }),
    stop: () => {
      stopShown();
      worker.terminate();
      endPictures();
    },
  };
}

function mainDriver(canvas: HTMLCanvasElement, scene: SceneId): Driver {
  const runner = new SceneRunner(canvas, frameSchedule);
  runner.setScene(scene);
  return {
    scene: (next) => {
      runner.setScene(next);
    },
    resize: (width, height) => {
      runner.resize(width, height);
    },
    moving: (moving) => {
      runner.setMoving(moving);
    },
    picture: () =>
      new Promise((resolve) => {
        try {
          canvas.toBlob(resolve, 'image/png');
        } catch {
          resolve(null);
        }
      }),
    stop: () => {
      runner.stop();
    },
  };
}

export function SceneBackdrop({ scene }: { scene: SceneId }) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const driver = useRef<Driver | null>(null);
  const [mode, setMode] = useState<'worker' | 'main'>(() => (canUseWorker() ? 'worker' : 'main'));
  const [onScreen, setOnScreen] = useState(true);
  const motion = useMotionAllowed();
  const typing = useTyping();
  const shown = useTabShown();
  const slow = useSceneSlow();
  const moving = motion && shown && onScreen && !typing && !slow;
  // Typing, a hidden tab and a scene off screen stop the motion only for a short time, so they keep the canvas.
  const staysStill = !motion || slow;
  const [picture, setPicture] = useState<{ scene: SceneId; url: string } | null>(null);
  // The latest scene and motion, for a driver that starts after a render. Effects run in order, so this one
  // runs before the driver effect below.
  const latest = useRef({ scene, moving });
  useEffect(() => {
    latest.current = { scene, moving };
  });

  // One driver per canvas. A worker that fails hands the scene to the main thread on a new canvas.
  useEffect(() => {
    const element = canvas.current;
    const box = frame.current;
    if (!element || !box) return;
    let next: Driver;
    try {
      next =
        mode === 'worker'
          ? workerDriver(element, latest.current.scene, () => {
              setMode('main');
            })
          : mainDriver(element, latest.current.scene);
    } catch {
      // The canvas may already belong to the failed worker, so the main thread draws on a new canvas.
      if (mode === 'worker') {
        queueMicrotask(() => {
          setMode('main');
        });
      }
      return;
    }
    driver.current = next;
    const measure = () => {
      const scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
      next.resize(box.clientWidth * scale, box.clientHeight * scale);
    };
    measure();
    next.moving(latest.current.moving);
    const resize = new ResizeObserver(measure);
    resize.observe(box);
    const visible = new IntersectionObserver((entries) => {
      setOnScreen(entries.some((e) => e.isIntersecting));
    });
    visible.observe(box);
    return () => {
      resize.disconnect();
      visible.disconnect();
      next.stop();
      driver.current = null;
    };
  }, [mode]);

  useEffect(() => {
    driver.current?.scene(scene);
  }, [scene]);

  useEffect(() => {
    driver.current?.moving(moving);
  }, [moving]);

  // A scene that stays still shows as an image of its last frame.
  useEffect(() => {
    const current = driver.current;
    if (!staysStill || !current) return;
    let cancelled = false;
    void current.picture().then((blob) => {
      if (cancelled || !blob) return;
      setPicture({ scene, url: URL.createObjectURL(blob) });
    });
    return () => {
      cancelled = true;
    };
  }, [staysStill, scene, mode]);

  // Each image lives until a newer one replaces it or the scene closes.
  useEffect(() => {
    if (!picture) return;
    return () => {
      URL.revokeObjectURL(picture.url);
    };
  }, [picture]);

  // Each time the scene starts to move, Vlo checks that the device keeps up.
  useEffect(() => {
    if (!moving) return;
    return watchSceneFrames(markSceneSlow);
  }, [moving]);

  const showPicture = staysStill && picture !== null && picture.scene === scene;

  return (
    <div
      ref={frame}
      aria-hidden="true"
      className="vlo-scene"
      data-scene={scene}
      data-moving={moving ? 'true' : 'false'}
      data-still={slow ? 'slow' : undefined}
      data-picture={showPicture ? 'true' : undefined}
      style={{
        background: showPicture
          ? `url("${picture.url}") center / cover no-repeat, ${sceneInfo(scene).still}`
          : sceneInfo(scene).still,
      }}
    >
      <canvas key={mode} ref={canvas} className="vlo-scene-canvas" />
    </div>
  );
}
