# AGENTS.md — DEADLANE

Instructions for any AI agent (or human) working in this repository. Read this before
editing anything. These rules are enforced by scripts, not just by convention.

## What this project is

DEADLANE is a top-down, vertically auto-scrolling pixel-art highway intercept game that
runs in the browser. Phaser 3 + TypeScript + Vite, built to static files and deployed to
GitHub Pages under `/deadlane/`.

Two halves, deliberately separated:

| Half | Lives in | Runtime | Talks to AI? |
| --- | --- | --- | --- |
| The game | `src/` | Browser | **Never** |
| The asset factory | `pipeline/` | Local Node | Only through the fal MCP server |

The shipped game makes zero AI calls. It is deterministic, static, free to host, and
works offline once loaded.

## Hard rules

1. **Never call a fal generation tool without claiming budget first.**
   Run `npm run art:claim -- --slot <slot-id>` and only then call `run_model`.
   The lifetime ceiling is **80 images**. See `pipeline/BUDGET.md`.

2. **Never put a fal key or OAuth token in the repo, in a prompt, or in chat.**
   The fal MCP relay authenticates with OAuth through your editor. There is no
   `FAL_KEY` in this project and there must never be one.

3. **`npm run test`, `npm run typecheck` and `npm run art:validate` must pass before a
   work order is submitted for review.** A reviewer rejects a diff whose verification
   command fails.

4. **Only touch files listed in the work order's `files:` whitelist.** Touching anything
   else is an automatic review failure.

5. **Do not hand-edit generated artifacts.** `public/assets/atlas/*` and
   `pipeline/budget.json` are produced by scripts. Change the script, then re-run it.

6. **No `any`. No non-null assertions to silence the compiler.** Fix the type.

## The gauntlet loop

All work is dispatched as work orders in `gauntlet/work-orders/`. A single order is
implemented by one fresh agent and reviewed by a different fresh agent.

```
orchestrator  →  implementer (fresh)  →  reviewer (fresh, read-only)  →  verdict
                       ↑                                                  │
                       └──────────── FAIL + numbered issues ───────────────┘
```

- The **implementer** gets the work order, its file whitelist, and at most two reference
  files. It writes code, runs the verification command, and returns a short report.
- The **reviewer** gets only the work order, the unified diff, and the test output. It
  never sees the implementer's reasoning.
- Maximum **3 rounds**. Then the order is escalated to the human.
- The **orchestrator** never reads source files. It reads `gauntlet/state.json` and
  verdict summaries only.

Rationale: agent context grows with the number of verdicts, not with the size of the
codebase, so the loop survives a project of this size.

Commands:

```bash
npm run gauntlet:next              # print the next dispatchable order + context bundle
npm run gauntlet:record -- --id 07 --verdict pass --note "shipped"
npm run gauntlet:status            # queue, rounds used, escalations
```

## Repository map

```
src/                    the game (browser bundle)
  main.ts               Phaser boot + scale config
  config.ts             every tuning constant lives here
  rng.ts                seeded sfc32 PRNG — the only source of randomness
  art/                  procedural placeholder sprites (game runs with zero AI art)
  entities/             player, enemies, civilians, projectiles, pickups
  systems/              road, spawning, weapons, score, audio, challenges
  levels/               LevelBlueprint types, generators, validation
  content/              JSON data tables (enemies, civilians, weapons, challenges)
  scenes/               Boot, Preload, Title, LevelIntro, Game, Hud, GameOver

pipeline/               asset factory (Node, never bundled)
  registry/             pinned model, cached schema, locked palette, slot specs
  cli/                  claim, release, pull, process, select, atlas, validate
  steps/                slice, quantize, score, variants, atlas, validate
  ui/                   attempt review gallery
  budget.json           80-image ledger (committed, auditable)
  BUDGET.md             how the budget works and why

gauntlet/               work order queue + verdicts + state
scripts/gauntlet/       state machine enforcement
docs/                   ART_BIBLE, LEVEL_DESIGN
.github/agents/         orchestrator, implementer, reviewer definitions
.github/prompts/        reusable agent procedures
e2e/                    Playwright smoke tests
```

## Conventions

- **Units are pixels.** Internal resolution is 640×360. Tiles are 32×32, vehicles 64×64.
  Never scale by fractional amounts in gameplay code; let Phaser's `Scale.FIT` handle the
  display.
- **All game randomness goes through `src/rng.ts`.** `Math.random()` in gameplay code is a
  review failure, because it breaks seed reproducibility.
- **Level generation returns data, not objects.** Generators return a `LevelBlueprint`;
  the scene turns blueprints into sprites. This keeps generation unit-testable and keeps
  Phaser out of the generators.
- **Content is data.** Enemies, civilians, weapons and challenges are JSON tables validated
  against schemas in `src/content/schema.ts`. Adding an enemy should not require a code
  change unless it needs a new behaviour.
- **Art is data too.** Every sprite the game draws is looked up by id in
  `public/assets/assets.json`. If an id is missing, `src/art/placeholder.ts` draws a
  deterministic stand-in. A failed image slot must never block gameplay.

## Adding things

**New enemy** (usually no code):
1. Add an entry to `src/content/enemies.json` with an existing `behavior` id.
2. `npm run test` — the schema test will validate it.
3. If it needs a new behaviour, add the class in `src/entities/behaviors/` and register it
   in `behaviors/index.ts`.

**New level type**:
1. Add a `LevelType` to `src/levels/types.ts`.
2. Implement a generator in `src/levels/generators/`, register it in `levels/index.ts`.
3. `npm run test` runs the 1,000-seed validation suite for every registered level type.
   It must pass before the generator is considered done.

**New art slot**: see `pipeline/BUDGET.md` and `.github/prompts/art-slot.prompt.md`.
Slots are declared in `pipeline/registry/slots.ts` and are permanent — the 20 slots are
fixed, so re-scoping art means re-allocating within them.

## Do not

- Do not add runtime network calls to the game.
- Do not add an analytics or telemetry dependency.
- Do not commit `pipeline/raw/` (gitignored) — only processed atlas output is committed.
- Do not raise the 80-image ceiling or the 6-attempt cap without the human explicitly
  saying so in the conversation.
