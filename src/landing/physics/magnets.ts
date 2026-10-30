import { Bodies, Body, Composite, Constraint, Engine, Vector } from "matter-js";

const WALL = 100;
/** Longer frames are capped, so a slow frame never tunnels tiles through the walls. */
const MAX_STEP_MS = 1000 / 30;

export interface Magnets {
  /** Advances the world by the frame time (capped) and moves the tiles. */
  step: (deltaMs: number) => void;
  /** Tilts gravity sideways a little, from -1 to 1. */
  tilt: (amount: number) => void;
  dispose: () => void;
}

/**
 * Tiles under Matter.js: the word tiles (spec 18.3 p.04) and the 404 letters. Each tile starts where the page laid it out and
 * moves by transform only, so React keeps its nodes. Pointer drag pulls a tile with a spring,
 * and the release keeps its speed, so a quick drag throws it.
 */
export function createMagnets(box: HTMLElement, tiles: HTMLElement[]): Magnets {
  const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
  const origin = box.getBoundingClientRect();
  const bodies = tiles.map((tile) => {
    const r = tile.getBoundingClientRect();
    const body = Bodies.rectangle(
      r.left - origin.left + r.width / 2,
      r.top - origin.top + r.height / 2,
      r.width,
      r.height,
      { friction: 0.3, frictionAir: 0.02, restitution: 0.2, chamfer: { radius: 2 } },
    );
    return { tile, body, home: { x: body.position.x, y: body.position.y } };
  });
  const walls = [0, 1, 2, 3].map(() => Bodies.rectangle(0, 0, 1, 1, { isStatic: true }));
  const placeWalls = () => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    const shapes: [x: number, y: number, width: number, height: number][] = [
      [w / 2, h + WALL / 2, w + WALL * 2, WALL],
      [w / 2, -WALL / 2, w + WALL * 2, WALL],
      [-WALL / 2, h / 2, WALL, h + WALL * 2],
      [w + WALL / 2, h / 2, WALL, h + WALL * 2],
    ];
    walls.forEach((wall, i) => {
      const [x, y, width, height] = shapes[i]!;
      const scale = {
        x: width / (wall.bounds.max.x - wall.bounds.min.x),
        y: height / (wall.bounds.max.y - wall.bounds.min.y),
      };
      Body.scale(wall, scale.x, scale.y);
      Body.setPosition(wall, { x, y });
      // Body.scale resets the mass; walls must stay immovable.
      Body.setStatic(wall, true);
    });
  };
  placeWalls();
  Composite.add(engine.world, [...walls, ...bodies.map((b) => b.body)]);

  let grab: { constraint: Constraint; pointer: number } | null = null;
  const local = (event: PointerEvent) => {
    const r = box.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };
  const onDown = (event: PointerEvent) => {
    const entry = bodies.find((b) => b.tile.contains(event.target as Node));
    if (!entry || grab) return;
    const point = local(event);
    const constraint = Constraint.create({
      pointA: point,
      bodyB: entry.body,
      pointB: Vector.sub(point, entry.body.position),
      stiffness: 0.2,
      damping: 0.1,
      length: 0,
    });
    Composite.add(engine.world, constraint);
    grab = { constraint, pointer: event.pointerId };
    box.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onMove = (event: PointerEvent) => {
    if (grab?.pointer === event.pointerId) grab.constraint.pointA = local(event);
  };
  const onUp = (event: PointerEvent) => {
    if (grab?.pointer !== event.pointerId) return;
    Composite.remove(engine.world, grab.constraint);
    grab = null;
  };
  box.addEventListener("pointerdown", onDown);
  box.addEventListener("pointermove", onMove);
  box.addEventListener("pointerup", onUp);
  box.addEventListener("pointercancel", onUp);
  box.addEventListener("lostpointercapture", onUp);

  return {
    step(deltaMs) {
      Engine.update(engine, Math.min(MAX_STEP_MS, Math.max(1, deltaMs)));
      for (const { tile, body, home } of bodies) {
        const x = body.position.x - home.x;
        const y = body.position.y - home.y;
        tile.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${body.angle.toFixed(3)}rad)`;
      }
    },
    tilt(amount) {
      engine.gravity.x = Math.max(-1, Math.min(1, amount)) * 0.35;
    },
    dispose() {
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onUp);
      box.removeEventListener("lostpointercapture", onUp);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
      for (const { tile } of bodies) tile.style.removeProperty("transform");
    },
  };
}
