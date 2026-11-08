/**
 * The 20 art slots.
 *
 * A "slot" is a permanent reservation in the 150-image budget. Slots are fixed for the
 * life of the project; re-scoping art means re-allocating cells inside a slot, not adding
 * new slots. Everything the game can draw is ultimately addressed by a sprite id that
 * belongs to exactly one slot.
 *
 * See docs/ART_BIBLE.md for the visual contract these prompts encode.
 */

export type SlotKind = 'single' | 'sheet';
export type SlotTarget = 'vehicle' | 'prop' | 'tile' | 'icon' | 'ui' | 'art';

export interface SlotSpec {
  /** Stable id used by the budget ledger, prompts, and CLI. Never renumber. */
  readonly id: string;
  /** Short human label. */
  readonly title: string;
  readonly kind: SlotKind;
  readonly target: SlotTarget;
  /** Grid dimensions of the generated image. Single-image slots are 1x1. */
  readonly grid: { readonly cols: number; readonly rows: number };
  /** Rendered size of each final sprite, in game pixels. */
  readonly finalSize: number;
  /** What the model is being asked to draw. Composed with the house style. */
  readonly subject: string;
  /** Named contents of each grid cell, row-major. Undefined cells are discarded. */
  readonly cells?: readonly (string | null)[];
  /**
   * Row-major cell indexes that must never reach the atlas, even when the processed PNG
   * exists in the work directory.
   *
   * This is registry data, not a `rm` of `cell-<i>.png`. Reprocessing a slot rewrites every
   * non-empty cell, so a deleted file silently comes back; a declared drop survives any
   * re-run of `art:process` and is enforced by the atlas builder.
   */
  readonly droppedCells?: readonly number[];
  /** Anything the sheet must get right. Folded into the prompt. */
  readonly emphasis?: readonly string[];
}

/** Vehicle sheet cells are row-major; null means "discard this cell". */
const CELLS = 16;

function padCells(labels: readonly (string | null)[]): readonly (string | null)[] {
  const out = [...labels];
  while (out.length < CELLS) out.push(null);
  return out;
}

