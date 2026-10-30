/*
 * Hero ink fluid (spec 18.3 p.01). A compact stable-fluids solver after Jos Stam, following
 * the pass structure of Pavel Dobryakov's WebGL-Fluid-Simulation (MIT License,
 * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation): advect, splat, divergence,
 * pressure (Jacobi), gradient subtract. Notice in THIRD_PARTY_NOTICES.md.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";

const SIM_SCALE = 0.25;
const PRESSURE_STEPS = 12;

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const passes = {
  advect: /* glsl */ `
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 uTexel;
    uniform float uDt;
    uniform float uDissipation;
    varying vec2 vUv;
    void main() {
      vec2 back = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
      gl_FragColor = texture2D(uSource, back) / (1.0 + uDissipation * uDt);
    }`,
  splat: /* glsl */ `
    uniform sampler2D uTarget;
    uniform vec2 uPoint;
    uniform vec3 uValue;
    uniform float uRadius;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - uPoint;
      d.x *= uAspect;
      vec3 splat = exp(-dot(d, d) / uRadius) * uValue;
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
    }`,
  divergence: /* glsl */ `
    uniform sampler2D uVelocity;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float l = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
      float r = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
      float b = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
      float t = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
      gl_FragColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
    }`,
  pressure: /* glsl */ `
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
      float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
      float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
      float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
      float div = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((l + r + b + t - div) * 0.25, 0.0, 0.0, 1.0);
    }`,
  gradient: /* glsl */ `
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      float l = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
      float r = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
      float b = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
      float t = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
      vec2 v = texture2D(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
      gl_FragColor = vec4(v, 0.0, 1.0);
    }`,
  clear: /* glsl */ `
    uniform sampler2D uSource;
    uniform float uKeep;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(uSource, vUv) * uKeep; }`,
};

type PassName = keyof typeof passes;

function target(width: number, height: number) {
  return new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  });
}

/** A ping-pong pair of render targets. */
function pair(width: number, height: number) {
  let read = target(width, height);
  let write = target(width, height);
  return {
    get read() {
      return read;
    },
    get write() {
      return write;
    },
    swap() {
      [read, write] = [write, read];
    },
    dispose() {
      read.dispose();
      write.dispose();
    },
  };
}

export interface Fluid {
  /** The dye texture: red channel holds ink density. */
  texture: () => Texture;
  /** Pointer position in 0..1 (y up) and its movement since the last call. */
  stir: (x: number, y: number, dx: number, dy: number) => void;
  step: (dt: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createFluid(renderer: WebGLRenderer, width: number, height: number): Fluid {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new Mesh(geometry);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const materials = Object.fromEntries(
    (Object.keys(passes) as PassName[]).map((name) => [
      name,
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: passes[name],
        uniforms: {
          uVelocity: { value: null },
          uSource: { value: null },
          uTarget: { value: null },
          uPressure: { value: null },
          uDivergence: { value: null },
          uTexel: { value: new Vector2() },
          uDt: { value: 0 },
          uDissipation: { value: 0 },
          uPoint: { value: new Vector2() },
          uValue: { value: [0, 0, 0] },
          uRadius: { value: 0.0005 },
          uAspect: { value: 1 },
          uKeep: { value: 0.8 },
        },
        depthTest: false,
        depthWrite: false,
      }),
    ]),
  ) as Record<PassName, ShaderMaterial>;

  let size = new Vector2();
  let velocity = pair(1, 1);
  let dye = pair(1, 1);
  let pressure = pair(1, 1);
  let divergence = target(1, 1);
  const stirs: [number, number, number, number][] = [];

  const run = (
    name: PassName,
    out: WebGLRenderTarget,
    set: (u: ShaderMaterial["uniforms"]) => void,
  ) => {
    const material = materials[name];
    (material.uniforms.uTexel!.value as Vector2).set(1 / size.x, 1 / size.y);
    set(material.uniforms);
    mesh.material = material;
    renderer.setRenderTarget(out);
    renderer.render(scene, camera);
  };

  const resize = (w: number, h: number) => {
    size = new Vector2(
      Math.max(8, Math.round(w * SIM_SCALE)),
      Math.max(8, Math.round(h * SIM_SCALE)),
    );
    for (const p of [velocity, dye, pressure]) p.dispose();
    divergence.dispose();
    velocity = pair(size.x, size.y);
    dye = pair(size.x, size.y);
    pressure = pair(size.x, size.y);
    divergence = target(size.x, size.y);
  };
  resize(width, height);

  return {
    texture: () => dye.read.texture,
    stir(x, y, dx, dy) {
      if (stirs.length < 8) stirs.push([x, y, dx, dy]);
    },
    step(dt) {
      const previous = renderer.getRenderTarget();
      const aspect = size.x / size.y;
      for (const [x, y, dx, dy] of stirs.splice(0)) {
        run("splat", velocity.write, (u) => {
          u.uTarget!.value = velocity.read.texture;
          (u.uPoint!.value as Vector2).set(x, y);
          u.uValue!.value = [dx * 6000, dy * 6000, 0];
          u.uAspect!.value = aspect;
        });
        velocity.swap();
        run("splat", dye.write, (u) => {
          u.uTarget!.value = dye.read.texture;
          (u.uPoint!.value as Vector2).set(x, y);
          u.uValue!.value = [Math.min(1, Math.hypot(dx, dy) * 25), 0, 0];
          u.uAspect!.value = aspect;
        });
        dye.swap();
      }
      run("divergence", divergence, (u) => {
        u.uVelocity!.value = velocity.read.texture;
      });
      run("clear", pressure.write, (u) => {
        u.uSource!.value = pressure.read.texture;
      });
      pressure.swap();
      for (let i = 0; i < PRESSURE_STEPS; i++) {
        run("pressure", pressure.write, (u) => {
          u.uPressure!.value = pressure.read.texture;
          u.uDivergence!.value = divergence.texture;
        });
        pressure.swap();
      }
      run("gradient", velocity.write, (u) => {
        u.uPressure!.value = pressure.read.texture;
        u.uVelocity!.value = velocity.read.texture;
      });
      velocity.swap();
      run("advect", velocity.write, (u) => {
        u.uVelocity!.value = velocity.read.texture;
        u.uSource!.value = velocity.read.texture;
        u.uDt!.value = dt;
        u.uDissipation!.value = 0.4;
      });
      velocity.swap();
      run("advect", dye.write, (u) => {
        u.uVelocity!.value = velocity.read.texture;
        u.uSource!.value = dye.read.texture;
        u.uDt!.value = dt;
        u.uDissipation!.value = 0.9;
      });
      dye.swap();
      renderer.setRenderTarget(previous);
    },
    resize,
    dispose() {
      for (const p of [velocity, dye, pressure]) p.dispose();
      divergence.dispose();
      geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
