import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { markdownToHtmlUnsanitized } from '../src/utils/entryMarkdown.js';

describe('Phase 1 - Byte-identical rendering extraction across corpus', () => {
  const corpusDir = path.resolve('tests/fixtures/editor-corpus');
  const files = fs.readdirSync(corpusDir).filter(f => f.endsWith('.md')).sort();

  test(`Corpus fixtures exist (found ${files.length})`, () => {
    assert.strictEqual(files.length >= 24, true, 'At least 24 fixtures expected');
  });

  for (const file of files) {
    test(`Fixture: ${file} renders deterministically`, () => {
      const filePath = path.join(corpusDir, file);
      const markdown = fs.readFileSync(filePath, 'utf8');

      const out1 = markdownToHtmlUnsanitized(markdown);
      const out2 = markdownToHtmlUnsanitized(markdown);

      assert.strictEqual(typeof out1, 'string');
      assert.strictEqual(out1, out2, `Output for ${file} must be 100% deterministic`);
      assert.strictEqual(Buffer.byteLength(out1, 'utf8') > 0, true);
    });
  }
});
