import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT } from './lib';

/**
 * One compact map of the repository, for agents that would otherwise read all of it.
 *
 * A planner that walks `src/`, `public/assets/assets.json` and
 * `pipeline/registry/slots.ts` spends six figures of tokens answering three questions:
 * what exists, what is data, and which sprite ids are still placeholders. This prints the
 * answers in about eighty lines.
 *
 * Everything is derived from files on disk — nothing is cached, nothing is written.
 */

interface SpriteEntry {
  readonly sheet: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface SheetEntry {
  readonly code: string;
  readonly frames: Record<string, unknown>;
  readonly tiles?: readonly string[];
}

interface Manifest {
  readonly generatedAt: string;
  readonly sheets: Record<string, SheetEntry>;
  readonly sprites: Record<string, SpriteEntry>;
}

interface EnemyRow {
  readonly id: string;
  readonly behavior: string;
  readonly art?: string;
}

interface BossRow {
  readonly id: string;
  readonly kind: string;
  readonly levelTypes: readonly string[];
  readonly minAct: number;
  readonly art?: string;
}

interface CivilianRow {
  readonly id: string;
  readonly art?: string;
}

interface WeaponRow {
  readonly id: string;
  readonly slot: string;
}

interface ChallengeRow {
  readonly kind: string;
}

async function readText(path: string): Promise<string> {
  return readFile(resolve(REPO_ROOT, path), 'utf8');
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readText(path)) as T;
}

function lineCount(source: string): number {
  return source === '' ? 0 : source.split('\n').length;
}

/** Directories under `dir`, in name order. */
async function subdirs(dir: string): Promise<string[]> {
  const entries = await readdir(resolve(REPO_ROOT, dir), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** `.ts` files directly inside `dir`, tests excluded, sorted, without the extension. */
async function tsModules(dir: string): Promise<string[]> {
  const entries = await readdir(resolve(REPO_ROOT, dir), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    .map((entry) => entry.name.replace(/\.ts$/, ''))
    .sort();
}

/** Every `.ts` file under `dir`, recursively, as repo-relative paths. */
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(resolve(REPO_ROOT, dir), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await walk(child)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(child);
  }
  return out;
}

/**
 * Source with comments removed, strings intact.
 *
 * Needed because `src/art/ids.ts` documents cell layouts in block comments that contain
 * paths like `pipeline/work/<slot>/attempt-1/...`, and those must not read as sprite ids.
 */
function stripComments(source: string): string {
  let out = '';
  let quote: '"' | "'" | '`' | null = null;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source.charAt(i);
    const next = source.charAt(i + 1);

    if (quote !== null) {
      out += ch;
      if (ch === '\\') {
        out += next;
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source.charAt(i) !== '\n') i += 1;
      out += '\n';
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source.charAt(i) === '*' && source.charAt(i + 1) === '/')) i += 1;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    out += ch;
  }

  return out;
}

