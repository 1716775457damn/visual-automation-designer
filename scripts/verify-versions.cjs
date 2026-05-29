/**
 * Version Consistency Validator
 *
 * Verifies that package.json, Cargo.toml, and tauri.conf.json
 * all declare the same version number before a build is allowed.
 *
 * Usage: node scripts/verify-versions.js
 * Exit code: 0 if all match, 1 if any mismatch
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function readLine(filePath, pattern) {
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (pattern.test(trimmed)) {
      const match = trimmed.match(pattern);
      return match ? match[1] : null;
    }
  }
  return null;
}

// Read versions
const pkg = readJson(path.join(ROOT, 'package.json'));
const cargoVersion = readLine(
  path.join(ROOT, 'src-tauri', 'Cargo.toml'),
  /^version\s*=\s*"([^"]+)"/
);
const tauriConf = readJson(path.join(ROOT, 'src-tauri', 'tauri.conf.json'));

const versions = {
  'package.json': pkg.version,
  'Cargo.toml': cargoVersion,
  'tauri.conf.json': tauriConf.version,
};

// Report
console.log('\n=== Version Consistency Check ===\n');

let allMatch = true;
let previous = null;

for (const [source, version] of Object.entries(versions)) {
  const status = version ? 'OK' : 'MISSING';
  const marker = version === undefined || version === null ? '‼' : '✓';
  console.log(`  ${marker} ${source.padEnd(20)} ${version ?? '(not found)'}`);

  if (previous !== null && version !== previous) {
    allMatch = false;
  }
  previous = version;
}

console.log('');

if (allMatch) {
  console.log('  ✅ All versions match:', previous);
  process.exit(0);
} else {
  console.error('  ❌ Version mismatch detected!');
  console.error('     All three files must declare the same version.');
  process.exit(1);
}
