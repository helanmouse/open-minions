import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '../dist');
const runtimeDir = join(process.env.HOME, '.minion/pi-runtime');

// Preserve dist/ directory structure so relative imports work inside the container
const files = [
  { src: 'sandbox/main.js', dst: 'sandbox/main.js' },
  { src: 'sandbox/prompts.js', dst: 'sandbox/prompts.js' },
  { src: 'sandbox/journal.js', dst: 'sandbox/journal.js' },
  { src: 'sandbox/tools/deliver-patch.js', dst: 'sandbox/tools/deliver-patch.js' },
  { src: 'sandbox/tools/coding.js', dst: 'sandbox/tools/coding.js' },
  { src: 'llm/provider-aliases.js', dst: 'llm/provider-aliases.js' },
  { src: 'types/shared.js', dst: 'types/shared.js' },
];

for (const f of files) {
  const srcPath = join(dist, f.src);
  const dstPath = join(runtimeDir, f.dst);
  mkdirSync(dirname(dstPath), { recursive: true });
  copyFileSync(srcPath, dstPath);
  console.log(`Copied ${f.dst} → ${dstPath}`);
}
