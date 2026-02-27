import { copyFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '../dist/sandbox/main.js');
const dst = join(process.env.HOME, '.minion/pi-runtime/sandbox-main.js');

mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`Copied sandbox entry to ${dst}`);
