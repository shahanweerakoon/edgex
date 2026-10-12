/**
 * Build and Verification Script for Facebook Lead Collector (Microsoft Edge MV3).
 * Validates manifest.json, copies all runtime files into dist/, and verifies the output package.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

console.log('--- Building Facebook Lead Collector ---');

// 1. Read & Validate manifest.json
const manifestPath = path.join(rootDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('ERROR: manifest.json not found in root directory.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`✓ Validated manifest.json (v${manifest.version})`);

// 2. Check all referenced files exist in src
const filesToCheck = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  manifest.icons?.['16'],
  manifest.icons?.['32'],
  manifest.icons?.['48'],
  manifest.icons?.['128'],
  ...(manifest.content_scripts?.[0]?.js || []),
  ...(manifest.content_scripts?.[0]?.css || [])
].filter(Boolean);

for (const relFile of filesToCheck) {
  const fullPath = path.join(rootDir, relFile);
  if (!fs.existsSync(fullPath)) {
    console.error(`ERROR: Referenced file "${relFile}" in manifest.json does not exist at "${fullPath}".`);
    process.exit(1);
  }
}
console.log(`✓ All ${filesToCheck.length} manifest-referenced files exist`);

// 3. Clean and recreate dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 4. Copy manifest and src to dist
fs.copyFileSync(manifestPath, path.join(distDir, 'manifest.json'));
copyDirSync(path.join(rootDir, 'src'), path.join(distDir, 'src'));

console.log('✓ Successfully copied manifest and src/ to dist/');

// 5. Verify dist output
const distManifest = path.join(distDir, 'manifest.json');
if (!fs.existsSync(distManifest)) {
  console.error('ERROR: dist/manifest.json failed to generate.');
  process.exit(1);
}

console.log('✓ Build verification passed!');
console.log('\nReady to install in Microsoft Edge:');
console.log('1. Open Microsoft Edge and navigate to edge://extensions');
console.log('2. Turn on "Developer mode" toggle in left sidebar');
console.log('3. Click "Load unpacked" button');
console.log(`4. Select either "${distDir}" or the project root "${rootDir}"`);
