import { describe, expect, it } from 'vitest';
import { COLLISION } from '@/config';
import {
  closingSpeed,
  contactBetween,
  contactCost,
  resolveContact,
  type CollisionBox,
  type ContactBody,
} from './collision';

/**
 * The contact maths, proved without a scene.
 *
 * Every one of these is a property the gameplay depends on and that no Playwright run can
 * see: which axis a contact resolves on, whether the two boxes really are parted afterwards,
 * which way each impulse points, and that the same two cars always get the same answer.
 */

const CAR = { halfWidth: 23, halfHeight: 26 } as const;

function box(over: Partial<CollisionBox> = {}): CollisionBox {
  return { x: 100, y: 100, ...CAR, ...over };
}

function body(over: Partial<ContactBody> = {}): ContactBody {
  return { ...box(), vx: 0, vy: 0, pinnedY: false, ...over };
}

/** True when two boxes still touch. */
function touching(a: CollisionBox, b: CollisionBox): boolean {
  return contactBetween(a, b) !== null;
}

describe('contactBetween', () => {
  it('is null when the boxes are apart on either axis', () => {
    expect(contactBetween(box(), box({ x: 100 + 2 * CAR.halfWidth }))).toBeNull();
    expect(contactBetween(box(), box({ y: 100 + 2 * CAR.halfHeight }))).toBeNull();
  });

  it('is null when the boxes exactly touch', () => {
    expect(contactBetween(box(), box({ x: 100 + 2 * CAR.halfWidth }))).toBeNull();
  });

  it('resolves a lane scrape on x, with the depth of the smaller overlap', () => {
    const contact = contactBetween(box(), box({ x: 140 }));

    expect(contact?.axis).toBe('x');
    expect(contact?.depth).toBe(6);
    expect(contact?.ny).toBe(0);
  });

  it('resolves a rear-end on y when that is the smaller overlap', () => {
    const contact = contactBetween(box(), box({ x: 110, y: 145 }));

    expect(contact?.axis).toBe('y');
    expect(contact?.depth).toBe(7);
    expect(contact?.nx).toBe(0);
  });

  it('points the normal from the first box toward the second', () => {
    expect(contactBetween(box(), box({ x: 90 }))?.nx).toBe(-1);
    expect(contactBetween(box(), box({ x: 110 }))?.nx).toBe(1);
    expect(contactBetween(box(), box({ y: 90 }))?.ny).toBe(-1);
    expect(contactBetween(box(), box({ y: 110 }))?.ny).toBe(1);
  });

  it('gives a tie to the lane axis', () => {
    const contact = contactBetween(box(), box({ x: 110, y: 110 }));

    expect(contact?.axis).toBe('x');
  });
});

describe('closingSpeed', () => {
  const contact = contactBetween(box(), box({ x: 110 }));
  if (!contact) throw new Error('the fixture must overlap');

  it('counts a body moving toward the other one', () => {
    expect(closingSpeed(contact, body(), body({ vx: -80 }))).toBe(80);
    expect(closingSpeed(contact, body({ vx: 80 }), body())).toBe(80);
  });

  it('is zero for a contact that is already separating', () => {
    expect(closingSpeed(contact, body(), body({ vx: 80 }))).toBe(0);
  });

  it('ignores motion across the normal', () => {
    expect(closingSpeed(contact, body({ vy: 400 }), body({ vy: -400 }))).toBe(0);
  });
});

