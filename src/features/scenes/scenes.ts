import fireplacePhoto from '@/assets/backdrops/scene-fireplace.webp';
import fireplaceThumb from '@/assets/backdrops/scene-fireplace-thumb.webp';
import forestPhoto from '@/assets/backdrops/scene-forest.webp';
import forestThumb from '@/assets/backdrops/scene-forest-thumb.webp';
import nightPhoto from '@/assets/backdrops/scene-night.webp';
import nightThumb from '@/assets/backdrops/scene-night-thumb.webp';
import oceanPhoto from '@/assets/backdrops/scene-ocean.webp';
import oceanThumb from '@/assets/backdrops/scene-ocean-thumb.webp';
import rainPhoto from '@/assets/backdrops/scene-rain.webp';
import rainThumb from '@/assets/backdrops/scene-rain-thumb.webp';
import snowPhoto from '@/assets/backdrops/scene-snow.webp';
import snowThumb from '@/assets/backdrops/scene-snow-thumb.webp';

/*
 * Cozy scenes (plan Task A8, decision 11). A scene is a photograph around the page, with quiet motion drawn
 * over it (art.ts), and with Task A9, a matching sound mix. The page itself keeps its theme colors. The
 * browser fetches a photograph only when its scene shows (docs/licenses.md names each photographer).
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
  /** The photograph around the page. */
  photo: string;
  /** A small copy of the photograph, for the picker. */
  thumb: string;
  /** The photograph's average color, shown until the photograph arrives. */
  tone: string;
  sound: SceneSound;
}

export const SCENES: readonly SceneInfo[] = [
  {
    id: 'rain',
    label: 'Rainy window',
    hint: 'Rain on the glass and city lights beyond it.',
    photo: rainPhoto,
    thumb: rainThumb,
    tone: '#2e2418',
    sound: 'rain',
  },
  {
    id: 'fireplace',
    label: 'Fireplace',
    hint: 'Flames in the dark, with sparks that drift up.',
    photo: fireplacePhoto,
    thumb: fireplaceThumb,
    tone: '#45210e',
    sound: 'fire',
  },
  {
    id: 'night',
    label: 'Night sky',
    hint: 'The Milky Way between dark trees, and now and then a shooting star.',
    photo: nightPhoto,
    thumb: nightThumb,
    tone: '#353339',
    sound: 'crickets',
  },
  {
    id: 'forest',
    label: 'Forest',
    hint: 'A misty wood at dusk, with fireflies.',
    photo: forestPhoto,
    thumb: forestThumb,
    tone: '#5d6151',
    sound: 'forest',
  },
  {
    id: 'snow',
    label: 'Snowy cabin',
    hint: 'Snow falling past the window onto a cabin.',
    photo: snowPhoto,
    thumb: snowThumb,
    tone: '#467196',
    sound: 'wind',
  },
  {
    id: 'ocean',
    label: 'Ocean at dusk',
    hint: 'A low sun on the waves, and palms at the shore.',
    photo: oceanPhoto,
    thumb: oceanThumb,
    tone: '#443e37',
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
