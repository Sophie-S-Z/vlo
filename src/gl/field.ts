import {
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  VignetteEffect,
} from "postprocessing";
import { ATLAS_COLUMNS, drawGlyphAtlas, drawWordmarkMask, GLYPHS } from "./canvas2d";
import { progressAt, type Anchor } from "./progress";
import { createRandom } from "./random";
import { particleFragment, particleVertex } from "./shaders";
import { sampleShapes } from "./shapes";

/** Where the current shape sits on screen, in CSS pixels. */
export interface Frame {
  x: number;
  y: number;
  size: number;
}

export interface FieldOptions {
  /** 12,000 on desktop, 3,000 on phones (spec 18.2). */
  count: number;
  /** Document anchors that map scroll position to shape progress. */
  anchors: () => Anchor[];
  /** Called when the GPU drops the context; the caller tears down and shows the still art. */
  onLost: () => void;
}

export interface Field {
  /** Draws one frame. `time` is in seconds. */
  render: (time: number, frame: Frame) => void;
  /** Shape progress from 0 to 6, after smoothing. */
  progress: () => number;
  resize: () => void;
  pointer: (x: number, y: number) => void;
  setColors: (text: string, accent: string) => void;
  dispose: () => void;
}

const MAX_DPR = 1.5;
const FOV = 35;
const CAMERA_Z = 4;

/** The persistent landing canvas with the glyph particle field (spec 18.1 item 7, 18.2). */
export function createField(canvas: HTMLCanvasElement, options: FieldOptions): Field {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 20);
  camera.position.z = CAMERA_Z;

  const font = '"JetBrains Mono", ui-monospace, monospace';
  const atlas = new CanvasTexture(drawGlyphAtlas(font));
  atlas.minFilter = LinearFilter;
  atlas.generateMipmaps = false;

  const { count } = options;
  const shapes = sampleShapes({
    count,
    seed: 11,
    wordmark: drawWordmarkMask('"Fraunces Variable", Georgia, serif'),
  });
  const geometry = new InstancedBufferGeometry();
  geometry.copy(new PlaneGeometry(1, 1) as unknown as InstancedBufferGeometry);
  geometry.instanceCount = count;
  shapes.forEach((points, i) => {
    geometry.setAttribute(`aShape${i}`, new InstancedBufferAttribute(points, 3));
  });
  const random = createRandom(29);
  const glyph = new Float32Array(count);
  const delay = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    glyph[i] = Math.floor(random() * GLYPHS.length);
    delay[i] = random();
    seed[i] = random();
  }
  geometry.setAttribute("aGlyph", new InstancedBufferAttribute(glyph, 1));
  geometry.setAttribute("aDelay", new InstancedBufferAttribute(delay, 1));
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(seed, 1));

  const material = new ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 0.03 },
      uWorld: { value: 1 },
      uOffset: { value: new Vector3() },
      uColumns: { value: ATLAS_COLUMNS },
      uRows: { value: Math.ceil(GLYPHS.length / ATLAS_COLUMNS) },
      uAtlas: { value: atlas },
      uColor: { value: new Color() },
      uAccent: { value: new Color() },
      uOpacity: { value: 0.4 },
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const aberration = new ChromaticAberrationEffect({
    offset: new Vector2(0, 0),
    radialModulation: false,
    modulationOffset: 0.15,
  });
  composer.addPass(
    new EffectPass(
      camera,
      new BloomEffect({ intensity: 0.35, luminanceThreshold: 0.3 }),
      aberration,
      new VignetteEffect({ darkness: 0.35 }),
    ),
  );

  let progress = 0;
  let lastScroll = window.scrollY;
  let velocity = 0;
  const target = { x: 0, y: 0 };
  let anchors = options.anchors();
  let halfHeight = 1;
  let world = -1;

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    halfHeight = CAMERA_Z * Math.tan((FOV * Math.PI) / 360);
    const half = Math.min(halfHeight, halfHeight * camera.aspect);
    material.uniforms.uSize!.value = Math.max(0.02, half * 0.024);
    anchors = options.anchors();
  };
  resize();

  const onLost = (event: Event) => {
    event.preventDefault();
    options.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  return {
    progress: () => progress,
    render(time, frame) {
      // Move and scale the shape toward its frame on screen (world units per CSS pixel: k).
      const k = (2 * halfHeight) / window.innerHeight;
      const offset = material.uniforms.uOffset!.value as Vector3;
      const goalX = (frame.x - window.innerWidth / 2) * k;
      const goalY = -(frame.y - window.innerHeight / 2) * k;
      const goalWorld = (frame.size / 2) * k;
      const ease = world < 0 ? 1 : 0.08;
      offset.x += (goalX - offset.x) * ease;
      offset.y += (goalY - offset.y) * ease;
      world = world < 0 ? goalWorld : world + (goalWorld - world) * ease;
      material.uniforms.uWorld!.value = world;

      const scroll = window.scrollY;
      velocity += (scroll - lastScroll - velocity) * 0.2;
      lastScroll = scroll;
      const goal = progressAt(scroll + window.innerHeight * 0.5, anchors);
      progress += (goal - progress) * 0.08;
      material.uniforms.uProgress!.value = progress;
      material.uniforms.uTime!.value = time;
      const shift = Math.max(-0.001, Math.min(0.001, velocity * 0.00002));
      aberration.offset.set(shift, shift * 0.5);
      camera.position.x += (target.x * 0.25 - camera.position.x) * 0.05;
      camera.position.y += (target.y * 0.15 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);
      composer.render();
    },
    resize,
    pointer(x, y) {
      target.x = x;
      target.y = y;
    },
    setColors(text, accent) {
      (material.uniforms.uColor!.value as Color).set(text);
      (material.uniforms.uAccent!.value as Color).set(accent);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      composer.dispose();
      geometry.dispose();
      material.dispose();
      atlas.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
