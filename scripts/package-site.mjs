import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const files = ['index.html', 'style.css', 'config.js', 'app.js', 'store.js', 'auth.js', 'access-ui.js', 'ui.js', 'trackers.js', 'schedules.js', 'workflows.js', 'availability.js', 'availability-model.js', 'availability-inventory.json', 'property-plans/central-sydney-floor-1.png', 'property-plans/central-sydney-floor-2.png', 'property-plans/darling-harbour-floor-1.png', 'property-plans/darling-harbour-floor-2.png', 'property-plans/darling-harbour-floor-3.png', 'property-plans/olympic-hotel-floor-1.png', 'property-plans/olympic-hotel-floor-2.png', 'property-plans/potts-point-floor-1.png', ...['barlow-condensed-latin-600-normal.woff2','barlow-condensed-latin-700-normal.woff2','dm-sans-latin-400-normal.woff2','dm-sans-latin-500-normal.woff2','dm-sans-latin-600-normal.woff2','dm-sans-latin-700-normal.woff2','LICENSE-barlow-condensed','LICENSE-dm-sans'].map(name => 'vendor/fonts/' + name), 'favicon.svg', 'vendor/supabase.js', 'vendor/LICENSE-supabase', 'vendor/THIRD-PARTY-NOTICES.txt'];
await mkdir(new URL('property-plans/', output), { recursive: true });
await mkdir(new URL('vendor/fonts/', output), { recursive: true });
for (const file of files) await copyFile(new URL(file, root), new URL(file, output));
await writeFile(new URL('.nojekyll', output), '');
console.log(`Prepared ${files.length + 1} public files in dist/. Nothing deployed.`);
