import type Matter from 'matter-js';
import type { MatterModule } from './physicsRuntime';
import {
  ACCEL_TO_FORCE, AREAL_DENSITY, DROP_FRAME, FLOOR_Y, GRAVITY_SCALE, GRAVITY_Y, HOLD_STEPS, SETTLE_LIMIT,
  SLEEP_STEPS, STEP_MS, STEP_S, impulseNs, isMoving, restoreDuration, restorePose, smashKicks, sumKicks,
  uprightAngle, wellAcceleration,
  type BlockSpec, type DropPhase, type DropReadout, type Pose, type Vec,
} from './dropTest';

// DropRig, the matter-js half of the drop test (FIG. 05e). Everything that
// decides an outcome — units, force models, the reset tween — is in
// lib/dropTest.ts; this drives the matter-js module handed to it. It is a module
// of its own so DropTest.tsx can import it beside matter-js, after the rig
// scrolls into view or is first struck, instead of shipping it in the entry
// chunk: nothing here runs before matter-js has loaded.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isDisplaced = (body: Matter.Body, home: Vec): boolean => (
  Math.hypot(body.position.x - home.x, body.position.y - home.y) > 3 || Math.abs(uprightAngle(body.angle)) > 0.05
);

const inBay = (p: Vec): Vec => ({ x: clamp(p.x, 0, DROP_FRAME.w), y: clamp(p.y, 0, FLOOR_Y) });

/**
 * The bounded rig: four static walls, one dynamic body per block, all asleep
 * in their home stacks until something acts on them. Each step is a fixed
 * 1/60 s Engine.update, so the outcome depends only on the sequence of
 * actions, never on frame rate.
 */
export class DropRig {
  /** Refilled in place when a reset rebuilds the rig, so a caller painting by index never holds a stale array. */
  readonly bodies: Matter.Body[] = [];
  private current: Matter.Engine;
  private readonly M: MatterModule;
  private readonly blocks: readonly BlockSpec[];
  private readonly layers: number;
  private well: Vec | null = null;
  private wellPeak = 0;
  private wellCore = 1;
  private holdLeft: number | null = null;
  private wellDv: Vec[] = [];
  private restoreFrom: Pose[] | null = null;
  private restoreAt = 0;
  private steps = 0;
  private actionStep = 0;
  private lastMovingStep = 0;
  private settledAt: number | null = 0;
  private peakImpulse: number | null = null;
  private acted = false;

  constructor(M: MatterModule, blocks: readonly BlockSpec[]) {
    this.M = M;
    this.blocks = blocks;
    this.layers = blocks.reduce((max, block) => Math.max(max, block.layer + 1), 1);
    this.current = this.build();
  }

  get engine(): Matter.Engine { return this.current; }

