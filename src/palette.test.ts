import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PALETTE, PALETTE_ORDER } from './palette';

/**
 * The renderer palette and the pipeline palette must be the same list.
 *
 * They are duplicated because one is a build-time JSON registry and the other is a
 * bundled constant. This test is the seam: change one without the other and it fails.
 */
describe('palette', () => {
  const registry = JSON.parse(
    readFileSync(resolve(process.cwd(), 'pipeline/registry/palette.json'), 'utf8'),
  ) as { colors: { index: number; hex: string; name: string }[] };

  it('has 16 colours', () => {
    expect(PALETTE_ORDER).toHaveLength(16);
    expect(registry.colors).toHaveLength(16);
  });

  it('matches the pipeline registry exactly, by index', () => {
    for (const entry of registry.colors) {
      const key = PALETTE_ORDER[entry.index];
      expect(key, `registry index ${entry.index} has no renderer key`).toBeDefined();
      const value = PALETTE[key as keyof typeof PALETTE];
      const expected = Number.parseInt(entry.hex.replace('#', ''), 16);
      expect(value, `${key} should be ${entry.hex}`).toBe(expected);
    }
  });

  it('reserves hot pink for the player', () => {
    expect(registry.colors.find((c) => c.name === 'hot-pink')?.hex).toBe('#ff2e63');
  });

  it('does not contain the chroma key colour', () => {
    const keys = registry.colors.map((c) => c.hex.toLowerCase());
    expect(keys).not.toContain('#ff00ff');
  });
});
