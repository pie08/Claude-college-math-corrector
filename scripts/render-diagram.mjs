// Renders app-diagram.svg to app-diagram.png (run: npm run diagram).
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// sharp is a dependency of the grading server workspace.
const sharp = createRequire(path.join(root, 'services/api/package.json'))('sharp');

const svg = await readFile(path.join(root, 'app-diagram.svg'));
await sharp(svg, { density: 144 }).png().toFile(path.join(root, 'app-diagram.png'));
console.log('Wrote app-diagram.png');
