/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js') && f !== 'ux-polish.test.js')
  .sort();

console.log(`Running ${testFiles.length} offline test files sequentially...\n`);

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  const result = spawnSync('node', ['--test', filePath], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, PORT: '3999' }
  });

  const passed = result.status === 0;
  if (passed) {
    totalPassed++;
    console.log(`PASS: ${file}`);
  } else {
    totalFailed++;
    failures.push({ file, stdout: result.stdout, stderr: result.stderr });
    console.log(`FAIL: ${file}`);
  }
}

console.log('\n========================================');
console.log(`SUMMARY: ${totalPassed} passed, ${totalFailed} failed out of ${testFiles.length} files.`);
console.log('========================================\n');

if (failures.length > 0) {
  console.log('Failures detail:');
  for (const f of failures) {
    console.log(`--- ${f.file} ---`);
    console.log(f.stdout || f.stderr);
  }
}
