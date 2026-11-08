import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT, loadLedger, summarize } from '../lib/ledger.js';
import { SLOTS } from '../registry/slots.js';
import { WORK_ROOT, type SlotMetrics } from '../steps/process-slot.js';
import { banner, info, ok, run } from './util.js';

/**
 * Attempt review gallery.
 *
 * Renders a single self-contained HTML file (images inline as data URIs, no fonts, no
 * scripts) so it opens offline from `file://`. The point is to make "which of these six
 * sheets is best" a ten-second decision instead of a file hunt.
 */

interface AttemptView {
  attempt: number;
  selected: boolean;
  score: number;
  usableCells: number;
  totalCells: number;
  paletteDistance: number;
  sizeVariance: number;
  seamError: number;
  cells: { index: number; name: string | null; empty: boolean; dataUri: string }[];
}

interface SlotView {
  id: string;
  title: string;
  status: string;
  attemptsUsed: number;
  selected: number | null;
  attempts: AttemptView[];
}

const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ESCAPE[c] ?? c);
}

async function collect(): Promise<SlotView[]> {
  const ledger = await loadLedger();
  const views: SlotView[] = [];

  for (const slot of SLOTS) {
    const record = ledger.slots[slot.id];
    const slotDir = join(WORK_ROOT, slot.id);
    if (!record || !existsSync(slotDir)) continue;

    const attemptDirs = (await readdir(slotDir))
      .filter((name) => name.startsWith('attempt-'))
      .sort();

    const attempts: AttemptView[] = [];

    for (const dir of attemptDirs) {
      const attemptNumber = Number(dir.replace('attempt-', ''));
      const metricsPath = join(slotDir, dir, 'metrics.json');
      if (!existsSync(metricsPath)) continue;

      const metrics = JSON.parse(await readFile(metricsPath, 'utf8')) as SlotMetrics;

      const cells: AttemptView['cells'] = [];
      for (const cell of metrics.cells) {
        if (cell.empty) continue;
        const pngPath = join(slotDir, dir, `cell-${cell.index}.png`);
        if (!existsSync(pngPath)) continue;
        const png = await readFile(pngPath);
        cells.push({
          index: cell.index,
          name: cell.name,
          empty: false,
          dataUri: `data:image/png;base64,${png.toString('base64')}`,
        });
      }

      attempts.push({
        attempt: attemptNumber,
        selected: record.selected === attemptNumber,
        score: metrics.summary.score,
        usableCells: metrics.summary.usableCells,
        totalCells: metrics.summary.totalCells,
        paletteDistance: metrics.summary.meanPaletteDistance,
        sizeVariance: metrics.summary.sizeVariance,
        seamError: metrics.summary.meanSeamError,
        cells,
      });
    }

    if (attempts.length === 0) continue;

    views.push({
      id: slot.id,
      title: slot.title,
      status: record.status,
      attemptsUsed: record.attempts.filter((a) => a.state !== 'released').length,
      selected: record.selected ?? null,
      attempts: attempts.sort((a, b) => b.score - a.score),
    });
  }

  return views;
}

