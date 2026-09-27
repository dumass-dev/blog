// -------------------------------------------------------------------
// FIX 3: COOP and COEP headers in vercel.json
// Reads vercel.json and asserts both headers are present with the
// correct values. No Express server needed — this is a static config test.
// -------------------------------------------------------------------
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(__dirname, '../vercel.json'), 'utf8'));

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) { console.log(`  [PASS] ${name}`); passed++; }
  else           { console.error(`  [FAIL] ${name}`); failed++; }
}

console.log('=== FIX 3: COOP + COEP HEADERS IN vercel.json ===\n');

const globalHeaders = config.headers?.[0]?.headers ?? [];
const byKey = Object.fromEntries(globalHeaders.map(h => [h.key, h.value]));

// COOP
assert(byKey['Cross-Origin-Opener-Policy'] !== undefined, 'Cross-Origin-Opener-Policy header is present');
assert(byKey['Cross-Origin-Opener-Policy'] === 'same-origin', 'COOP value is "same-origin"');

// COEP
assert(byKey['Cross-Origin-Embedder-Policy'] !== undefined, 'Cross-Origin-Embedder-Policy header is present');
assert(byKey['Cross-Origin-Embedder-Policy'] === 'credentialless',
  `COEP value is "credentialless" (not require-corp, which would break B2/Google Fonts) — got: ${byKey['Cross-Origin-Embedder-Policy']}`);

// Existing headers still intact (regression)
assert(byKey['Strict-Transport-Security']?.startsWith('max-age=31536000'), 'HSTS still present');
assert(byKey['X-Frame-Options'] === 'DENY', 'X-Frame-Options still present');
assert(byKey['Content-Security-Policy'] !== undefined, 'CSP still present');
assert(byKey['X-Content-Type-Options'] === 'nosniff', 'X-Content-Type-Options still present');
assert(byKey['Referrer-Policy'] !== undefined, 'Referrer-Policy still present');
assert(byKey['Permissions-Policy'] !== undefined, 'Permissions-Policy still present');

console.log(`\n==================================================`);
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log(`==================================================\n`);
process.exit(failed > 0 ? 1 : 0);
