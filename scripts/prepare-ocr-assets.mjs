import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tesseractRoot = path.dirname(require.resolve('tesseract.js/package.json'));
const languageRoot = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
const tesseractRequire = createRequire(path.join(tesseractRoot, 'package.json'));
const coreRoot = path.dirname(tesseractRequire.resolve('tesseract.js-core/package.json'));
const output = path.resolve('public', 'ocr');

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'core'), { recursive: true });
await mkdir(path.join(output, 'lang'), { recursive: true });
await copyFile(path.join(tesseractRoot, 'dist', 'worker.min.js'), path.join(output, 'worker.min.js'));
for (const file of await readdir(coreRoot)) {
  if (/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(file)) await copyFile(path.join(coreRoot, file), path.join(output, 'core', file));
}
await copyFile(path.join(languageRoot, '4.0.0', 'eng.traineddata.gz'), path.join(output, 'lang', 'eng.traineddata.gz'));
console.log('Prepared self-hosted OCR worker, cores, and English language data.');
