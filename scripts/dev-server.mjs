import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const shared = !process.argv.includes('--demo');
const demo = process.argv.includes('--demo');
if (process.argv.includes('--shared') && demo) throw new Error('Choose demo or shared mode, not both.');
const sample = demo ? createRequire(import.meta.url)(process.env.WORKFLOW_PREVIEW === 'true' ? '../tests/workflow-fixtures.cjs' : '../tests/fixtures.cjs')() : null;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const files = new Set(['index.html', 'style.css', 'app.js', 'auth.js', 'access-ui.js', 'ui.js', 'trackers.js', 'schedules.js', 'workflows.js', 'availability.js', 'availability-model.js', 'availability-inventory.json', 'property-plans/central-sydney-floor-1.png', 'property-plans/central-sydney-floor-2.png', 'property-plans/darling-harbour-floor-1.png', 'property-plans/darling-harbour-floor-2.png', 'property-plans/darling-harbour-floor-3.png', 'property-plans/olympic-hotel-floor-1.png', 'property-plans/olympic-hotel-floor-2.png', 'property-plans/potts-point-floor-1.png', ...['barlow-condensed-latin-600-normal.woff2','barlow-condensed-latin-700-normal.woff2','dm-sans-latin-400-normal.woff2','dm-sans-latin-500-normal.woff2','dm-sans-latin-600-normal.woff2','dm-sans-latin-700-normal.woff2'].map(name => 'vendor/fonts/' + name), 'vendor/supabase.js', 'store.js', 'config.js', 'favicon.svg']);
const server = http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!['GET', 'HEAD'].includes(req.method) || !files.has(name)) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = name === 'config.js' && !shared
      ? 'window.FORMA_CONFIG = ' + JSON.stringify({ preview: demo }) + ';' + (demo ? `try { if (!localStorage.getItem('azzurro-board-v2')) localStorage.setItem('azzurro-board-v2', ${JSON.stringify(JSON.stringify(sample))}); } catch {}` : '')
      : await readFile(new URL(name, root));
    res.writeHead(200, { 'Content-Type': `${types[name.slice(name.lastIndexOf('.'))]} ; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => {
  console.log(`Workspace: http://127.0.0.1:${server.address().port} (${shared ? 'shared Supabase' : demo ? 'demo with sample data' : 'local preview only'})`);
  console.log(`Serving ${fileURLToPath(root)}`);
});