export const SLOTS: readonly SlotSpec[] = [
  {
    id: 'art-01-style-anchor',
    title: 'Style anchor plate',
    kind: 'single',
    target: 'art',
    grid: { cols: 1, rows: 1 },
    finalSize: 640,
    subject:
      'a single hero frame: one matte-black interceptor car seen from directly above, centred on an eight-lane asphalt highway at night, lane markings, steel guardrails, uniform flat night ambient light across the asphalt, no light pools, no streetlight cones, no smoke',
    emphasis: [
      'this is the visual reference for the whole game, so it must read as a game still, not a poster',
      'the camera is perpendicular to the ground and the whole frame is road surface, with no horizon',
      'strong readable road markings and a clear top-down camera',
    ],
  },
  {
    id: 'art-02-player-vehicle',
    title: 'Player vehicle states',
    kind: 'sheet',
    target: 'vehicle',
    grid: { cols: 2, rows: 2 },
    finalSize: 128,
    subject:
      'four separate matte-black interceptor cars seen from directly above: one whole car per cell, every car drawn at the same scale and in the same nose-up pose, centred in its own cell — the hero car clean, the same car lightly damaged, the same car burnt out and wrecked, and a hover variant of the same car',
    cells: padCells([
      'interceptor clean',
      'interceptor wrecked',
      'interceptor damaged',
      'hover interceptor',
    ]),
    emphasis: [
      'the player car is always axis-aligned pointing up',
      'pink tail lights only',
      'no rotation, no lean and no tilt: every car sits square to the frame',
      'no side-on view and no three-quarter view, only a pure square-on overhead view of each car',
      'no road markings, no lane paint and no guardrails behind the cars',
      'no tyre smoke, no skid marks and no exhaust plume',
      'no shadow cast onto the background',
    ],
  },
  {
    id: 'art-03-enemy-ground-a',
    title: 'Division ground forces A',
    kind: 'sheet',
    target: 'vehicle',
    grid: { cols: 2, rows: 2 },
    finalSize: 128,
    subject:
      'four separate hostile Division ground vehicles seen from directly above: one whole vehicle per cell, every vehicle drawn at the same scale and in the same nose-up pose, centred in its own cell — an enforcer motorcycle, a switchblade interceptor, a road lord heavy and a division sports coupe',
    cells: padCells([
      'enforcer motorcycle',
      'switchblade interceptor',
      'road lord heavy',
      'division sports coupe',
    ]),
    // Cell 0 (enforcer motorcycle) is drawn nose-down: the frame contradicts the
    // nose-up contract every vehicle sprite carries, so it must never ship.
    droppedCells: [0],
    emphasis: [
      'red nose lights on every hostile',
      'silhouettes wider at the front',
      'every hostile vehicle is always axis-aligned pointing up',
      'no rotation, no lean and no tilt: every vehicle sits square to the frame',
      'no side-on view, only a pure square-on overhead view of each vehicle',
      'no road markings, no lane paint and no guardrails behind the vehicles',
      'no tyre smoke, no skid marks and no exhaust plume',
      'no shadow cast onto the background',
    ],
  },
  {
    id: 'art-04-enemy-ground-b',
    title: 'Division heavy units',
    kind: 'sheet',
    target: 'vehicle',
    grid: { cols: 2, rows: 2 },
    finalSize: 128,
    subject:
      'four separate hostile heavy machines seen from directly above: one whole vehicle per cell, every vehicle drawn at the same scale and in the same nose-up pose, centred in its own cell — a hauler armoured truck, a turret rig, a ram bulldozer and a missile trailer',
    cells: padCells([
      'hauler armoured truck',
      'turret rig',
      'ram bulldozer',
      'missile trailer',
    ]),
    emphasis: [
      'heavy units must look slow and massive compared to art-03',
      'every hostile vehicle is always axis-aligned pointing up',
      'no rotation, no lean and no tilt: every vehicle sits square to the frame',
      'no side-on view, only a pure square-on overhead view of each vehicle',
      'no road markings, no lane paint and no guardrails behind the vehicles',
      'no tyre smoke, no skid marks and no exhaust plume',
      'no shadow cast onto the background',
    ],
  },
  {
    id: 'art-05-enemy-air',
    title: 'Division air wing',
    kind: 'sheet',
    target: 'vehicle',
    grid: { cols: 2, rows: 2 },
    finalSize: 128,
    subject:
      'four separate hostile aircraft seen from directly above: one whole aircraft per cell, every aircraft drawn at the same scale and in the same nose-up pose, centred in its own cell — an attack helicopter, a large gunship, a hunter drone and a jet fighter',
    cells: padCells([
      'attack helicopter',
      'gunship large',
      'hunter drone',
      'jet fighter',
    ]),
    emphasis: [
      'rotors drawn as a crisp four-pixel cross, never blurred',
      'top-down only',
      'every hostile aircraft is always axis-aligned with its nose pointing up',
      'no rotation, no bank and no tilt: every aircraft sits square to the frame',
      'no side-on view, only a pure square-on overhead view of each aircraft',
      'no road markings and no terrain behind the aircraft',
      'no smoke, no exhaust plume and no vapour trail',
      'no shadow cast onto the background',
    ],
  },
  {
    id: 'art-06-enemy-sea',
    title: 'Division water wing',
    kind: 'sheet',
    target: 'vehicle',
    grid: { cols: 2, rows: 2 },
    finalSize: 128,
    subject:
      'four separate hostile watercraft seen from directly above: one whole boat per cell, every boat drawn at the same scale and in the same nose-up pose, centred in its own cell — a gunboat, a hostile speedboat, a hovercraft and a torpedo boat',
    cells: padCells([
      'gunboat',
      'speedboat hostile',
      'hovercraft',
      'torpedo boat',
    ]),
    // Cell 1 (speedboat hostile) is rendered in three-quarter view: the only sprite in the
    // set that breaks the square-on overhead camera, so it must never ship.
    droppedCells: [1],
    emphasis: [
      'hull silhouettes must differ strongly',
      'every hostile boat is always axis-aligned with its bow pointing up',
      'no rotation, no lean and no tilt: every boat sits square to the frame, drawn exactly like every land vehicle in the game',
      'no side-on view, only a pure square-on overhead view of each boat',
      'no water texture, no ripples and no spray behind or beside the hulls',
      'no road markings and no terrain behind the boats',
      'no smoke and no exhaust plume',
      'no shadow cast onto the background',
    ],
  },
  {
    id: 'art-07-boss',
    title: 'Act bosses',
    kind: 'sheet',
    target: 'vehicle',
    grid: { cols: 2, rows: 2 },
    finalSize: 128,
    subject:
      'four oversized boss machines seen from directly above, one per cell: a hulking six-wheel command carrier with a dorsal turret, an armoured gunship helicopter twice the size of a normal one, a river dreadnought, and a tunnel-crawling boring machine',
    cells: padCells(['command carrier', 'gunship boss', 'river dreadnought', 'boring machine']),
    emphasis: ['each boss fills its cell', 'clearly a scaled-up threat, same rendering rules'],
  },
  {
    id: 'art-08-civilians',
    title: 'Civilian traffic',
    kind: 'sheet',
    target: 'vehicle',
    grid: { cols: 4, rows: 4 },
    finalSize: 64,
    subject:
      'sixteen ordinary civilian road vehicles seen from directly above: sedans, estate wagons, hatchbacks, pickup trucks, a delivery van, a box truck, a taxi, a bus, a camper, a sports car, a small lorry and a limousine',
    cells: padCells([
      'sedan',
      'sedan alt',
      'estate wagon',
      'hatchback',
      'pickup truck',
      'delivery van',
      'box truck',
      'taxi',
      'city bus',
      'camper van',
      'civilian sports car',
      'small lorry',
      'limousine',
      'minibus',
      'flatbed lorry',
      'family suv',
    ]),
    emphasis: [
      'muted factory paint colours',
      'lower contrast than any combat vehicle',
      'never looks aggressive',
    ],
  },
  {
    id: 'art-09-weapons-pickups',
    title: 'Weapons and pickups',
    kind: 'sheet',
    target: 'prop',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'sixteen top-down road objects: an oil slick patch, a smoke canister, an oil drum, a mine, a crate, an ammo box, a shield cell, an armour plate, a nitro canister, a toolbox, a weapons-van ramp, a turret pickup, a health kit, a score token, a jammer device and a flare',
    cells: padCells([
      'oil slick',
      'smoke canister',
      'oil drum',
      'mine',
      'crate',
      'ammo box',
      'shield cell',
      'armour plate',
      'nitro canister',
      'toolbox',
      'weapons van ramp',
      'turret pickup',
      'health kit',
      'score token',
      'jammer device',
      'flare',
    ]),
    emphasis: ['must read at 32x32', 'no text on crates or boxes'],
  },
  {
    id: 'art-10-fx',
    title: 'Effects',
    kind: 'sheet',
    target: 'prop',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'sixteen top-down effects on magenta: small explosion, medium explosion, large explosion, fireball, smoke puff, thick smoke, tyre skid, sparks, debris, muzzle flash, water splash, dust cloud, electric arc, shockwave ring, oil splatter and a headlight cone',
    cells: padCells([
      'explosion small',
      'explosion medium',
      'explosion large',
      'fireball',
      'smoke puff',
      'thick smoke',
      'tyre skid',
      'sparks',
      'debris',
      'muzzle flash',
      'water splash',
      'dust cloud',
      'electric arc',
      'shockwave ring',
      'oil splatter',
      'headlight cone',
    ]),
    emphasis: ['flat colour, hard edges', 'no glow, no soft gradients'],
  },
  {
    id: 'art-11-props-a',
    title: 'Roadside props',
    kind: 'sheet',
    target: 'prop',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'sixteen top-down roadside objects for a highway: traffic cone, jersey barrier, guardrail segment, tyres stack, warning sign, overhead gantry, streetlight, billboard, road patch, pothole, metal spike strip, sandbag wall, chain fence segment, sawhorse barrier, reflector post and a stack of pallets',
    cells: padCells([
      'traffic cone',
      'jersey barrier',
      'guardrail',
      'tyre stack',
      'warning sign',
      'overhead gantry',
      'streetlight',
      'billboard',
      'road patch',
      'pothole',
      'spike strip',
      'sandbag wall',
      'chain fence',
      'sawhorse',
      'reflector post',
      'pallet stack',
    ]),
  },
  {
    id: 'art-12-props-b',
    title: 'Terrain props',
    kind: 'sheet',
    target: 'prop',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'sixteen top-down natural and industrial objects: boulder, rock pile, dry bush, pine tree, palm tree, cactus, burnt tree, oil pump, pipeline segment, water tower, shack, container stack, cable spool, wrecked car, crater and a fallen signpost',
    cells: padCells([
      'boulder',
      'rock pile',
      'dry bush',
      'pine tree',
      'palm tree',
      'cactus',
      'burnt tree',
      'oil pump',
      'pipeline segment',
      'water tower',
      'shack',
      'container stack',
      'cable spool',
      'wrecked car',
      'crater',
      'fallen signpost',
    ]),
  },
  {
    id: 'art-13-tiles-highway',
    title: 'Highway tiles',
    kind: 'sheet',
    target: 'tile',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'a seamless tile set for a night highway: asphalt centre, asphalt with lane dash, lane dash vertical, lane edge line, shoulder asphalt, shoulder gravel, guardrail top, grass verge, bridge plate, tunnel mouth surround, crack overlay, oil stain overlay, road seam, cats eye reflectors, chevron paint and a painted arrow',
    cells: padCells([
      'asphalt plain',
      'asphalt lane dash',
      'asphalt edge line',
      'asphalt double line',
      'shoulder asphalt',
      'shoulder gravel',
      'guardrail top',
      'grass verge',
      'bridge plate',
      'tunnel mouth',
      'crack overlay',
      'oil stain overlay',
      'road seam',
      'cats eye',
      'chevron paint',
      'painted arrow',
    ]),
    emphasis: ['every tile must tile seamlessly with itself', 'no directional noise that breaks repetition'],
  },
  {
    id: 'art-14-tiles-canyon',
    title: 'Canyon tiles',
    kind: 'sheet',
    target: 'tile',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'a seamless tile set for a desert canyon road: cracked asphalt, sand, dry dirt, cliff rock, cliff edge, loose gravel, cracked stone, red rock face, dry scrub, roadside dirt, rock scree, painted centre line, culvert grate, dust overlay and two rock wall variants',
    cells: padCells([
      'cracked asphalt',
      'sand plain',
      'dry dirt',
      'cliff rock',
      'cliff edge',
      'loose gravel',
      'cracked stone',
      'red rock',
      'dry scrub',
      'roadside dirt',
      'rock scree',
      'painted centre line',
      'culvert grate',
      'dust overlay',
      'rock wall a',
      'rock wall b',
    ]),
    emphasis: ['seamless tiling', 'warm palette family'],
  },
  {
    id: 'art-15-tiles-water',
    title: 'Water tiles',
    kind: 'sheet',
    target: 'tile',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'a seamless tile set for a river delta: open water, choppy water, foam, wake, sand bank, muddy bank, reed bed, gravel shore, shallow water, deep water, current streak, ripple overlay, stone bank edge, wooden pier plank, buoy and a moored tyre',
    cells: padCells([
      'open water',
      'choppy water',
      'foam',
      'wake',
      'sand bank',
      'muddy bank',
      'reed bed',
      'gravel shore',
      'shallow water',
      'deep water',
      'current streak',
      'ripple overlay',
      'stone bank edge',
      'pier plank',
      'buoy',
      'moored tyre',
    ]),
    emphasis: ['seamless tiling', 'water reads as flat, not reflective'],
  },
  {
    id: 'art-16-tiles-city',
    title: 'City tiles',
    kind: 'sheet',
    target: 'tile',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'a seamless top-down tile set for a city block: street asphalt, intersection, crosswalk stripes, sidewalk slab, sidewalk corner, building roof, roof vent, roof ledge, alley concrete, kerb edge, manhole, storm drain, plaza tile, grass median, parking bay paint and a painted stop line',
    cells: padCells([
      'street asphalt',
      'intersection',
      'crosswalk',
      'sidewalk slab',
      'sidewalk corner',
      'building roof',
      'roof vent',
      'roof ledge',
      'alley concrete',
      'kerb edge',
      'manhole',
      'storm drain',
      'plaza tile',
      'grass median',
      'parking bay',
      'stop line',
    ]),
    emphasis: ['seamless tiling', 'roofs must read as roofs from directly above'],
  },
  {
    id: 'art-17-tiles-tunnel',
    title: 'Tunnel tiles',
    kind: 'sheet',
    target: 'tile',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'a seamless tile set for a road tunnel: tunnel asphalt, tunnel edge line, concrete wall, wall with cable run, ceiling panel, ceiling light, support pillar, portal frame, floor grate, wet patch, scorch mark, emergency door, painted lane arrow, ventilation duct, rubble and a hazard stripe',
    cells: padCells([
      'tunnel asphalt',
      'tunnel edge line',
      'concrete wall',
      'wall cable run',
      'ceiling panel',
      'ceiling light',
      'support pillar',
      'portal frame',
      'floor grate',
      'wet patch',
      'scorch mark',
      'emergency door',
      'lane arrow',
      'ventilation duct',
      'rubble',
      'hazard stripe',
    ]),
    emphasis: ['seamless tiling', 'cold palette family', 'reads as enclosed and oppressive'],
  },
  {
    id: 'art-18-tiles-transition',
    title: 'Transition and overlay tiles',
    kind: 'sheet',
    target: 'tile',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'sixteen seamless blending and overlay tiles: asphalt to sand, asphalt to water, asphalt to concrete, shoulder to grass, grass to rock, road edge striped chevrons, faded paint overlay, rain overlay, snow overlay, fog overlay, scanline overlay, vignette corner, dirt splatter overlay, crack network overlay and two gradient-free blend masks',
    cells: padCells([
      'asphalt to sand',
      'asphalt to water',
      'asphalt to concrete',
      'shoulder to grass',
      'grass to rock',
      'chevron shoulder',
      'faded paint overlay',
      'rain overlay',
      'snow overlay',
      'fog overlay',
      'scanline overlay',
      'vignette corner',
      'dirt overlay',
      'crack overlay',
      'blend mask a',
      'blend mask b',
    ]),
    emphasis: ['overlays must be usable at partial opacity without soft edges'],
  },
  {
    id: 'art-19-ui-icons',
    title: 'HUD icons',
    kind: 'sheet',
    target: 'icon',
    grid: { cols: 4, rows: 4 },
    finalSize: 32,
    subject:
      'sixteen flat single-colour-neutral HUD icons on magenta: machine gun, oil slick, smoke screen, armour plate, shield, timer, score star, warning triangle, target reticle, arrow left, arrow right, arrow up, fuel gauge, radio waves, lock-on and a skull',
    cells: padCells([
      'machine gun',
      'oil slick',
      'smoke screen',
      'armour',
      'shield',
      'timer',
      'score star',
      'warning',
      'reticle',
      'arrow left',
      'arrow right',
      'arrow up',
      'fuel gauge',
      'radio waves',
      'lock-on',
      'skull',
    ]),
    emphasis: ['icons must survive being tinted at runtime', 'bold, minimum 2px strokes'],
  },
  {
    id: 'art-20-ui-chrome',
    title: 'UI chrome',
    kind: 'sheet',
    target: 'ui',
    grid: { cols: 4, rows: 4 },
    finalSize: 64,
    subject:
      'sixteen flat pixel UI components on magenta: a panel frame corner, a panel edge horizontal, a panel edge vertical, a button raised, a button pressed, a meter frame, a meter fill, a divider, a title banner strip, a mission card frame, a warning banner, a number plate frame, a scanline strip, a progress bar cap, a corner bracket and a grid pattern',
    cells: padCells([
      'panel corner',
      'panel edge h',
      'panel edge v',
      'button raised',
      'button pressed',
      'meter frame',
      'meter fill',
      'divider',
      'title banner',
      'mission card',
      'warning banner',
      'number plate',
      'scanline strip',
      'progress cap',
      'corner bracket',
      'grid pattern',
    ]),
    emphasis: ['grid-aligned so tiles can be nine-sliced', 'no text of any kind'],
  },
];

/** Lookup by id, used by the CLI and by the score/select steps. */
export const SLOT_BY_ID: ReadonlyMap<string, SlotSpec> = new Map(
  SLOTS.map((slot) => [slot.id, slot]),
);

export function requireSlot(id: string): SlotSpec {
  const slot = SLOT_BY_ID.get(id);
  if (!slot) {
    throw new Error(
      `Unknown slot "${id}". Known slots:\n  ${SLOTS.map((s) => s.id).join('\n  ')}`,
    );
  }
  return slot;
}
