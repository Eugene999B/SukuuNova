export const ARCADE_PHYSICS_VERSION = "novacore-physics-v1.0.0";

export type Vec2 = { x: number; y: number };
export type PhysicsShape =
  | { kind: "circle"; radius: number }
  | { kind: "box"; halfWidth: number; halfHeight: number };

export type PhysicsBody = {
  id: string;
  kind: "dynamic" | "static";
  shape: PhysicsShape;
  position: Vec2;
  velocity: Vec2;
  force: Vec2;
  mass: number;
  inverseMass: number;
  restitution: number;
  friction: number;
  linearDamping: number;
};

export type PhysicsWorld = {
  gravity: Vec2;
  fixedDeltaSeconds: number;
  maxSubSteps: number;
  solverIterations: number;
  accumulatorSeconds: number;
  simulationSeconds: number;
  droppedSeconds: number;
  bodies: PhysicsBody[];
  algorithmVersion: string;
};

export type PhysicsWorldOptions = {
  gravity?: Vec2;
  fixedDeltaSeconds?: number;
  maxSubSteps?: number;
  solverIterations?: number;
};

export type PhysicsBodyInput = {
  id: string;
  kind?: "dynamic" | "static";
  shape: PhysicsShape;
  position?: Vec2;
  velocity?: Vec2;
  mass?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
};

type Contact = {
  a: PhysicsBody;
  b: PhysicsBody;
  normal: Vec2;
  penetration: number;
};

