import { expect, test, type Page } from '@playwright/test';

/**
 * A collision parts the two cars; it does not delete one.
 *
 * Nothing here can be seen from a unit test: it is the assembled scene, on the production
 * build, driven through the same `?debug=1` control surface everything else uses. The staged
 * contact is one hostile placed on the car's flank, overlapping it, holding its lane — so the
 * only motion in the frames that follow is the resolver's.
 *
 * The assertions read the collision boxes, not the artwork: a sprite is not proof that two
 * cars were parted, and the depth the resolver reports is proof that they were touching.
 */

const BASE = '/deadlane/';
const SEED = 515253;
const DEBUG_URL = `${BASE}?debug=1&seed=${SEED}`;

/** Mirror of one car as the contact pass sees it (`VehicleDebugState`). */
interface VehicleState {
  readonly kind: 'player' | 'enemy' | 'civilian';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly vx: number;
  readonly vy: number;
  readonly wrecked: boolean;
}

/** Mirror of the last resolved contact (`ContactDebugState`). */
interface ContactState {
  readonly index: number;
  readonly other: 'enemy' | 'civilian';
  readonly depth: number;
  readonly nx: number;
  readonly ny: number;
  readonly approach: number;
  readonly hard: boolean;
  readonly playerVx: number;
  readonly otherVx: number;
}

/** Mirror of the read-only `window.__deadlane` snapshot, collision fields only. */
interface DeadlaneSnapshot {
  readonly sectorCard: { readonly level: number; readonly label: string } | null;
  readonly car: VehicleState;
  readonly vehicles: readonly VehicleState[];
  readonly lastContact: ContactState | null;
  readonly hud: {
    readonly armor: number;
    readonly lives: number;
    readonly distance: number;
  };
}

/** Mirror of the debug-only actions this spec drives. */
interface DeadlaneControl {
  stageCollision(approachSpeed?: number): void;
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
}

/** Start a run and wait until the sector card has cleared. */
async function startRun(page: Page): Promise<void> {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(DEBUG_URL);
  await expect(page.locator('#dl-root canvas')).toBeVisible({ timeout: 15_000 });

  await expect
    .poll(
      async () => {
        await page.keyboard.press('Space');
        return page.evaluate(() =>
          Boolean((window as unknown as { __deadlane?: unknown }).__deadlane),
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  await page.waitForFunction(
    () => {
      const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
      // `hud.distance` is metres, so 30 m is well past the sector card.
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 30;
    },
    undefined,
    { timeout: 20_000 },
  );
}

/** Put a hostile on the car's flank, closing at `approachSpeed` px/s, and return the contact count. */
async function stageCollision(page: Page, approachSpeed: number): Promise<number> {
  const before = await readSnapshot(page);
  await page.evaluate((speed) => {
    const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
      .__deadlaneControl;
    if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
    api.stageCollision(speed);
  }, approachSpeed);
  return before.lastContact?.index ?? 0;
}

/** The first hostile on the road, which after a stage is the staged one. */
function firstEnemy(snap: DeadlaneSnapshot): VehicleState {
  const enemy = snap.vehicles.find((vehicle) => vehicle.kind === 'enemy');
  if (!enemy) throw new Error('the staged hostile is not on the road');
  return enemy;
}

test('a sideswipe parts both cars without spending anything', async ({ page }) => {
  await startRun(page);

  const start = await readSnapshot(page);
  const armourBefore = start.hud.armor;
  const livesBefore = start.hud.lives;
  expect(armourBefore, 'the run starts with no armour to spend').toBeGreaterThan(0);

  const baseline = await stageCollision(page, 0);

  // Wait for the contact to resolve, and read the car's live lateral velocity in the same
  // sample: the impulse is short-lived, so a separate read could miss it.
  await expect
    .poll(
      async () => {
        const snap = await readSnapshot(page);
        const contact = snap.lastContact;
        if (!contact || contact.index <= baseline) return 'pending';
        return snap.car.vx < 0 ? 'pushed' : 'not-pushed';
      },
      { intervals: [16, 16, 32, 64], timeout: 10_000 },
    )
    .toBe('pushed');

  const resolved = await readSnapshot(page);
  const contact = resolved.lastContact;
  expect(contact, 'no contact was resolved').not.toBeNull();
  if (!contact) return;

  // They were touching, on the lane axis, and it was a glance rather than a hit.
  expect(contact.depth).toBeGreaterThan(0);
  expect(contact.other).toBe('enemy');
  expect(contact.ny).toBe(0);
  expect(contact.hard).toBe(false);

  // "Velocity changed": the car is pushed away from the staged car on its right, and the
  // staged car the other way. Equal and opposite, from the resolver's own record.
  expect(contact.playerVx).toBeLessThan(0);
  expect(contact.otherVx).toBeGreaterThan(0);
  expect(contact.playerVx).toBeCloseTo(-contact.otherVx, 6);

  // "Positions separated": the two boxes no longer overlap.
  const car = resolved.car;
  const staged = firstEnemy(resolved);
  expect(
    Math.abs(staged.x - car.x),
    `the cars are still overlapping (car ${car.x}, hostile ${staged.x})`,
  ).toBeGreaterThanOrEqual(car.halfWidth + staged.halfWidth);

  // Nothing was deleted and nothing was spent: this is the recoverable case.
  expect(resolved.vehicles.some((vehicle) => vehicle.kind === 'enemy'), 'the hostile was deleted').toBe(
    true,
  );
  expect(staged.wrecked).toBe(false);
  expect(resolved.hud.armor, 'a sideswipe cost armour').toBe(armourBefore);
  expect(resolved.hud.lives, 'a sideswipe cost a life').toBe(livesBefore);
});

test('a hard contact spends one armour and is refused again inside the window', async ({ page }) => {
  await startRun(page);

  const start = await readSnapshot(page);
  const armourBefore = start.hud.armor;
  expect(armourBefore).toBeGreaterThan(1);

  // 260 px/s is a full-lock steer into another car: the staged hostile is given that much
  // closing speed, which is well past `COLLISION.hardImpactSpeed`.
  const baseline = await stageCollision(page, 260);

  await expect
    .poll(
      async () => {
        const snap = await readSnapshot(page);
        const contact = snap.lastContact;
        if (!contact || contact.index <= baseline) return 'pending';
        return contact.hard ? 'hard' : 'soft';
      },
      { intervals: [16, 16, 32, 64], timeout: 10_000 },
    )
    .toBe('hard');

  const hit = await readSnapshot(page);
  expect(hit.lastContact?.approach).toBeGreaterThanOrEqual(130);
  expect(hit.hud.armor, 'a hard contact did not cost exactly one armour').toBe(
    armourBefore - 1,
  );

  // The car is invulnerable for a while afterwards, so the contacts that follow inside the
  // window must not spend a second point.
  await page.waitForTimeout(400);
  const later = await readSnapshot(page);
  expect(later.hud.armor, 'a contact spent armour twice inside one i-frame window').toBe(
    armourBefore - 1,
  );
});
