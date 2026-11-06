/**
 * Palette numbers for the renderer.
 *
 * Mirrors pipeline/registry/palette.json. If that file changes, this must change with it —
 * `src/palette.test.ts` asserts they match.
 */
export const PALETTE = {
  void: 0x0b0d10,
  asphalt: 0x161a21,
  asphaltLight: 0x232a34,
  steel: 0x3d4753,
  steelLight: 0x7a8794,
  bone: 0xc8d2dc,
  white: 0xf2f6f9,
  rust: 0x7a2f2f,
  signalRed: 0xb8452f,
  amber: 0xe0762a,
  sand: 0xe8c15a,
  olive: 0x4e7a3f,
  teal: 0x2f6f6a,
  deepBlue: 0x2b4c7e,
  violet: 0x6a4fa3,
  hotPink: 0xff2e63,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Ordered list, used by the procedural art generator for deterministic variation. */
export const PALETTE_ORDER: readonly PaletteKey[] = [
  'void',
  'asphalt',
  'asphaltLight',
  'steel',
  'steelLight',
  'bone',
  'white',
  'rust',
  'signalRed',
  'amber',
  'sand',
  'olive',
  'teal',
  'deepBlue',
  'violet',
  'hotPink',
];

/** Civilian paint: deliberately lower contrast than any combat vehicle. */
export const CIVILIAN_COLORS: readonly PaletteKey[] = [
  'steel',
  'steelLight',
  'bone',
  'sand',
  'olive',
  'deepBlue',
  'rust',
];
