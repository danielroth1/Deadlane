import type { SlotSpec } from './slots.js';

/**
 * House style, prepended to every prompt.
 *
 * This string is the single biggest quality lever in the project: because it is
 * byte-identical across slots, the model's output drifts far less between sheets than it
 * would if each prompt were free-written. Do not localise, translate, or "improve" it per
 * slot — if the style needs to change, change it here and accept that all later slots move
 * with it.
 */
export const HOUSE_STYLE = [
  'retro 2D pixel art game still, strict top-down orthographic view from directly overhead',
  'camera perpendicular to the ground plane, flat map-like framing, no horizon, no sky, no vanishing point',
  'flat hard-edged colours, exactly one pixel dark outline around every element in the frame, including every car, every lane marking and every guardrail',
  'limited 16-colour palette of cold steel greys, matte black, bone white, signal red, amber, teal and olive',
  'top-left key light, no gradients, no glow, no bloom, no soft shadows, no anti-aliasing',
  'crisp chunky pixels, readable silhouette at small size',
  'no text, no letters, no numbers, no labels, no watermark, no signature',
].join(', ');

/** Grid contract. Encodes the sheet rules from docs/ART_BIBLE.md section 5. */
export function gridContract(slot: SlotSpec): string {
  if (slot.kind === 'single') {
    return 'single square image, one subject, centred, generous margin';
  }
  const { cols, rows } = slot.grid;
  return [
    `a strict ${cols} by ${rows} grid of equal square cells, ${cols * rows} subjects total`,
    'exactly one subject centred in each cell',
    'uniform cell size, uniform subject scale, no grid lines drawn',
    'subjects never cross cell boundaries',
    'empty cells are fine, leave them blank',
  ].join(', ');
}

/** Flat magenta background — chroma-keys cleanly because magenta is not in the palette. */
export const BACKGROUND_CONTRACT =
  'solid flat pure magenta #FF00FF background behind every subject, no shadows cast onto the background';

const NEGATIVE_HINTS = [
  'not isometric',
  'not three-quarter view',
  'not a photo',
  'not a 3D render',
  'not painterly',
  'not blurred',
  'not tilted',
  'no perspective distortion',
  'no horizon',
  'no sky',
  'no vanishing point',
  'no one-point perspective',
  'no chase camera',
];

export interface BuiltPrompt {
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly notes: readonly string[];
}

/**
 * Compose the final prompt for a slot.
 *
 * Order matters: house style first (it sets the frame), then the grid contract (it
 * constrains layout), then the subject, then emphasis. Models weight early tokens more
 * strongly, and layout failures are the most expensive kind to retry.
 */
export function buildPrompt(slot: SlotSpec): BuiltPrompt {
  const parts: string[] = [HOUSE_STYLE];

  if (slot.kind === 'sheet') {
    parts.push(gridContract(slot));
    parts.push(BACKGROUND_CONTRACT);
  } else {
    parts.push(gridContract(slot));
  }

  parts.push(`CONTENT: ${slot.subject}`);

  if (slot.cells) {
    const named = slot.cells.filter((c): c is string => Boolean(c));
    parts.push(`The cells are, in reading order: ${named.join('; ')}`);
  }

  if (slot.emphasis?.length) {
    parts.push(`MUST: ${slot.emphasis.join('; ')}`);
  }

  parts.push(`SIZE: each subject is rendered for a ${slot.finalSize} by ${slot.finalSize} final sprite`);

  return {
    prompt: parts.join('. ').replace(/\.\s*\./g, '.'),
    negativePrompt: NEGATIVE_HINTS.join(', '),
    notes: [
      'Generated at a large resolution, then downscaled and quantised by pipeline/steps/.',
      'Never ship the raw output.',
    ],
  };
}

/**
 * Prompt delta for a retry.
 *
 * Retries must change something meaningful, otherwise they burn budget. The strategy
 * rotates deterministically by attempt number so a reviewer can reproduce the sequence.
 */
export const RETRY_STRATEGIES: readonly string[] = [
  'baseline',
  'emphasise the grid: evenly spaced cells, all subjects identical in scale',
  'simplify each subject into fewer, larger pixel clusters',
  'emphasise the one-pixel outline and flat fills, remove any inner detail',
  'emphasise the flat magenta background and remove every stray mark',
  'emphasise the cold 16-colour palette, remove all warm or bright hues',
];

export function retrySuffix(attempt: number): string {
  const index = Math.min(Math.max(attempt - 1, 0), RETRY_STRATEGIES.length - 1);
  const strategy = RETRY_STRATEGIES[index]!;
  if (index === 0) return '';
  return ` REVISION ${index}: ${strategy}.`;
}
