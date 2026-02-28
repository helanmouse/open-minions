import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distSandbox = join(__dirname, '../dist/sandbox');
const runtimeDir = join(process.env.HOME, '.minion/pi-runtime');

const files = [
  { src: 'main.js', dst: 'sandbox-main.js' },
  { src: 'prompts.js', dst: 'prompts.js' },
  { src: 'journal.js', dst: 'journal.js' },
  { src: 'tools/deliver-patch.js', dst: 'tools/deliver-patch.js' },
];

for (const f of files) {
  const srcPath = join(distSandbox, f.src);
  const dstPath = join(runtimeDir, f.dst);
  mkdirSync(dirname(dstPath), { recursive: true });
  copyFileSync(srcPath, dstPath);
  console.log(`Copied ${f.src} → ${dstPath}`);
}
