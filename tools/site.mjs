import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '_site');
const files = ['index.html', 'styles.css', 'runtime.bundle.js', 'editor.bundle.js',
  'vanta-forge.html', 'aether-relay-game.html', 'LICENSE'];
for (const name of files) await fs.access(path.join(root, name));
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const name of files) await fs.copyFile(path.join(root, name), path.join(output, name));
await fs.cp(path.join(root, 'src'), path.join(output, 'src'), { recursive: true });
await fs.writeFile(path.join(output, '.nojekyll'), '');
let commit = process.env.GITHUB_SHA || 'local';
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
await fs.writeFile(path.join(output, 'version.json'), JSON.stringify({ product: 'Vanta Forge', version: '1.0.0', commit }, null, 2) + '\n');
console.log('Staged GitHub Pages application in _site/ (' + commit + ')');
