/**
 * The ramp jump arc.
 *
 * A jump is one number — how long ago the car left the ramp — and everything else is a
 * pure function of it. That is deliberate: the arc has no clock, no randomness and no
 * Phaser in it, so a seeded replay jumps identically and a spec can prove the clearance
 * window without running a scene.
 *
 * Airborne has one gameplay meaning: ground contact is skipped. Shells and the act boss are
 * deliberately *not* part of this module — an airborne car is above the road, not out of
 * the fight.
 */

/** A jump in progress: elapsed time and the duration it was started with, both ms. */
export interface JumpState {
  readonly elapsedMs: number;
  readonly durationMs: number;
}

/** How an advance step ended. */
export interface JumpStep {
  readonly state: JumpState;
  /** True on the single step that crosses the end of the arc. */
  readonly landed: boolean;
}

export function createJump(durationMs: number): JumpState {
  return { elapsedMs: 0, durationMs: Math.max(1, Math.round(durationMs)) };
}

/** Advance the arc by `dtMs`; reports the landing exactly once. */
export function advanceJump(state: JumpState, dtMs: number): JumpStep {
  if (state.elapsedMs >= state.durationMs) return { state, landed: false };

  const elapsedMs = Math.min(state.durationMs, state.elapsedMs + Math.max(0, dtMs));
  return {
    state: { ...state, elapsedMs },
    landed: elapsedMs >= state.durationMs,
  };
}

/** True while the car is off the ground. */
export function isAirborne(state: JumpState | null): boolean {
  return state !== null && state.elapsedMs < state.durationMs;
}

/**
 * Height above the road, px.
 *
 * A half sine: zero at take-off, `apexPx` at the midpoint, zero on landing. Not a physics
 * parabola because nothing reads gravity — the shape only has to read as a hop, and the
 * sine keeps take-off and landing smooth.
 */
export function jumpHeight(state: JumpState | null, apexPx: number): number {
  if (state === null || state.elapsedMs >= state.durationMs) return 0;
  const progress = state.elapsedMs / state.durationMs;
  return Math.max(0, Math.sin(Math.PI * progress) * apexPx);
}

/**
 * True when ground contact (props, traffic, hostile cars) may touch the car.
 *
 * The one rule the jump exists for. Bullets and the boss do not go through here on
 * purpose: a jump clears the road, it does not leave the fight.
 */
export function resolvesGroundContact(airborne: boolean): boolean {
  return !airborne;
}