  /** A fresh engine with every block asleep at home; refills `bodies` in place. */
  private build(): Matter.Engine {
    const { Bodies, Composite, Engine, Sleeping } = this.M;
    const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 });
    engine.gravity.x = 0;
    engine.gravity.y = GRAVITY_Y;
    engine.gravity.scale = GRAVITY_SCALE;
    const { w } = DROP_FRAME;
    const t = 80; // thick enough that nothing tunnels through at the top speed
    const wall = { isStatic: true, friction: 0.6, restitution: 0.1 };
    const walls = [
      Bodies.rectangle(w / 2, FLOOR_Y + t / 2, w + 2 * t, t, { ...wall, friction: 0.8, label: 'floor' }),
      Bodies.rectangle(w / 2, -t / 2, w + 2 * t, t, { ...wall, label: 'ceiling' }),
      Bodies.rectangle(-t / 2, FLOOR_Y / 2, t, FLOOR_Y + 2 * t, { ...wall, label: 'wall-left' }),
      Bodies.rectangle(w + t / 2, FLOOR_Y / 2, t, FLOOR_Y + 2 * t, { ...wall, label: 'wall-right' }),
    ];
    const bodies = this.blocks.map((block) => Bodies.rectangle(block.home.x, block.home.y, block.w, block.h, {
      label: block.id,
      density: AREAL_DENSITY,
      friction: 0.6,
      frictionStatic: 0.9,
      frictionAir: 0.01,
      restitution: 0.1,
      sleepThreshold: SLEEP_STEPS,
    }));
    Composite.add(engine.world, [...walls, ...bodies]);
    bodies.forEach((body) => Sleeping.set(body, true));
    this.bodies.splice(0, this.bodies.length, ...bodies);
    return engine;
  }

  get wellPoint(): Vec | null { return this.well; }

  get idle(): boolean {
    return this.restoreFrom === null && this.well === null && this.bodies.every((body) => body.isSleeping);
  }

  /** Smash at `at`. Returns the number of blocks inside the blast; a miss changes nothing. */
  strike(at: Vec, peakDv: number, radius: number): number {
    this.finishRestore();
    if (this.well) this.release();
    const p = inBay(at);
    const { Body } = this.M;
    // An impulse delivered within one step: F = m·dv / dt².
    const toForce = 1 / (STEP_MS * STEP_MS);
    let hit = 0;
    let peak = 0;
    this.bodies.forEach((body, i) => {
      const { w, h } = this.blocks[i];
      const kicks = smashKicks({ x: body.position.x, y: body.position.y, angle: body.angle, w, h }, p, peakDv, radius);
      if (!kicks.length) return;
      hit += 1;
      for (const kick of kicks) {
        Body.applyForce(body, kick.point, { x: body.mass * kick.dv.x * toForce, y: body.mass * kick.dv.y * toForce });
      }
      const dv = sumKicks(kicks);
      peak = Math.max(peak, impulseNs(body.mass, Math.hypot(dv.x, dv.y)));
    });
    if (!hit) return 0;
    // Wake the whole rig, not just the blocks hit: a sleeping block whose
    // support has been knocked away would otherwise hang in mid-air.
    this.wake();
    this.begin();
    this.peakImpulse = peak;
    return hit;
  }

  /** Switch gravity off and pull every block toward `at`; `steps` makes it a timed pull. */
  hold(at: Vec, peakAccel: number, core: number, steps: number | null = null): number {
    this.finishRestore();
    this.well = inBay(at);
    this.wellPeak = peakAccel;
    this.wellCore = Math.max(1, core);
    this.holdLeft = steps;
    this.wellDv = this.bodies.map(() => ({ x: 0, y: 0 }));
    this.engine.gravity.y = 0;
    this.wake();
    this.begin();
    this.peakImpulse = 0;
    return this.bodies.length;
  }

  move(at: Vec): void {
    if (this.well) this.well = inBay(at);
  }

  /** Gravity back on; the settle clock starts now, since a held well never comes to rest. */
  release(): void {
    if (!this.well) return;
    this.well = null;
    this.holdLeft = null;
    this.engine.gravity.y = GRAVITY_Y;
    // A block parked exactly on the well felt no force and may have dozed off in zero g.
    this.wake();
    this.actionStep = this.steps;
    this.lastMovingStep = this.steps;
    this.settledAt = null;
  }

  /** Carry every block home. Animated over restoreDuration() steps unless `instant`. */
  restore(instant = false): void {
    const { Sleeping } = this.M;
    this.well = null;
    this.holdLeft = null;
    this.engine.gravity.y = GRAVITY_Y;
    this.restoreFrom = this.bodies.map((body) => ({ x: body.position.x, y: body.position.y, angle: body.angle }));
    this.restoreAt = 0;
    // Asleep while carried: nothing integrates, the tween alone places them.
    this.bodies.forEach((body) => Sleeping.set(body, true));
    const anyAway = this.bodies.some((body, i) => isDisplaced(body, this.blocks[i].home));
    if (instant || !anyAway) this.finishRestore();
  }

  step(): void {
    if (this.restoreFrom) {
      this.advanceRestore();
      return;
    }
    const { Body, Engine, Sleeping } = this.M;
    const well = this.well;
    if (well) {
      this.bodies.forEach((body, i) => {
        const a = wellAcceleration(body.position, well, this.wellPeak, this.wellCore);
        Body.applyForce(body, body.position, { x: body.mass * a.x * ACCEL_TO_FORCE, y: body.mass * a.y * ACCEL_TO_FORCE });
        this.wellDv[i].x += a.x * STEP_S;
        this.wellDv[i].y += a.y * STEP_S;
      });
    }
    Engine.update(this.engine, STEP_MS);
    this.steps += 1;

    let moving = false;
    this.bodies.forEach((body, i) => {
      const { x, y } = body.position;
      // Defensive: at extreme settings a block could squeeze through a corner.
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < -20 || x > DROP_FRAME.w + 20 || y < -20 || y > FLOOR_Y + 20) {
        this.placeHome(body, i);
      } else if (isMoving(body)) {
        moving = true;
      }
    });
    if (moving) this.lastMovingStep = this.steps;

    if (this.well) {
      // Impulse the pull has delivered so far, per block: m·∫a dt (u/s → m/s).
      this.peakImpulse = this.bodies.reduce((max, body, i) => (
        Math.max(max, (body.mass * Math.hypot(this.wellDv[i].x, this.wellDv[i].y)) / 100)
      ), 0);
      if (this.holdLeft !== null && --this.holdLeft <= 0) this.release();
      return;
    }
    if (this.settledAt === null) {
      if (this.steps - this.actionStep >= SETTLE_LIMIT) this.bodies.forEach((body) => Sleeping.set(body, true));
      if (this.bodies.every((body) => body.isSleeping)) this.settledAt = this.steps;
    }
  }

  /**
   * Run until idle — the halted-motion path, which shows the outcome without
   * the animation. A well held without a timer never idles, so it gets one
   * HOLD_STEPS pull and stays held.
   */
  settle(max = SETTLE_LIMIT + SLEEP_STEPS): number {
    const cap = this.well && this.holdLeft === null ? Math.min(max, HOLD_STEPS) : max;
    let n = 0;
    while (!this.idle && n < cap) {
      this.step();
      n += 1;
    }
    return n;
  }

  readout(): DropReadout {
    let moving = 0;
    let displaced = 0;
    this.bodies.forEach((body, i) => {
      if (isMoving(body)) moving += 1;
      if (isDisplaced(body, this.blocks[i].home)) displaced += 1;
    });
    const phase: DropPhase = this.restoreFrom ? 'restoring' : this.well ? 'held' : this.settledAt === null ? 'moving' : 'rest';
    const measuring = this.acted && (phase === 'moving' || phase === 'held');
    return {
      phase,
      moving,
      displaced,
      total: this.bodies.length,
      peakImpulse: this.acted ? this.peakImpulse : null,
      elapsed: measuring ? (this.steps - this.actionStep) * STEP_S : null,
      settle: this.acted && phase === 'rest' ? Math.max(0, this.lastMovingStep - this.actionStep) * STEP_S : null,
    };
  }

  dispose(): void {
    const { Composite, Engine } = this.M;
    Composite.clear(this.current.world, false);
    Engine.clear(this.current);
  }

  private begin(): void {
    this.acted = true;
    this.actionStep = this.steps;
    this.lastMovingStep = this.steps;
    this.settledAt = null;
  }

  private wake(): void {
    const { Sleeping } = this.M;
    this.bodies.forEach((body) => Sleeping.set(body, false));
  }

  private advanceRestore(): void {
    const from = this.restoreFrom;
    if (!from) return;
    const { Body } = this.M;
    this.restoreAt += 1;
    this.bodies.forEach((body, i) => {
      const { home, layer } = this.blocks[i];
      const pose = restorePose(from[i], home, layer, this.restoreAt);
      Body.setPosition(body, pose);
      Body.setAngle(body, pose.angle);
    });
    if (this.restoreAt >= restoreDuration(this.layers)) this.finishRestore();
  }

  private finishRestore(): void {
    if (!this.restoreFrom) return;
    this.restoreFrom = null;
    // Rebuild, never re-pose. Putting the old bodies back at home leaves
    // history in the engine — warm-start impulses on pairs that touch sleeping
    // bodies are never pruned, the broadphase keeps its sorted order, and
    // incremental rotation leaves vertices a hair off a fresh rectangle — and
    // the sim is chaotic, so the next strike landed differently each reset.
    this.dispose();
    this.current = this.build();
    this.acted = false;
    this.peakImpulse = null;
    this.settledAt = this.steps;
  }

  private placeHome(body: Matter.Body, index: number): void {
    const { Body, Sleeping } = this.M;
    Body.setPosition(body, this.blocks[index].home);
    Body.setAngle(body, 0);
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
    Sleeping.set(body, true);
  }
}
