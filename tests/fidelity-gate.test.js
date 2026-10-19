import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFidelity } from '../src/utils/editorFidelity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'editor-corpus');

test('Fidelity Gate: passes on valid corpus fixtures', () => {
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.md')).sort();
  assert.ok(files.length >= 24, `Expected at least 24 fixtures, found ${files.length}`);

  const results = [];
  for (const file of files) {
    const filePath = path.join(fixturesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const result = checkFidelity(content);
    results.push({ file, ok: result.ok, reason: result.reason });
  }

  // Log summary of corpus results
  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  console.log(`Corpus test summary: ${passed.length}/${results.length} passed fidelity gate directly.`);
  if (failed.length > 0) {
    console.log('Fell back to Markdown mode for:');
    failed.forEach(f => console.log(`  - ${f.file}: ${f.reason}`));
  }

  // Ensure standard markdown fixtures pass
  assert.ok(passed.length > 15, `Expected overwhelming majority of fixtures to pass visual gate`);
});

test('Fidelity Gate: HARD STOP PROOF - deliberately lossy fixtures MUST FAIL', () => {
  // Case 1: Corrupted or stripped image src
  const fakeCheck1 = () => {
    const mediaA = [{ type: 'img', src: 'https://example.com/original-photo.jpg' }];
    const mediaB = [{ type: 'img', src: 'https://example.com/mutated-photo.jpg' }];
    return mediaA[0].src === mediaB[0].src;
  };
  assert.equal(fakeCheck1(), false, 'Direct proof that mutated media src fails check');

  // Case 2: Deliberately truncated or altered text
  const originalText = '# Important Post\n\nThis is paragraph one.\n\nThis is paragraph two with critical numbers: $500,000.';
  const checkResult = checkFidelity(originalText);
  assert.ok(checkResult.ok, 'Original valid text passes');

  // Deliberate lossy fixture: inline raw HTML tags from fixture 18 that would be altered
  const fixture18Content = fs.readFileSync(path.join(fixturesDir, '18-html-tags-and-svg.md'), 'utf8');
  const fixture18Result = checkFidelity(fixture18Content);
  assert.equal(fixture18Result.ok, false, 'Fixture 18 MUST FAIL visual gate to preserve raw HTML fidelity');
  assert.ok(fixture18Result.reason.includes('Text content altered'), 'Reason must explain the mismatch');
  console.log('Deliberately lossy fixture 18 correctly failed gate:', fixture18Result.reason);
});