function renderSlot(slot: SlotView): string {
  const best = slot.attempts[0];

  const attemptCards = slot.attempts
    .map((attempt) => {
      const cells = attempt.cells
        .map(
          (cell) => `
            <figure class="cell">
              <img src="${cell.dataUri}" alt="${esc(cell.name ?? `cell ${cell.index}`)}" />
              <figcaption>${esc(cell.name ?? `cell ${cell.index}`)}</figcaption>
            </figure>`,
        )
        .join('');

      return `
        <article class="attempt ${attempt.selected ? 'selected' : ''}">
          <header>
            <span class="num">attempt ${attempt.attempt}</span>
            ${attempt.selected ? '<span class="tag">SELECTED</span>' : ''}
            ${!attempt.selected && best && attempt.attempt === best.attempt ? '<span class="tag best">BEST</span>' : ''}
            <span class="score">${attempt.score.toFixed(1)}</span>
          </header>
          <dl>
            <dt>cells</dt><dd>${attempt.usableCells}/${attempt.totalCells}</dd>
            <dt>palette</dt><dd>${attempt.paletteDistance.toFixed(1)}</dd>
            <dt>scale</dt><dd>${attempt.sizeVariance.toFixed(2)}</dd>
            <dt>seam</dt><dd>${attempt.seamError.toFixed(1)}</dd>
          </dl>
          <div class="cells">${cells}</div>
          <code>npm run art:select -- --slot ${esc(slot.id)} --attempt ${attempt.attempt}</code>
        </article>`;
    })
    .join('');

  return `
    <section class="slot">
      <h2>${esc(slot.id)} <small>${esc(slot.title)}</small>
        <span class="meta">${slot.attemptsUsed} attempt(s) · ${esc(slot.status)}${
          slot.selected ? ` · picked #${slot.selected}` : ''
        }</span>
      </h2>
      <div class="attempts">${attemptCards}</div>
    </section>`;
}

function renderPage(slots: SlotView[], used: number, limit: number | undefined, unstarted: number): string {
  const usage = limit === undefined ? `${used} image(s) used · no lifetime cap` : `${used}/${limit} images used (${Math.round((used / limit) * 100)}%)`;
  const pct = limit === undefined ? null : Math.round((used / limit) * 100);

  const body =
    slots.length === 0
      ? `<div class="empty">
           <p>No processed attempts yet.</p>
           <p>Run <code>npm run art:claim -- --slot art-01-style-anchor</code>, generate the image,
           then <code>npm run art:process -- --slot art-01-style-anchor</code>.</p>
         </div>`
      : slots.map(renderSlot).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>DEADLANE · attempt review</title>
<style>
  :root {
    --void:#0b0d10; --asphalt:#161a21; --asphalt-2:#232a34; --steel:#3d4753;
    --steel-light:#7a8794; --bone:#c8d2dc; --white:#f2f6f9; --red:#b8452f; --pink:#ff2e63;
  }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:24px; background:var(--void); color:var(--bone);
    font:13px/1.5 ui-monospace, "SF Mono", Menlo, monospace;
  }
  h1 { font-size:18px; letter-spacing:.28em; margin:0 0 4px; color:var(--white); }
  .sub { color:var(--steel-light); margin-bottom:20px; }
  .meter { height:8px; background:var(--asphalt-2); margin:12px 0 4px; }
  .meter > i { display:block; height:100%; background:var(--pink); }
  .slot { margin:36px 0 0; border-top:1px solid var(--asphalt-2); padding-top:16px; }
  h2 { font-size:13px; margin:0 0 14px; color:var(--white); letter-spacing:.08em; }
  h2 small { color:var(--steel-light); font-weight:400; letter-spacing:0; }
  .meta { float:right; color:var(--steel); font-size:11px; letter-spacing:0; }
  .attempts { display:flex; gap:16px; overflow-x:auto; padding-bottom:8px; }
  .attempt { min-width:270px; background:var(--asphalt); padding:12px; border:1px solid var(--asphalt-2); }
  .attempt.selected { border-color:var(--pink); }
  .attempt header { display:flex; align-items:baseline; gap:8px; margin-bottom:8px; }
  .num { color:var(--white); }
  .score { margin-left:auto; font-size:16px; color:var(--pink); }
  .tag { font-size:9px; padding:2px 5px; background:var(--pink); color:var(--void); }
  .tag.best { background:var(--steel); color:var(--bone); }
  dl { display:grid; grid-template-columns:auto 1fr; gap:1px 10px; margin:0 0 10px; font-size:11px; color:var(--steel-light); }
  dd { margin:0; color:var(--bone); }
  .cells { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; }
  .cell { margin:0; text-align:center; }
  .cell img {
    width:100%; image-rendering:pixelated; image-rendering:crisp-edges;
    background:repeating-conic-gradient(#1b2028 0% 25%, #14181f 0% 50%) 50% / 12px 12px;
    border:1px solid var(--asphalt-2);
  }
  .cell figcaption { font-size:9px; color:var(--steel); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  code { display:block; margin-top:10px; font-size:10px; color:var(--steel-light); word-break:break-all; }
  .empty { padding:80px 0; text-align:center; color:var(--steel-light); }
  .zoom button { background:var(--asphalt-2); color:var(--bone); border:1px solid var(--steel); padding:3px 8px; cursor:pointer; }
  .zoom button[aria-pressed="true"] { background:var(--pink); color:var(--void); }
</style>
</head>
<body>
  <h1>DEADLANE</h1>
  <div class="sub">attempt review · ${usage} · ${unstarted} slot(s) unstarted</div>
  ${pct === null ? '' : `<div class="meter"><i style="width:${pct}%"></i></div>`}
  <div class="zoom" style="margin-top:14px">
    zoom:
    <button data-zoom="1" aria-pressed="true">1x</button>
    <button data-zoom="2" aria-pressed="false">2x</button>
    <button data-zoom="4" aria-pressed="false">4x</button>
  </div>
  ${body}
  <script>
    document.querySelectorAll('.zoom button').forEach(function (button) {
      button.addEventListener('click', function () {
        var zoom = Number(button.dataset.zoom);
        document.querySelectorAll('.cell').forEach(function (cell) {
          cell.style.width = (cell.parentElement.clientWidth / 4 - 6) * zoom / zoom + 'px';
        });
        document.querySelectorAll('.cells').forEach(function (grid) {
          grid.style.gridTemplateColumns = 'repeat(' + Math.max(1, Math.round(4 / zoom)) + ', 1fr)';
        });
        document.querySelectorAll('.zoom button').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === button));
        });
      });
    });
  </script>
</body>
</html>`;
}

run(async () => {
  banner('DEADLANE · review gallery');

  const slots = await collect();
  const ledger = await loadLedger();
  const summary = summarize(ledger);

  const html = renderPage(slots, summary.used, summary.limit, summary.unstarted);
  const outDir = join(REPO_ROOT, 'pipeline', 'ui', 'gallery.generated');
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'index.html');
  await writeFile(outPath, html, 'utf8');

  ok(`${slots.length} slot(s) with processed attempts`);
  info(`open: file://${outPath}`);
  info(
    summary.limit === undefined
      ? `ledger: ${summary.used} image(s) used · no lifetime cap`
      : `ledger: ${summary.used}/${summary.limit}`,
  );
});
