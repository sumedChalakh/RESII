import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

console.log('[RESII Extension Build] Assembling distribution bundle...');

ensureDir(distDir);

// 1. Copy manifest.json
copyFile(path.join(rootDir, 'manifest.json'), path.join(distDir, 'manifest.json'));

// 2. Copy popup assets
copyFile(path.join(rootDir, 'src', 'popup', 'index.html'), path.join(distDir, 'popup', 'index.html'));
copyFile(path.join(rootDir, 'src', 'popup', 'popup.css'), path.join(distDir, 'popup', 'popup.css'));

// 3. Create dummy icons if they don't exist
const iconsDir = path.join(distDir, 'icons');
ensureDir(iconsDir);
for (const size of [16, 48, 128]) {
  const iconPath = path.join(iconsDir, `icon${size}.png`);
  if (!fs.existsSync(iconPath)) {
    // 1x1 transparent PNG buffer
    const dummyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(iconPath, dummyPng);
  }
}

// 4. Bundle TypeScript modules via esbuild for seamless MV3 ES module resolution
console.log('[RESII Extension Build] Compiling and bundling TypeScript modules with esbuild...');
const esbuildCmd = 'npx --prefix web esbuild';
execSync(`${esbuildCmd} extension/src/background/service-worker.ts --bundle --format=esm --outfile=extension/dist/background/service-worker.js`, { stdio: 'inherit' });
execSync(`${esbuildCmd} extension/src/content/index.ts --bundle --outfile=extension/dist/content/index.js`, { stdio: 'inherit' });
execSync(`${esbuildCmd} extension/src/popup/popup.ts --bundle --outfile=extension/dist/popup/popup.js`, { stdio: 'inherit' });

console.log('[RESII Extension Build] Bundle ready in extension/dist/');
