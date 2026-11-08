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

1. **Never call a fal generation tool without claiming first.**
   Run `npm run art:claim -- --slot <slot-id>` and only then call `run_model`.
   There is no lifetime image ceiling and no per-slot attempt cap, but every image still
   needs a claim so `pipeline/budget.json` stays the audit trail. See `pipeline/BUDGET.md`.

2. **Never put a fal key or OAuth token in the repo, in a prompt, or in chat.**
   The fal MCP relay authenticates with OAuth through your editor. There is no
   `FAL_KEY` in this project and there must never be one.

3. **`npm run test`, `npm run typecheck` and `npm run art:validate` must pass before a
   work order is submitted for review.** A reviewer rejects a diff whose verification
   command fails.

4. **Solve the work order; do not refactor what it did not ask about.** There is no file
   whitelist — the implementer changes whatever the fix actually needs — but unrelated
   cleanup, renames and redesigns belong in a separate order.

5. **Do not hand-edit generated artifacts.** `public/assets/atlas/*` and
   `pipeline/budget.json` are produced by scripts. Change the script, then re-run it.

6. **No `any`. No non-null assertions to silence the compiler.** Fix the type.

7. **Commit every round.** The repo is under git. A round that is not committed did not
   happen. See [Commits](#commits).

## The gauntlet loop

All work is dispatched as work orders in `gauntlet/work-orders/`. A single order is
implemented by one fresh agent and reviewed by a different fresh agent.

```
orchestrator  →  implementer (fresh)  →  reviewer (fresh, read-only)  →  verdict
                       ↑                                                  │
                       └────────────── FAIL + feedback ───────────────────┘
```

- The **implementer** gets the work order and nothing else. It decides what to change,
  writes the code, runs the verification command, and returns a short report.
- The **reviewer** gets only the work order, the diff, and the test output. It answers one
  question — does this solve the order without breaking anything? — and never sees the
  implementer's reasoning.
- Maximum **3 rounds per order**. An order that cannot be finished is recorded `escalate`
  and parked; the loop moves on to the rest of the queue and reports escalations when the
  queue drains. One failed order never stops the run.
- The loop stops early only for an **environment** problem (no fal tool, blocked fal
  account, broken build/test baseline) or when nothing is dispatchable.
- **New work is planned, not invented.** Run `/gauntlet-plan`: the planner produces a gap
  list, you discuss it, and once you approve it the planner writes the accepted orders to
  `gauntlet/work-orders/` and `gauntlet/state.json` and commits them. The loop never authors
  orders — only the planner does, and only after your approval. Authoring is its entire write
  surface: no game, pipeline, content or doc file is ever changed by planning.
- The **orchestrator** never reads source files. It reads `gauntlet/state.json` and
  verdict summaries only.
- **The orchestrator is the only agent with fal tools.** Subagents do not have them. For an
  art order the orchestrator runs `npm run art:claim`, makes the single `run_model` call,
  and writes the raw result plus a short evidence file to `/tmp/` as the implementer's
  reference. The implementer then continues at `art:pull`.
- **One command runs the whole queue.** `/gauntlet` in the orchestrator loops
  implement → review → record → commit until the queue drains or an order escalates.

Rationale: agent context grows with the number of verdicts, not with the size of the
codebase, so the loop survives a project of this size.

Commands:

```bash
npm run gauntlet:next              # print the next dispatchable order and its text
npm run gauntlet:record -- --id 07 --verdict pass --note "shipped"
npm run gauntlet:status            # queue, rounds used, escalations
npm run gauntlet:status -- --notes # + the last verdict note for every order
npm run repo:map                   # compact map of the game, content and art state
```

## Context budget

Every agent context is a budget, and the loop re-spends it every round. These are rules:

- **The orchestrator never holds a diff.** `git diff > /tmp/<ID>.round-<r>.diff`, then hand
  the reviewer the path. A diff pasted through two contexts is paid for twice per round and
  again on every later turn of the run.
- **Nothing is pasted that can be a path.** Diffs, verification logs and art evidence live in
  `/tmp`; an agent reads them when it needs them.
- **Read the digest before the tree.** `npm run repo:map` and
  `npm run gauntlet:status -- --notes` answer "what exists" and "what happened" in about
  eighty lines. Answering the same question by reading `src/`, `public/assets/assets.json`
  (53 KB) and `pipeline/registry/slots.ts` (27 KB) costs six figures.
- **Rules attach, they are not fetched.** `.github/instructions/*.instructions.md` carry the
  gameplay, pipeline and test rules and load by path. `AGENTS.md` is documentation — do not
  spend a read on it to find a rule.
- **One copy of a procedure.** An agent file owns the procedure; a prompt file is a trigger
  and a pointer. Two copies drift, and both get paid for.

## Commits

`main` is the trunk and history is linear — no long-lived branches per work order. Commit
as work lands; do not batch a day of work into one drop.
- **One commit per gauntlet round**, made immediately after the verdict is recorded. It
  contains the round's diff, `gauntlet/state.json`, and the new
  `gauntlet/verdicts/<ID>.round-<n>.md`.
- **Subject format:** `<ID> <verdict>: <one line>` — e.g. `WO-13 pass: art slots 03-08`,
  `WO-09a fail: evidence table self-contradictory`.
- **Infrastructure commits** that are not a work order use a conventional prefix:
  `chore:`, `docs:`, `fix:`.
- **Check before staging.** Read `git status` first. Never `git add -A` on a tree you have
  not looked at.
- **Generated artefacts:** `public/assets/atlas/*` and `pipeline/budget.json` are committed
  because they *are* the deliverable. `pipeline/raw/` is never committed.
- **Never commit a credential or a token.** See rule 2.

## Repository map

```
src/                    the game (browser bundle)
  main.ts               Phaser boot + scale config
  config.ts             every tuning constant lives here
  rng.ts                seeded sfc32 PRNG — the only source of randomness
  art/                  procedural placeholder sprites (game runs with zero AI art)
  entities/             player, enemies, civilians, projectiles, pickups
  systems/              road, spawner, audio, challenges
  levels/               LevelBlueprint types, generators, validation
  content/              JSON data tables (enemies, civilians, weapons, challenges)
  scenes/               Boot, Preload, Title, LevelIntro, Game, Hud, GameOver

pipeline/               asset factory (Node, never bundled)
  registry/             pinned model, cached schema, locked palette, slot specs
  cli/                  claim, release, pull, process, select, atlas, validate
  steps/                slice, quantize, score, variants, atlas, validate
  ui/                   attempt review gallery
  budget.json           image ledger (committed, auditable)
  BUDGET.md             how the ledger works and why

gauntlet/               work order queue + verdicts + state
scripts/gauntlet/       state machine enforcement + repo:map digest
docs/                   ART_BIBLE, MCP_SETUP
.github/agents/         orchestrator, implementer, reviewer, planner definitions
.github/prompts/        reusable agent procedures
.github/instructions/   path-scoped rules (gameplay, pipeline, tests) loaded automatically
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
- **Content is data.** Enemies, bosses, civilians, weapons and challenges are JSON tables
  checked by the hand-written schema in `src/content/content.test.ts` — a runtime validator
  would cost bundle bytes to catch what CI catches free. Adding an enemy should not require a
  code change unless it needs a new behaviour.
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
Slots are declared in `pipeline/registry/slots.ts` and are permanent — the 25 slots are
fixed, so re-scoping art means re-allocating within them.

## Do not

- Do not add runtime network calls to the game.
- Do not add an analytics or telemetry dependency.
- Do not commit `pipeline/raw/` (gitignored) — only processed atlas output is committed.
- Do not generate an image without a claim, and do not hand-edit the ledger or the atlas.
