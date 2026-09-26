import { test, describe } from 'node:test';
import assert from 'node:assert';
import { toLocalDatetimeInputString, fromLocalDatetimeInputString } from '../src/utils/date.js';
import { stripMarkdown } from '../src/utils/excerpt.js';

describe('Date Timezone Preservation & Excerpt Auto-Recalculation Tests', () => {

  test('toLocalDatetimeInputString and fromLocalDatetimeInputString roundtrip without drift', () => {
    const originalDate = new Date('2026-09-26T14:30:00.000Z');
    const localInputStr = toLocalDatetimeInputString(originalDate);
    const convertedIso = fromLocalDatetimeInputString(localInputStr);
    
    const reFormattedLocal = toLocalDatetimeInputString(convertedIso);
    assert.strictEqual(reFormattedLocal, localInputStr, 'Local date representation must not drift on repeated edits');
  });

  test('stripMarkdown updates excerpt correctly when content changes', () => {
    const oldContent = "My bad. Let's drop the game framing entirely. Here are actual cybersecurity project ideas.";
    const oldExcerpt = stripMarkdown(oldContent, 150);
    assert.strictEqual(oldExcerpt.startsWith('My bad.'), true);

    const newContent = "bro im sorry thats my bad. Let's drop the game framing entirely. Here are actual cybersecurity project ideas.";
    const newExcerpt = stripMarkdown(newContent, 150);
    assert.strictEqual(newExcerpt.startsWith('bro im sorry thats my bad.'), true);
    assert.notStrictEqual(newExcerpt, oldExcerpt);
  });

});