/** `a/b` string literals — the shape every sprite id in this repo has. */
function artIdsIn(source: string): string[] {
  const ids: string[] = [];
  for (const match of source.matchAll(/(['"])([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)\1/g)) {
    const id = match[2];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

function quoted(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/'([^']*)'|"([^"]*)"/g)) {
    const value = match[1] ?? match[2];
    if (value !== undefined) out.push(value);
  }
  return out;
}

/** `LEVEL_TYPES` as declared in `src/levels/types.ts`, read without importing Phaser. */
async function levelTypes(): Promise<string[]> {
  const source = await readText('src/levels/types.ts');
  const declaration = /LEVEL_TYPES\s*=\s*\[([^\]]*)\]/.exec(source);
  return declaration?.[1] === undefined ? [] : quoted(declaration[1]);
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

async function main(): Promise<void> {
  const manifest = await readJson<Manifest>('public/assets/assets.json');
  const { enemies } = await readJson<{ enemies: readonly EnemyRow[] }>('src/content/enemies.json');
  const { bosses } = await readJson<{ bosses: readonly BossRow[] }>('src/content/bosses.json');
  const { civilians } = await readJson<{ civilians: readonly CivilianRow[] }>('src/content/civilians.json');
  const { weapons } = await readJson<{ weapons: readonly WeaponRow[] }>('src/content/weapons.json');
  const { challenges } = await readJson<{ challenges: readonly ChallengeRow[] }>(
    'src/content/challenges.json',
  );

  const sources = (await walk('src')).filter((path) => !path.endsWith('.test.ts'));
  const tests = (await walk('src')).filter((path) => path.endsWith('.test.ts'));
  const e2e = (await walk('e2e')).map((path) => path.replace(/^e2e\//, '').replace(/\.ts$/, ''));

  const referenced = new Set<string>();
  let gameplayLines = 0;
  for (const path of sources) {
    const text = await readText(path);
    gameplayLines += lineCount(text);
    for (const id of artIdsIn(stripComments(text))) referenced.add(id);
  }

  const areas: string[] = [];
  for (const dir of await subdirs('src')) {
    const modules = await tsModules(`src/${dir}`);
    areas.push(`${dir} ${modules.length}${modules.length > 0 ? `: ${modules.join(' ')}` : ''}`);
  }

  console.log(`\n\x1b[1mDEADLANE · repo map\x1b[0m`);
  console.log(`  src/ ${sources.length} files · ${gameplayLines} lines · manifest ${manifest.generatedAt}`);
  console.log(`  verified by \`npm run typecheck && npm run test\`; regenerate with \`npm run repo:map\``);

  console.log(`\n\x1b[1mGAMEPLAY\x1b[0m`);
  for (const area of areas) console.log(`  ${area}`);

  console.log(`\n\x1b[1mLEVEL TYPES\x1b[0m ${(await levelTypes()).join(' · ')}`);

  /** `art✓` real frame · `NO ART <id>` declared but absent · blank when nothing is declared. */
  const resolved = (id: string | undefined): string => {
    if (id === undefined) return '';
    return manifest.sprites[id] === undefined ? `\x1b[33mNO ART ${id}\x1b[0m` : 'art✓';
  };

  console.log(`\n\x1b[1mCONTENT\x1b[0m  (data tables — adding a row needs no code)`);
  console.log(
    `  enemies ${enemies.length}: ` +
      enemies.map((row) => `${row.id}·${row.behavior} ${resolved(row.art)}`).join('  '),
  );
  console.log(
    `  bosses ${bosses.length}: ` +
      bosses
        .map((row) => `${row.id}·${row.kind}·[${row.levelTypes.join(',')}]·act${row.minAct} ${resolved(row.art)}`)
        .join('  '),
  );
  console.log(
    `  civilians ${civilians.length}: ` + civilians.map((row) => `${row.id} ${resolved(row.art)}`).join('  '),
  );
  console.log(`  weapons ${weapons.length}: ` + weapons.map((row) => `${row.id}·${row.slot}`).join('  '));
  console.log(`  challenges ${challenges.length}: ` + challenges.map((row) => row.kind).join('  '));

  const sheets = Object.entries(manifest.sheets);
  const sprites = Object.keys(manifest.sprites);
  console.log(
    `\n\x1b[1mART\x1b[0m  ${sheets.length} sheets · ${sprites.length} sprite ids in the manifest`,
  );
  console.log('  ' + sheets.map(([slot, sheet]) => `${slot} ${Object.keys(sheet.frames).length}`).join(' · '));

  const missing = [...referenced].filter((id) => manifest.sprites[id] === undefined).sort();
  const byPrefix = new Map<string, string[]>();
  for (const id of missing) {
    const prefix = id.slice(0, id.indexOf('/'));
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), id.slice(prefix.length + 1)]);
  }
  console.log(
    `  ids referenced in src/: ${referenced.size} · ${referenced.size - missing.length} resolved · ` +
      `${missing.length} absent`,
  );
  for (const [prefix, ids] of [...byPrefix].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`    ${pad(prefix + '/', 16)}${ids.join(' ')}`);
  }
  console.log(
    '  absent ids are usually alternates in `src/art/ids.ts` — `Art` takes the next\n' +
      '  candidate, so they only matter when every candidate for a kind is absent.',
  );

  const declared = [...enemies, ...bosses, ...civilians]
    .map((row) => row.art)
    .filter((id): id is string => id !== undefined);
  const unresolved = declared.filter((id) => manifest.sprites[id] === undefined);
  console.log(
    `  content art fields: ${declared.length} declared · ${declared.length - unresolved.length} resolved · ` +
      `${unresolved.length} falling back to a placeholder` +
      (unresolved.length === 0 ? '' : ` (${unresolved.map((id) => id).join(' ')})`),
  );

  console.log(`\n\x1b[1mTESTS\x1b[0m  ${tests.length} unit files · ${e2e.length} e2e specs`);
  console.log(`  ${tests.map((path) => path.replace(/^src\//, '').replace(/\.test\.ts$/, '')).join(' · ')}`);
  console.log(`  e2e: ${e2e.join(' · ')}`);
  console.log('');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
