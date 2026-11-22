import { readFile, readdir } from 'node:fs/promises';
import { extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { build } from 'esbuild';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
};
const assets = {};
const files = [
  'index.html', 'sw.js', 'version.json', 'manifest-live.webmanifest',
  'push/onesignal/OneSignalSDKWorker.js',
  'icon-clean-192.png', 'icon-clean-512.png', 'logo.png',
  'file_00000000e77081fd8cf8ee8349e461b6.png',
  ...(await readdir('dist/assets')).sort().map(name => 'assets/' + name),
];
for (const name of files) {
  let bytes = await readFile('dist/' + name);
  if (name === 'logo.png' || name.startsWith('file_')) {
    bytes = await sharp(bytes).resize({ width: 320, withoutEnlargement: true }).png().toBuffer();
  }
  const type = types[extname(name)];
  if (!type) throw Error('Unknown asset type: ' + name);
  assets['/' + name] = [type, gzipSync(bytes).toString('base64')];
}
await build({
  stdin: {
    contents: (await readFile('staging/qa-worker.mjs', 'utf8')).replace(
      "import { assets } from './.qa-assets.mjs';",
      'const assets = ' + JSON.stringify(assets) + ';',
    ),
    resolveDir: new URL('../staging/', import.meta.url).pathname,
  },
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: 'dist/qa-worker.mjs',
});
