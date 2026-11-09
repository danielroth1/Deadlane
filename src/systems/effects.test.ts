import { describe, expect, it } from 'vitest';
import { FX } from '@/config';
import {
  BOSS_EXPLOSION_LAYERS,
  EXPLOSION_PACKAGES,
  explosionPackageFor,
  rotorQuarter,
  skidFade,
  skidTriggered,
} from './effects';

/**
 * The deterministic effect table.
 *
 * These are the four claims the scene relies on and a spec cannot see: the table has four
 * distinct packages, consecutive ordinals differ, the tyre trigger fires on the event and
 * not on every frame, and the rotor advances in whole quarter turns.
 */

describe('explosion packages', () => {
  it('offers the four packages the order names', () => {
    expect(EXPLOSION_PACKAGES.map((pack) => pack.variant)).toEqual([
      'fireball',
      'smoke',
      'debris',
      'shockwave',
    ]);
  });

  it('gives every package at least two layers and a primary frame set', () => {
    for (const pack of EXPLOSION_PACKAGES) {
      expect(pack.layers.length, `${pack.variant} has no layers`).toBeGreaterThan(1);
      for (const layer of pack.layers) {
        expect(layer.ids.length, `${pack.variant} has a layer with no ids`).toBeGreaterThan(0);
        expect(layer.footprint).toBeGreaterThan(0);
        expect(layer.grow).toBeGreaterThan(1);
        expect(layer.durationMs).toBeGreaterThan(0);
      }
    }
  });

  it('cycles so two consecutive explosions never share a package', () => {
    for (let ordinal = 0; ordinal < 12; ordinal += 1) {
      expect(explosionPackageFor(ordinal).variant).not.toBe(
        explosionPackageFor(ordinal + 1).variant,
      );
    }
  });

  it('wraps any integer into the table, including negatives', () => {
    expect(explosionPackageFor(0)).toBe(explosionPackageFor(4));
    expect(explosionPackageFor(-1)).toBe(explosionPackageFor(3));
  });

  it('builds a boss blast larger and longer than any single package', () => {
    const largest = Math.max(
      ...EXPLOSION_PACKAGES.flatMap((pack) => pack.layers.map((layer) => layer.footprint)),
    );
    const bossLargest = Math.max(...BOSS_EXPLOSION_LAYERS.map((layer) => layer.footprint));
    const longest = Math.max(...BOSS_EXPLOSION_LAYERS.map((layer) => layer.durationMs));

    expect(bossLargest).toBeGreaterThan(largest);
    expect(longest).toBeGreaterThan(600);
  });
});

describe('skid trigger', () => {
  it('lights the tyres on a hard steer at any speed', () => {
    expect(skidTriggered(FX.skidMinLateral, 0, false)).toBe(true);
    expect(skidTriggered(-FX.skidMinLateral - 1, 0, false)).toBe(true);
  });

  it('does not light them on a gentle steer with no brake', () => {
    expect(skidTriggered(FX.skidMinLateral - 1, 220, false)).toBe(false);
    expect(skidTriggered(0, 0, false)).toBe(false);
  });

  it('lights them on a hard brake above the speed floor', () => {
    expect(skidTriggered(0, FX.skidBrakeSpeed, true)).toBe(true);
    expect(skidTriggered(0, FX.skidBrakeSpeed - 1, true)).toBe(false);
    expect(skidTriggered(0, FX.skidBrakeSpeed, false)).toBe(false);
  });
});

describe('skid fade', () => {
  it('is full when fresh, half at half life and zero once spent', () => {
    expect(skidFade(0, 1000)).toBe(1);
    expect(skidFade(500, 1000)).toBeCloseTo(0.5);
    expect(skidFade(1000, 1000)).toBe(0);
    expect(skidFade(5000, 1000)).toBe(0);
  });

  it('treats a zero-length life as already gone', () => {
    expect(skidFade(0, 0)).toBe(0);
  });
});

describe('rotor quarter', () => {
  it('steps one quarter per rotor interval and wraps at four', () => {
    expect(rotorQuarter(0)).toBe(0);
    expect(rotorQuarter(FX.rotorStepMs - 1)).toBe(0);
    expect(rotorQuarter(FX.rotorStepMs)).toBe(1);
    expect(rotorQuarter(FX.rotorStepMs * 3)).toBe(3);
    expect(rotorQuarter(FX.rotorStepMs * 4)).toBe(0);
  });

  it('never reads negative before the clock starts', () => {
    expect(rotorQuarter(-100)).toBe(0);
  });
});
