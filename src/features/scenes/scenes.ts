/*
 * Cozy scenes (plan Task A8, decision 11). A scene is artwork around the page: it sets the backdrop of the
 * manuscript column and, with Task A9, a matching sound mix. The page itself keeps its theme colors.
 */

export type SceneId = 'rain' | 'fireplace' | 'night' | 'forest' | 'snow' | 'ocean';

/** The stored value for no scene. */
export const NO_SCENE = 'none';
export type SceneChoice = SceneId | typeof NO_SCENE;

/** The sound mix that each scene suggests (Task A9). */
export type SceneSound = 'rain' | 'fire' | 'crickets' | 'forest' | 'wind' | 'waves';

export interface SceneInfo {
  id: SceneId;
  label: string;
  /** One line on what the scene shows. */
  hint: string;
  /** A CSS background that stands in for the artwork before it draws, and in the picker. */
  still: string;
  sound: SceneSound;
}

export const SCENES: readonly SceneInfo[] = [
  {
    id: 'rain',
    label: 'Rainy window',
    hint: 'Rain on the glass and city lights beyond it.',
    still:
      'radial-gradient(circle at 24% 62%, rgb(255 190 110 / 0.35) 0 6%, transparent 7%), radial-gradient(circle at 70% 40%, rgb(120 200 210 / 0.3) 0 5%, transparent 6%), linear-gradient(180deg, #1b2333, #2c3a4f 55%, #3b4a5e)',
    sound: 'rain',
  },
  {
    id: 'fireplace',
    label: 'Fireplace',
    hint: 'A long, low fire with embers that drift up.',
    still:
      'linear-gradient(0deg, rgb(255 170 80 / 0.75), rgb(226 87 43 / 0.45) 14%, transparent 34%), linear-gradient(180deg, #1a1210, #2a1a14 66%, #0d0807 70%)',
    sound: 'fire',
  },
  {
    id: 'night',
    label: 'Night sky',
    hint: 'Stars over dark hills, and now and then a shooting star.',
    still:
      'radial-gradient(circle at 88% 16%, #f2ecd8 0 3%, rgb(242 236 216 / 0.15) 6%, transparent 12%), linear-gradient(180deg, #070b1a, #111a3a 60%, #24305a)',
    sound: 'crickets',
  },
  {
    id: 'forest',
    label: 'Forest',
    hint: 'Pines at dusk with fireflies between them.',
    still:
      'radial-gradient(circle at 30% 70%, rgb(220 255 140 / 0.45) 0 1%, transparent 2%), radial-gradient(circle at 64% 58%, rgb(220 255 140 / 0.4) 0 1%, transparent 2%), linear-gradient(180deg, #2f5444, #1d3a2f 55%, #0f1f1a)',
    sound: 'forest',
  },
  {
    id: 'snow',
    label: 'Snowy cabin',
    hint: 'Snow falling on a cabin with a warm window.',
    still:
      'radial-gradient(circle at 86% 70%, #ffcf7a 0 1.5%, rgb(255 207 122 / 0.25) 4%, transparent 8%), linear-gradient(180deg, #1c2a44, #3a4f72 55%, #c5d1e2 78%, #dfe7f2)',
    sound: 'wind',
  },
  {
    id: 'ocean',
    label: 'Ocean at dusk',
    hint: 'A low sun on slow waves.',
    still:
      'radial-gradient(circle at 86% 60%, #ffd9a0 0 5%, rgb(255 217 160 / 0.3) 9%, transparent 16%), linear-gradient(180deg, #2b2350, #6b3f6e 35%, #e0866a 55%, #f6c27a 60%, #3a2c55 61%, #1a1833)',
    sound: 'waves',
  },
];

const byId = new Map(SCENES.map((s) => [s.id, s]));

export function sceneInfo(id: SceneId): SceneInfo {
  const info = byId.get(id);
  if (!info) throw new Error(`Unknown scene ${id}`);
  return info;
}

/** A stored scene value Vlo can show: a scene id or "none". Anything else is "none". */
export function cleanScene(value: unknown): SceneChoice {
  return typeof value === 'string' && byId.has(value as SceneId) ? (value as SceneId) : NO_SCENE;
}
