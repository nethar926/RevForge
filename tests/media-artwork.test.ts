import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MEDIA_ARTWORK_SIZES,mediaArtwork,mediaArtworkPath,mediaMetadataFields} from '../src/forge/mediaActions.ts';
const root=new URL('../',import.meta.url);
const pngSize=(path:string)=>{const b=readFileSync(new URL(path,root));assert.equal(b.subarray(1,4).toString('latin1'),'PNG',path);return [b.readUInt32BE(16),b.readUInt32BE(20)];};
test('media artwork lists static RevForge PNGs at 96/192/512, then the SVG last',()=>{
 const art=mediaArtwork('https://example.test/RevForge/#/drive');
 assert.deepEqual(art.map(a=>a.sizes),['96x96','192x192','512x512','96x96 192x192 512x512']);
 assert.deepEqual(art.map(a=>a.type),['image/png','image/png','image/png','image/svg+xml']);
 assert.deepEqual(art.map(a=>a.src),[
  'https://example.test/RevForge/icons/revforge-96.png','https://example.test/RevForge/icons/revforge-192.png',
  'https://example.test/RevForge/icons/revforge-512.png','https://example.test/RevForge/favicon.svg']);
 for(const a of art){assert.ok(!a.src.startsWith('data:'),a.src);assert.ok(!/DS|drivesynth/i.test(a.src),a.src);}
 assert.deepEqual(mediaMetadataFields('V8',false,art).artwork,art);
});
test('artwork resolves under a preview sub-path',()=>{
 const art=mediaArtwork('https://nethar926.github.io/RevForge/preview/media-session/index.html#/drive');
 assert.equal(art[2].src,'https://nethar926.github.io/RevForge/preview/media-session/icons/revforge-512.png');
 assert.equal(art.at(-1)?.src,'https://nethar926.github.io/RevForge/preview/media-session/favicon.svg');
});
test('favicon.svg is the vector RevForge mark (no DS, no <text>)',()=>{
 const svg=readFileSync(new URL('public/favicon.svg',root),'utf8');
 assert.ok(!svg.includes('DS'));assert.ok(!/<text\b/.test(svg));assert.match(svg,/<path\b/);assert.match(svg,/#e0a24a/i);
});
test('static icon PNGs are committed at their declared sizes',()=>{
 for(const s of MEDIA_ARTWORK_SIZES)assert.deepEqual(pngSize(`public/${mediaArtworkPath(s)}`),[s,s]);
 assert.deepEqual(pngSize('public/icons/apple-touch-icon.png'),[180,180]);
 assert.match(readFileSync(new URL('index.html',root),'utf8'),/<link rel="apple-touch-icon" sizes="180x180" href="\/icons\/apple-touch-icon.png" \/>/);
});