describe('resolveContact', () => {
  it('is null when the boxes do not touch, however fast they close', () => {
    expect(resolveContact(body(), body({ x: 400, vx: -900 }))).toBeNull();
  });

  it('separates the boxes completely, leaving the configured slop', () => {
    const a = body();
    const b = body({ x: 140 });
    const hit = resolveContact(a, b);
    if (!hit) throw new Error('the fixture must overlap');

    const partedA = { ...box(), x: a.x + hit.shiftAX, y: a.y + hit.shiftAY };
    const partedB = { ...box({ x: 140 }), x: 140 + hit.shiftBX, y: b.y + hit.shiftBY };

    expect(touching(partedA, partedB)).toBe(false);
    // Each body takes half of the overlap plus half the slop.
    expect(hit.shiftAX).toBeCloseTo(-(6 + COLLISION.slop) / 2);
    expect(hit.shiftBX).toBeCloseTo((6 + COLLISION.slop) / 2);
  });

  it('splits a lane contact evenly and pushes the two apart', () => {
    const hit = resolveContact(body(), body({ x: 140 }));
    if (!hit) throw new Error('the fixture must overlap');

    expect(hit.shiftAX).toBeLessThan(0);
    expect(hit.shiftBX).toBeGreaterThan(0);
    expect(hit.deltaAX).toBeLessThan(0);
    expect(hit.deltaBX).toBeGreaterThan(0);
    expect(hit.deltaAX).toBeCloseTo(-hit.deltaBX);
  });

  it('gives a pinned body nothing on the road axis', () => {
    // The car holds its station, so the other car takes the whole rear-end.
    const hit = resolveContact(body({ pinnedY: true }), body({ x: 110, y: 145 }));
    if (!hit) throw new Error('the fixture must overlap');

    expect(hit.contact.axis).toBe('y');
    expect(hit.shiftAY).toBeCloseTo(0);
    expect(hit.deltaAY).toBeCloseTo(0);
    expect(hit.shiftBY).toBeCloseTo(7 + COLLISION.slop);
    expect(hit.deltaBY).toBeGreaterThan(0);
  });

  it('also pins the car when it is the second body', () => {
    // The car is below the other one, so the normal points up and the free car is pushed
    // away from it, down the screen, taking the whole displacement.
    const hit = resolveContact(body({ x: 110, y: 145 }), body({ pinnedY: true }));
    if (!hit) throw new Error('the fixture must overlap');

    expect(hit.shiftBY).toBeCloseTo(0);
    expect(hit.deltaBY).toBeCloseTo(0);
    expect(hit.shiftAY).toBeCloseTo(7 + COLLISION.slop);
  });

  it('parts a standing contact with no closing speed at all', () => {
    const hit = resolveContact(body(), body({ x: 140 }));
    if (!hit) throw new Error('the fixture must overlap');

    expect(hit.approach).toBe(0);
    expect(hit.hard).toBe(false);
    expect(hit.deltaBX).toBe(COLLISION.minPush / 2);
  });

  it('calls a scrape glancing and a fast hit hard', () => {
    expect(resolveContact(body(), body({ x: 140, vx: -40 }))?.hard).toBe(false);
    expect(
      resolveContact(body(), body({ x: 140, vx: -COLLISION.hardImpactSpeed }))?.hard,
    ).toBe(true);
    expect(resolveContact(body(), body({ x: 140, vx: -260 }))?.hard).toBe(true);
  });

  it('treats a hit that is closing vertically as hard on the same threshold', () => {
    const hit = resolveContact(body(), body({ x: 110, y: 145, vy: -COLLISION.hardImpactSpeed }));
    if (!hit) throw new Error('the fixture must overlap');

    expect(hit.contact.axis).toBe('y');
    expect(hit.hard).toBe(true);
  });

  it('caps the impulse however fast the cars meet', () => {
    const hit = resolveContact(body(), body({ x: 140, vx: -4_000 }));
    if (!hit) throw new Error('the fixture must overlap');

    expect(hit.deltaBX).toBe(COLLISION.maxPush / 2);
  });

  it('is deterministic: the same two cars give the same answer', () => {
    const a = body({ vx: 12 });
    const b = body({ x: 133, y: 96, vx: -170, vy: 30 });

    expect(resolveContact(a, b)).toEqual(resolveContact(a, b));
  });

  it('mirrors its answer when the bodies are swapped', () => {
    const a = body({ vx: 20 });
    const b = body({ x: 133, vx: -90 });
    const forward = resolveContact(a, b);
    const backward = resolveContact(b, a);
    if (!forward || !backward) throw new Error('the fixture must overlap');

    expect(backward.shiftAX).toBeCloseTo(forward.shiftBX);
    expect(backward.shiftBX).toBeCloseTo(forward.shiftAX);
    expect(backward.deltaAX).toBeCloseTo(forward.deltaBX);
    expect(backward.deltaBX).toBeCloseTo(forward.deltaAX);
    expect(backward.approach).toBeCloseTo(forward.approach);
  });
});

/**
 * What a contact costs, once the cars have been parted.
 *
 * These are the rules that make neutral traffic worth having at all: hitting a civilian
 * costs score and never armour, and the i-frame window that buys armour must not also
 * swallow that penalty. A ram is the one cost the window owns.
 */
describe('contactCost', () => {
  const HARD_TRAFFIC = {
    hard: true,
    hostile: false,
    runEnded: false,
    invulnerable: false,
  } as const;

  const HARD_RAM = { ...HARD_TRAFFIC, hostile: true } as const;

  it('never spends armour on neutral traffic, whatever the window is doing', () => {
    expect(contactCost(HARD_TRAFFIC).armour).toBe(false);
    expect(contactCost({ ...HARD_TRAFFIC, invulnerable: true }).armour).toBe(false);
    expect(contactCost({ ...HARD_TRAFFIC, runEnded: true }).armour).toBe(false);
  });

  it('marks the rammed car only on a hostile hit, never on traffic', () => {
    expect(contactCost(HARD_TRAFFIC).damageOther).toBe(false);
    expect(contactCost(HARD_RAM).damageOther).toBe(true);
  });

  it('pays the traffic penalty during i-frames and after the run has ended', () => {
    expect(contactCost({ ...HARD_TRAFFIC, invulnerable: true }).trafficPenalty).toBe(true);
    expect(contactCost({ ...HARD_TRAFFIC, runEnded: true }).trafficPenalty).toBe(true);
    expect(contactCost(HARD_TRAFFIC).trafficPenalty).toBe(true);
  });

  it('spends exactly one armour hit on a hard ram', () => {
    expect(contactCost(HARD_RAM)).toEqual({
      armour: true,
      damageOther: true,
      trafficPenalty: false,
      jolt: true,
    });
  });

  it('costs a ram nothing while the window is open: parted, not spent', () => {
    const free = contactCost({ ...HARD_RAM, invulnerable: true });
    expect(free).toEqual({
      armour: false,
      damageOther: false,
      trafficPenalty: false,
      jolt: false,
    });
  });

  it('costs nothing at all on a glance, from either kind of car', () => {
    const glance = {
      armour: false,
      damageOther: false,
      trafficPenalty: false,
      jolt: false,
    };
    expect(contactCost({ ...HARD_TRAFFIC, hard: false })).toEqual(glance);
    expect(contactCost({ ...HARD_RAM, hard: false })).toEqual(glance);
  });

  it('is deterministic: the same contact costs the same twice', () => {
    expect(contactCost(HARD_RAM)).toEqual(contactCost(HARD_RAM));
  });
});
