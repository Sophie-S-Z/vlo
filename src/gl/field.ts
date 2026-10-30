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
import { createFluid, type Fluid } from "./fluid";
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
  /** Stir ink in the hero with the cursor (desktop only). */
  ink: boolean;
  /** Called when the GPU drops the context; the caller tears down and shows the still art. */
  onLost: () => void;
}

export interface Field {
  /** Draws one frame. `time` is in seconds. */
  render: (time: number, frame: Frame) => void;
  /** Shape progress from 0 to 6, after smoothing. */
  progress: () => number;
  resize: () => void;
  /** Reads the page anchors again after the layout moves. */
  refreshAnchors: () => void;
  pointer: (x: number, y: number) => void;
  setColors: (text: string, accent: string) => void;
  /** Draws this share of the particles, from 0.1 to 1 (Ink lab and the frame-rate guard). */
  setDensity: (share: number) => void;
  setBloom: (intensity: number) => void;
  /** Stops the hero ink simulation for good (frame-rate guard, spec 18.4). */
  stopInk: () => void;
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
  try {
    return buildField(renderer, canvas, options);
  } catch (error) {
    // A partial start must not keep the GPU context alive.
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}

function buildField(
  renderer: WebGLRenderer,
  canvas: HTMLCanvasElement,
  options: FieldOptions,
): Field {
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

  // Hero ink: a full-screen quad behind the glyphs shows the fluid's dye in the accent color.
  let fluid: Fluid | null = options.ink
    ? createFluid(renderer, window.innerWidth, window.innerHeight)
    : null;
  const inkMaterial = new ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDye;
      uniform vec3 uAccent;
      uniform float uAmount;
      varying vec2 vUv;
      void main() {
        float ink = clamp(texture2D(uDye, vUv).r, 0.0, 1.0);
        gl_FragColor = vec4(uAccent, ink * 0.3 * uAmount);
      }`,
    uniforms: {
      uDye: { value: null },
      uAccent: material.uniforms.uAccent!,
      uAmount: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const inkGeometry = new PlaneGeometry(2, 2);
  const inkMesh = new Mesh(inkGeometry, inkMaterial);
  inkMesh.frustumCulled = false;
  inkMesh.renderOrder = -1;
  inkMesh.visible = Boolean(fluid);
  scene.add(inkMesh);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const aberration = new ChromaticAberrationEffect({
    offset: new Vector2(0, 0),
    radialModulation: false,
    modulationOffset: 0.15,
  });
  const bloom = new BloomEffect({ intensity: 0.35, luminanceThreshold: 0.3 });
  composer.addPass(
    new EffectPass(camera, bloom, aberration, new VignetteEffect({ darkness: 0.35 })),
  );

  let progress = 0;
  let lastScroll = window.scrollY;
  let velocity = 0;
  const target = { x: 0, y: 0 };
  let lastTime = 0;
  let anchors = options.anchors();
  let halfHeight = 1;
  let world = -1;

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    fluid?.resize(width, height);
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
      // Ink lives in the hero only; it fades as the wordmark starts to move.
      const inkAmount = fluid ? Math.max(0, 1 - progress * 2) : 0;
      inkMaterial.uniforms.uAmount!.value = inkAmount;
      if (fluid && inkAmount > 0) {
        fluid.step(Math.min(1 / 30, Math.max(0.001, time - lastTime)));
        inkMaterial.uniforms.uDye!.value = fluid.texture();
      }
      lastTime = time;
      composer.render();
    },
    resize,
    refreshAnchors() {
      anchors = options.anchors();
    },
    pointer(x, y) {
      fluid?.stir((x + 1) / 2, (y + 1) / 2, (x - target.x) / 2, (y - target.y) / 2);
      target.x = x;
      target.y = y;
    },
    setColors(text, accent) {
      (material.uniforms.uColor!.value as Color).set(text);
      (material.uniforms.uAccent!.value as Color).set(accent);
    },
    setDensity(share) {
      geometry.instanceCount = Math.max(1, Math.round(count * Math.min(1, Math.max(0.1, share))));
    },
    setBloom(intensity) {
      bloom.intensity = intensity;
    },
    stopInk() {
      fluid?.dispose();
      fluid = null;
      inkMesh.visible = false;
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      composer.dispose();
      fluid?.dispose();
      inkGeometry.dispose();
      inkMaterial.dispose();
      geometry.dispose();
      material.dispose();
      atlas.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