const EPSILON = 1e-9;
const POSITION_SLOP = 0.0005;
const POSITION_CORRECTION = 0.8;

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function vec(x = 0, y = 0): Vec2 {
  return { x: finite(x), y: finite(y) };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(a: Vec2, factor: number): Vec2 {
  return { x: a.x * factor, y: a.y * factor };
}

function dot(a: Vec2, b: Vec2) {
  return a.x * b.x + a.y * b.y;
}

function lengthSquared(a: Vec2) {
  return dot(a, a);
}

function length(a: Vec2) {
  return Math.sqrt(lengthSquared(a));
}

function normalize(a: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const magnitude = length(a);
  return magnitude > EPSILON ? scale(a, 1 / magnitude) : fallback;
}

function cloneBody(body: PhysicsBody): PhysicsBody {
  return {
    ...body,
    shape: { ...body.shape },
    position: { ...body.position },
    velocity: { ...body.velocity },
    force: { ...body.force },
  };
}

function bodyFromInput(input: PhysicsBodyInput): PhysicsBody {
  if (!input.id.trim()) throw new Error("Physics body id is required.");
  const kind = input.kind ?? "dynamic";
  if (input.shape.kind === "circle" && !(input.shape.radius > 0)) throw new Error("Circle radius must be positive.");
  if (input.shape.kind === "box" && (!(input.shape.halfWidth > 0) || !(input.shape.halfHeight > 0))) throw new Error("Box half extents must be positive.");
  const mass = kind === "static" ? Number.POSITIVE_INFINITY : Math.max(EPSILON, finite(input.mass ?? 1, 1));
  return {
    id: input.id,
    kind,
    shape: { ...input.shape },
    position: vec(input.position?.x, input.position?.y),
    velocity: vec(input.velocity?.x, input.velocity?.y),
    force: vec(),
    mass,
    inverseMass: kind === "static" ? 0 : 1 / mass,
    restitution: clamp(finite(input.restitution ?? 0.2, 0.2), 0, 1),
    friction: clamp(finite(input.friction ?? 0.5, 0.5), 0, 2),
    linearDamping: clamp(finite(input.linearDamping ?? 0, 0), 0, 20),
  };
}

export function createPhysicsWorld(options: PhysicsWorldOptions = {}): PhysicsWorld {
  const fixedDeltaSeconds = clamp(finite(options.fixedDeltaSeconds ?? 1 / 60, 1 / 60), 1 / 240, 1 / 20);
  return {
    gravity: vec(options.gravity?.x, options.gravity?.y ?? 9.81),
    fixedDeltaSeconds,
    maxSubSteps: Math.floor(clamp(finite(options.maxSubSteps ?? 8, 8), 1, 32)),
    solverIterations: Math.floor(clamp(finite(options.solverIterations ?? 6, 6), 1, 20)),
    accumulatorSeconds: 0,
    simulationSeconds: 0,
    droppedSeconds: 0,
    bodies: [],
    algorithmVersion: ARCADE_PHYSICS_VERSION,
  };
}

export function addPhysicsBody(world: PhysicsWorld, input: PhysicsBodyInput) {
  if (world.bodies.some((body) => body.id === input.id)) throw new Error(`Physics body ${input.id} already exists.`);
  const body = bodyFromInput(input);
  world.bodies.push(body);
  world.bodies.sort((a, b) => a.id.localeCompare(b.id));
  return body;
}

export function getPhysicsBody(world: PhysicsWorld, bodyId: string) {
  return world.bodies.find((body) => body.id === bodyId) ?? null;
}

export function applyPhysicsForce(world: PhysicsWorld, bodyId: string, force: Vec2) {
  const body = getPhysicsBody(world, bodyId);
  if (!body) throw new Error(`Physics body ${bodyId} was not found.`);
  if (body.kind === "static") return;
  body.force = add(body.force, vec(force.x, force.y));
}

export function applyPhysicsImpulse(world: PhysicsWorld, bodyId: string, impulse: Vec2) {
  const body = getPhysicsBody(world, bodyId);
  if (!body) throw new Error(`Physics body ${bodyId} was not found.`);
  if (body.kind === "static") return;
  body.velocity = add(body.velocity, scale(vec(impulse.x, impulse.y), body.inverseMass));
}

function circleCircle(a: PhysicsBody, b: PhysicsBody): Contact | null {
  if (a.shape.kind !== "circle" || b.shape.kind !== "circle") return null;
  const delta = subtract(b.position, a.position);
  const radius = a.shape.radius + b.shape.radius;
  const distanceSq = lengthSquared(delta);
  if (distanceSq >= radius * radius) return null;
  const distance = Math.sqrt(distanceSq);
  return {
    a,
    b,
    normal: distance > EPSILON ? scale(delta, 1 / distance) : { x: 1, y: 0 },
    penetration: radius - distance,
  };
}

function boxBox(a: PhysicsBody, b: PhysicsBody): Contact | null {
  if (a.shape.kind !== "box" || b.shape.kind !== "box") return null;
  const dx = b.position.x - a.position.x;
  const overlapX = a.shape.halfWidth + b.shape.halfWidth - Math.abs(dx);
  if (overlapX <= 0) return null;
  const dy = b.position.y - a.position.y;
  const overlapY = a.shape.halfHeight + b.shape.halfHeight - Math.abs(dy);
  if (overlapY <= 0) return null;
  if (overlapX < overlapY) return { a, b, normal: { x: dx < 0 ? -1 : 1, y: 0 }, penetration: overlapX };
  return { a, b, normal: { x: 0, y: dy < 0 ? -1 : 1 }, penetration: overlapY };
}

function circleBox(circle: PhysicsBody, box: PhysicsBody): Contact | null {
  if (circle.shape.kind !== "circle" || box.shape.kind !== "box") return null;
  const relative = subtract(circle.position, box.position);
  const closestLocal = {
    x: clamp(relative.x, -box.shape.halfWidth, box.shape.halfWidth),
    y: clamp(relative.y, -box.shape.halfHeight, box.shape.halfHeight),
  };
  const closest = add(box.position, closestLocal);
  const boxToCircle = subtract(circle.position, closest);
  const distanceSq = lengthSquared(boxToCircle);
  if (distanceSq > circle.shape.radius * circle.shape.radius) return null;

  if (distanceSq > EPSILON) {
    const distance = Math.sqrt(distanceSq);
    const boxToCircleNormal = scale(boxToCircle, 1 / distance);
    return { a: circle, b: box, normal: scale(boxToCircleNormal, -1), penetration: circle.shape.radius - distance };
  }

  const distanceToXFace = box.shape.halfWidth - Math.abs(relative.x);
  const distanceToYFace = box.shape.halfHeight - Math.abs(relative.y);
  if (distanceToXFace < distanceToYFace) {
    const boxToCircleNormal = { x: relative.x < 0 ? -1 : 1, y: 0 };
    return { a: circle, b: box, normal: scale(boxToCircleNormal, -1), penetration: circle.shape.radius + distanceToXFace };
  }
  const boxToCircleNormal = { x: 0, y: relative.y < 0 ? -1 : 1 };
  return { a: circle, b: box, normal: scale(boxToCircleNormal, -1), penetration: circle.shape.radius + distanceToYFace };
}

function detectContact(a: PhysicsBody, b: PhysicsBody): Contact | null {
  if (a.kind === "static" && b.kind === "static") return null;
  if (a.shape.kind === "circle" && b.shape.kind === "circle") return circleCircle(a, b);
  if (a.shape.kind === "box" && b.shape.kind === "box") return boxBox(a, b);
  if (a.shape.kind === "circle" && b.shape.kind === "box") return circleBox(a, b);
  const reversed = circleBox(b, a);
  return reversed ? { a, b, normal: scale(reversed.normal, -1), penetration: reversed.penetration } : null;
}

function resolveContact(contact: Contact) {
  const { a, b, normal } = contact;
  const inverseMassSum = a.inverseMass + b.inverseMass;
  if (inverseMassSum <= EPSILON) return;

  const relativeVelocity = subtract(b.velocity, a.velocity);
  const velocityAlongNormal = dot(relativeVelocity, normal);
  if (velocityAlongNormal < 0) {
    const restitution = Math.min(a.restitution, b.restitution);
    const normalImpulseMagnitude = -(1 + restitution) * velocityAlongNormal / inverseMassSum;
    const normalImpulse = scale(normal, normalImpulseMagnitude);
    if (a.kind === "dynamic") a.velocity = subtract(a.velocity, scale(normalImpulse, a.inverseMass));
    if (b.kind === "dynamic") b.velocity = add(b.velocity, scale(normalImpulse, b.inverseMass));

    const afterNormalRelativeVelocity = subtract(b.velocity, a.velocity);
    const tangentUnnormalized = subtract(afterNormalRelativeVelocity, scale(normal, dot(afterNormalRelativeVelocity, normal)));
    if (lengthSquared(tangentUnnormalized) > EPSILON) {
      const tangent = normalize(tangentUnnormalized);
      let tangentImpulseMagnitude = -dot(afterNormalRelativeVelocity, tangent) / inverseMassSum;
      const friction = Math.sqrt(a.friction * b.friction);
      const maxFrictionImpulse = normalImpulseMagnitude * friction;
      tangentImpulseMagnitude = clamp(tangentImpulseMagnitude, -maxFrictionImpulse, maxFrictionImpulse);
      const tangentImpulse = scale(tangent, tangentImpulseMagnitude);
      if (a.kind === "dynamic") a.velocity = subtract(a.velocity, scale(tangentImpulse, a.inverseMass));
      if (b.kind === "dynamic") b.velocity = add(b.velocity, scale(tangentImpulse, b.inverseMass));
    }
  }

  const correctionMagnitude = Math.max(contact.penetration - POSITION_SLOP, 0) / inverseMassSum * POSITION_CORRECTION;
  const correction = scale(normal, correctionMagnitude);
  if (a.kind === "dynamic") a.position = subtract(a.position, scale(correction, a.inverseMass));
  if (b.kind === "dynamic") b.position = add(b.position, scale(correction, b.inverseMass));
}

function collectContacts(world: PhysicsWorld) {
  const contacts: Contact[] = [];
  for (let i = 0; i < world.bodies.length; i += 1) {
    for (let j = i + 1; j < world.bodies.length; j += 1) {
      const contact = detectContact(world.bodies[i], world.bodies[j]);
      if (contact) contacts.push(contact);
    }
  }
  return contacts;
}

function integrate(body: PhysicsBody, gravity: Vec2, dt: number) {
  if (body.kind === "static") return;
  const acceleration = add(gravity, scale(body.force, body.inverseMass));
  body.velocity = add(body.velocity, scale(acceleration, dt));
  if (body.linearDamping > 0) {
    const dampingFactor = 1 / (1 + body.linearDamping * dt);
    body.velocity = scale(body.velocity, dampingFactor);
  }
  body.position = add(body.position, scale(body.velocity, dt));
}

function fixedStep(world: PhysicsWorld) {
  const dt = world.fixedDeltaSeconds;
  for (const body of world.bodies) integrate(body, world.gravity, dt);
  for (let iteration = 0; iteration < world.solverIterations; iteration += 1) {
    const contacts = collectContacts(world);
    if (!contacts.length) break;
    for (const contact of contacts) resolveContact(contact);
  }
  world.simulationSeconds += dt;
}

export function stepPhysicsWorld(world: PhysicsWorld, frameDeltaSeconds: number) {
  const frameDelta = clamp(finite(frameDeltaSeconds, 0), 0, 0.25);
  world.accumulatorSeconds += frameDelta;
  let subSteps = 0;
  while (world.accumulatorSeconds + EPSILON >= world.fixedDeltaSeconds && subSteps < world.maxSubSteps) {
    fixedStep(world);
    world.accumulatorSeconds -= world.fixedDeltaSeconds;
    if (world.accumulatorSeconds < EPSILON) world.accumulatorSeconds = 0;
    subSteps += 1;
  }
  if (subSteps === world.maxSubSteps && world.accumulatorSeconds >= world.fixedDeltaSeconds) {
    const retained = world.accumulatorSeconds % world.fixedDeltaSeconds;
    world.droppedSeconds += world.accumulatorSeconds - retained;
    world.accumulatorSeconds = retained;
  }
  if (subSteps > 0) for (const body of world.bodies) body.force = vec();
  return {
    subSteps,
    alpha: clamp(world.accumulatorSeconds / world.fixedDeltaSeconds, 0, 1),
    simulationSeconds: world.simulationSeconds,
    droppedSeconds: world.droppedSeconds,
  };
}

function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function physicsSnapshot(world: PhysicsWorld) {
  return world.bodies.map((body) => ({
    id: body.id,
    kind: body.kind,
    position: { x: rounded(body.position.x), y: rounded(body.position.y) },
    velocity: { x: rounded(body.velocity.x), y: rounded(body.velocity.y) },
  }));
}

export type ForceMotionExperimentInput = {
  massKg: number;
  horizontalForceNewtons: number;
  forceDurationSeconds: number;
  totalDurationSeconds: number;
  initialSpeedMps?: number;
  rollingDamping?: number;
};

export function simulateForceMotionExperiment(input: ForceMotionExperimentInput) {
  const massKg = clamp(finite(input.massKg, 1), 0.05, 500);
  const forceDurationSeconds = clamp(finite(input.forceDurationSeconds, 0), 0, 30);
  const totalDurationSeconds = clamp(finite(input.totalDurationSeconds, forceDurationSeconds), forceDurationSeconds, 60);
  const world = createPhysicsWorld({ gravity: { x: 0, y: 0 }, fixedDeltaSeconds: 1 / 120, maxSubSteps: 32, solverIterations: 4 });
  addPhysicsBody(world, {
    id: "cart",
    shape: { kind: "box", halfWidth: 0.5, halfHeight: 0.25 },
    mass: massKg,
    position: { x: 0, y: 0 },
    velocity: { x: finite(input.initialSpeedMps ?? 0), y: 0 },
    restitution: 0,
    friction: 0.6,
    linearDamping: clamp(finite(input.rollingDamping ?? 0, 0), 0, 4),
  });

  const fixed = world.fixedDeltaSeconds;
  const totalSteps = Math.ceil(totalDurationSeconds / fixed);
  for (let step = 0; step < totalSteps; step += 1) {
    if (world.simulationSeconds + EPSILON < forceDurationSeconds) {
      applyPhysicsForce(world, "cart", { x: finite(input.horizontalForceNewtons, 0), y: 0 });
    }
    stepPhysicsWorld(world, fixed);
  }
  const cart = getPhysicsBody(world, "cart");
  if (!cart) throw new Error("Force-motion cart disappeared from the simulation.");
  const kineticEnergyJoules = 0.5 * massKg * cart.velocity.x * cart.velocity.x;
  return {
    algorithmVersion: ARCADE_PHYSICS_VERSION,
    massKg,
    appliedForceNewtons: finite(input.horizontalForceNewtons, 0),
    accelerationWhileForcedMps2: finite(input.horizontalForceNewtons, 0) / massKg,
    elapsedSeconds: rounded(world.simulationSeconds),
    displacementMeters: rounded(cart.position.x),
    finalSpeedMps: rounded(cart.velocity.x),
    kineticEnergyJoules: rounded(kineticEnergyJoules),
  };
}

export function clonePhysicsWorld(world: PhysicsWorld): PhysicsWorld {
  return {
    ...world,
    gravity: { ...world.gravity },
    bodies: world.bodies.map(cloneBody),
  };
}
