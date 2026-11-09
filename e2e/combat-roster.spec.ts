import { expect, test, type Page } from '@playwright/test';

/**
 * Combat roster, end to end on the production build.
 *
 * Three rules cannot be seen from a unit test: a durable enemy must survive one gun volley,
 * touching a hostile's side weapon must shove the car and take the wheel without deleting
 * the hostile, and a hard ram must damage that hostile without wrecking it in the contact
 * frame (WO-58 step 3) while still spending the car's armour (WO-55 step 3). All three are
 * driven through the same `?debug=1` control surface every other spec uses, and all three
 * read the snapshot rather than the canvas.
 */

const BASE = '/deadlane/';
const SEED = 868686;
const DEBUG_URL = `${BASE}?debug=1&seed=${SEED}`;

interface VehicleState {
  readonly kind: 'player' | 'enemy' | 'civilian';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly vx: number;
  readonly steerLocked: boolean;
  readonly wrecked: boolean;
}

interface ContactState {
  readonly index: number;
  readonly other: 'enemy' | 'civilian';
  readonly weapon: string | null;
  readonly hard: boolean;
}

interface DeadlaneSnapshot {
  readonly sectorCard: { readonly level: number; readonly label: string } | null;
  readonly car: VehicleState;
  readonly vehicles: readonly VehicleState[];
  readonly lastContact: ContactState | null;
  readonly lastScoreEvent: { readonly kind: string; readonly delta: number } | null;
  readonly hud: {
    readonly armor: number;
    readonly lives: number;
    readonly distance: number;
  };
}

interface DeadlaneControl {
  stageEnemy(id?: string): void;
  stageCollision(approachSpeed?: number): void;
}

async function readSnapshot(page: Page): Promise<DeadlaneSnapshot> {
  return page.evaluate(() => {
    const snap = (window as unknown as { __deadlane?: DeadlaneSnapshot }).__deadlane;
    if (!snap) throw new Error('window.__deadlane missing — open the page with ?debug=1');
    return snap;
  });
}

function control(page: Page, name: keyof DeadlaneControl, arg?: string | number): Promise<void> {
  return page.evaluate(
    ({ name, arg }) => {
      const api = (window as unknown as { __deadlaneControl?: DeadlaneControl })
        .__deadlaneControl;
      if (!api) throw new Error('window.__deadlaneControl missing — open the page with ?debug=1');
      if (name === 'stageEnemy') api.stageEnemy(typeof arg === 'string' ? arg : undefined);
      else api.stageCollision(typeof arg === 'number' ? arg : undefined);
    },
    { name, arg },
  );
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
      return snap !== undefined && snap.sectorCard === null && snap.hud.distance > 30;
    },
    undefined,
    { timeout: 20_000 },
  );
}

/** The staged hostile of a given id, or null before it exists. */
function enemyById(snap: DeadlaneSnapshot, id: string): VehicleState | null {
  return snap.vehicles.find((vehicle) => vehicle.kind === 'enemy' && vehicle.id === id) ?? null;
}

test('an ordinary enemy survives one gun volley and dies in the second', async ({ page }) => {
  await startRun(page);
  await control(page, 'stageEnemy', 'turret');

  // Four hp: the two-barrel volley is two points, so the first pull must leave it alive.
  await expect
    .poll(async () => enemyById(await readSnapshot(page), 'turret')?.hp ?? 0, {
      timeout: 8_000,
    })
    .toBe(4);

  await page.keyboard.press('Space', { delay: 80 });

  await expect
    .poll(async () => enemyById(await readSnapshot(page), 'turret')?.hp ?? 0, {
      timeout: 8_000,
    })
    .toBe(2);

  const afterFirst = await readSnapshot(page);
  const hurt = enemyById(afterFirst, 'turret');
  expect(hurt, 'the enemy was deleted by one volley').not.toBeNull();
  expect(afterFirst.lastScoreEvent?.kind ?? '').not.toBe('enemyDestroyed');

  // The second volley takes the last two points on the shipped collision path.
  await page.keyboard.press('Space', { delay: 80 });

  await expect
    .poll(async () => {
      const snap = await readSnapshot(page);
      return snap.lastScoreEvent?.kind === 'enemyDestroyed' && enemyById(snap, 'turret') === null;
    }, { timeout: 8_000 })
    .toBe(true);
});

test('touching a side weapon shoves the car and locks the wheel without deleting it', async ({
  page,
}) => {
  await startRun(page);

  const before = await readSnapshot(page);
  const baseline = before.lastContact?.index ?? 0;
  expect(before.hud.armor).toBeGreaterThan(0);

  // Zero closing speed is a sideswipe: the shove and the lock must come from the weapon,
  // not from a hard impact.
  await control(page, 'stageCollision', 0);

  // The car is pushed away from the hostile on its right, and the wheel is held. The staged
  // hauler carries the `mine-rack` weapon.
  await expect
    .poll(
      async () => {
        const snap = await readSnapshot(page);
        const contact = snap.lastContact;
        if (!contact || contact.index <= baseline) return 'pending';
        const pushed = snap.car.vx < 0;
        const locked = snap.car.steerLocked;
        return `${contact.weapon ?? 'none'}:${pushed}:${locked}`;
      },
      { intervals: [16, 16, 32, 64], timeout: 10_000 },
    )
    .toBe('mine-rack:true:true');

  const after = await readSnapshot(page);

  // The contact is a push, not a kill: the hostile is still on the road with its hp intact.
  const hostile = enemyById(after, 'hauler');
  expect(hostile, 'the hostile was deleted by the contact').not.toBeNull();
  expect(hostile?.hp).toBe(8);
  expect(hostile?.wrecked).toBe(false);

  // A glance costs no armour; the side weapon is the cost.
  expect(after.hud.armor).toBe(before.hud.armor);
  expect(after.hud.lives).toBe(before.hud.lives);
});

test('a hard ram damages the hostile without deleting it in the contact frame', async ({
  page,
}) => {
  await startRun(page);

  const before = await readSnapshot(page);
  const baseline = before.lastContact?.index ?? 0;
  const armourBefore = before.hud.armor;
  const livesBefore = before.hud.lives;
  expect(armourBefore).toBeGreaterThan(1);

  // 260 px/s is a full-lock steer into another car: well past `COLLISION.hardImpactSpeed`.
  await control(page, 'stageCollision', 260);

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

  const after = await readSnapshot(page);
  const hostile = enemyById(after, 'hauler');

  // The ram hurts the car it lands on: the staged hauler is marked.
  expect(hostile, 'the contact frame deleted the hostile').not.toBeNull();
  expect(hostile?.hp ?? 8, 'the ram did not damage the hostile').toBeLessThan(8);
  // ...and it cannot be deleted on the frame it is touched: it stays on the road, alive.
  expect(hostile?.hp ?? 0, 'the contact frame wrecked the hostile').toBeGreaterThanOrEqual(1);
  expect(hostile?.wrecked).toBe(false);

  // A hard ram is the one contact that costs armour: exactly one point, never a life.
  expect(after.hud.armor, 'a hard ram did not cost one armour').toBe(armourBefore - 1);
  expect(after.hud.lives).toBe(livesBefore);
});
