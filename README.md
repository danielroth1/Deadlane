# DEADLANE

A top-down pixel-art highway intercept game for the browser. You drive an interceptor
down an endless road, hunt Division convoys, dodge civilian traffic, and try not to run
out of armour.

Built with Phaser 3 + TypeScript + Vite. Deployed to GitHub Pages. The shipped game makes
**no network calls** and runs entirely from static files.

<p align="center">
  <img alt="DEADLANE" src="https://img.shields.io/badge/status-playable-ff2e63?style=flat-square" />
  <img alt="Phaser 3" src="https://img.shields.io/badge/phaser-3-8a4fff?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-strict-3178c6?style=flat-square" />
  <img alt="art budget" src="https://img.shields.io/badge/art%20budget-150%20images-232a34?style=flat-square" />
</p>

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

| Input | Action |
| --- | --- |
| `←` `→` / `A` `D` / drag | Steer |
| `↑` / `W` | Accelerate |
| `↓` / `S` | Brake |
| `Space` / click | Machine gun |
| `X` | Oil slick |
| `Shift` | Smoke screen |
| `Esc` | Pause |
| `M` | Toggle mute (saved between runs) |

Replay a specific run with `?seed=12345`.

Scoring: a kill pays a fixed reward from `config.ts`; shooting civilian traffic destroys
it for a bigger penalty than clipping it; enemy fire costs armour, never score.

## How it is built

Two halves, deliberately separated:

| | `src/` | `pipeline/` |
| --- | --- | --- |
| Runs in | the browser | local Node |
| Talks to AI | never | only through the fal MCP server |
| Output | static bundle | sprite sheets + a budget ledger |

### Levels are generated, not authored

Generators turn a seed into a `LevelBlueprint` — pure data describing road width, traffic,
encounters, props and challenges. The scene streams that blueprint into sprites. Because the
blueprint has no Phaser in it, the test suite runs **1,000 seeds per level type** and
asserts the road is always passable, nothing spawns on top of the player, no wave blocks
every lane, and every challenge can complete.

Five level types: `highway`, `canyon`, `river`, `city`, `tunnel`. Adding a sixth is a
`LEVEL_TYPES` entry plus a profile row — the generator, the validation matrix and the tests
pick it up automatically.

### Art has a 150-image budget

Every image costs money, so the pipeline spends it only on **composition**. Scale, palette,
outlines, recolours, damage states and every animation frame are produced deterministically
in code.

```bash
npm run art:status                  # used/150, per-slot attempts
npm run art:claim -- --slot <id>    # reserve an image, print the exact run_model call
npm run art:process -- --slot <id>  # slice, quantise, score
npm run art:select -- --slot <id>   # pick the best attempt
npm run art:atlas                   # repack the game assets
```

Twenty fixed slots, one ledger, a 150-image ceiling. Full rules in
[`pipeline/BUDGET.md`](pipeline/BUDGET.md); the visual contract in
[`docs/ART_BIBLE.md`](docs/ART_BIBLE.md).

fal MCP connection and token recovery: [`docs/MCP_SETUP.md`](docs/MCP_SETUP.md).

**The game is fully playable with zero generated art.** `src/art/placeholders.ts` draws
palette-correct stand-ins, so a failed image slot degrades quality, never features.

### Work happens in gauntlet rounds

Every unit of work is a work order in `gauntlet/work-orders/`, implemented by one fresh
agent and reviewed by a different fresh agent that sees only the diff.

```bash
npm run gauntlet:next      # next dispatchable order + its context bundle
npm run gauntlet:record -- --id 07 --verdict pass --note "shipped"
npm run gauntlet:status
```

The orchestrator reads verdicts, never source. That is what keeps a project this size
inside a single agent's context. See [`AGENTS.md`](AGENTS.md).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Typecheck + production bundle |
| `npm run typecheck` | TypeScript, strict |
| `npm run test` | Unit tests (includes the 5,000-level matrix) |
| `npm run test:e2e` | Playwright smoke against the production build |
| `npm run art:validate` | Assert generated art is in-palette, correctly sized, tiles wrap |
| `npm run lint` | ESLint |

## Deploying

`main` deploys to GitHub Pages via `.github/workflows/deploy.yml`. The Vite `base` defaults
to `/deadlane/`; set the repository variable `DEADLANE_BASE` to override it (use `/` for a
custom domain).

Enable Pages in the repository settings with **Source: GitHub Actions**.

## License

Code is unlicensed and private. The name and art direction are original; no assets from any
existing game are used or referenced.
