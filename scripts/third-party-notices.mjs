// Regenerates public/THIRD_PARTY_NOTICES.txt (copied to dist/ by Vite) from the installed packages' own license files.
// Bundled set = npm packages found in the production build's sourcemaps (react, react-dom, scheduler, react-router,
// maplibre-gl, maplibre-contour) + maplibre-gl's runtime deps (prebuilt into its dist) + code vendored inside
// maplibre-contour's dist (d3-contour, vt-pbf, pbf, tslib helpers, feross/buffer). Usage: node scripts/third-party-notices.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const nm = path.join(root, 'node_modules');
const LIC = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

const find = (name, from) => {
  for (let d = from; ; d = path.dirname(d)) {
    const q = path.join(d, 'node_modules', name, 'package.json');
    if (fs.existsSync(q)) return q;
    if (d === root || d === path.dirname(d)) return null;
  }
};
const entries = new Map();
const add = (name, from = root, via) => {
  const q = find(name, from);
  if (!q) throw new Error(`missing ${name}`);
  const dir = path.dirname(q), p = JSON.parse(fs.readFileSync(q, 'utf8'));
  const key = `${p.name}@${p.version}`;
  if (entries.has(key)) return { dir, p };
  const f = fs.readdirSync(dir).find((x) => LIC.test(x));
  entries.set(key, { name: p.name, version: p.version, license: p.license, via, text: f ? fs.readFileSync(path.join(dir, f), 'utf8').trim() : null, author: p.author });
  return { dir, p };
};
const tree = (name, from, via) => {
  const { dir, p } = add(name, from, via);
  for (const d of Object.keys(p.dependencies ?? {})) if (!d.startsWith('@types/')) tree(d, dir, via ?? name);
};

for (const n of ['react', 'react-dom', 'scheduler', 'react-router']) add(n);
tree('maplibre-gl');
add('maplibre-contour'); // its LICENSE also carries d3-contour (ISC) and vt-pbf (MIT)

const MIT = (who) => `The MIT License (MIT)\n\nCopyright (c) ${who}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.`;
for (const e of entries.values()) if (!e.text && e.license === 'MIT') e.text = MIT(typeof e.author === 'string' ? e.author : e.author?.name ?? `${e.name} authors`);

// Vendored inside maplibre-contour's dist (not separate npm packages in the bundle).
const pbfDir = path.join(nm, 'pbf');
const vendored = [
  { name: 'pbf (vendored in maplibre-contour)', license: 'BSD-3-Clause', text: fs.readFileSync(path.join(pbfDir, 'LICENSE'), 'utf8').trim() },
  { name: 'buffer by feross (vendored in maplibre-contour via pbf)', license: 'MIT', text: MIT('Feross Aboukhadijeh, and other contributors.') },
  { name: 'tslib helpers (vendored in maplibre-contour)', license: '0BSD', text: fs.readFileSync(path.join(nm, 'tslib', 'LICENSE.txt'), 'utf8').trim() },
];

const bar = '='.repeat(79);
const out = [
  'RevForge: third-party software notices',
  '',
  'This app includes the open-source software listed below. Each component is',
  'used under its license, reproduced in full below.',
  '',
  'Fonts: the bundled fonts (Antonio, B612, Barlow Semi Condensed, DSEG, FT Aurebesh,',
  'Oswald, VT323) are used under the SIL Open Font License 1.1; their copyright',
  'notices and license texts ship alongside this file in fonts/OFL-*.txt.',
  '',
];
for (const e of [...[...entries.values()].sort((a, b) => a.name.localeCompare(b.name)), ...vendored]) {
  out.push(bar, `${e.name}${e.version ? ` ${e.version}` : ''}  (${e.license.replace(/^\((.*)\)$/, "$1")})${e.via ? `  [dependency of ${e.via}, included in its prebuilt bundle]` : ''}`, bar, '', e.text ?? `License: ${e.license}`, '');
}
fs.writeFileSync(path.join(root, 'public', 'THIRD_PARTY_NOTICES.txt'), out.join('\n'));
console.log(`wrote ${entries.size + vendored.length} notices`);
