import { test, describe } from 'node:test';
import assert from 'node:assert';
import { escapeNonStandardTags } from '../src/utils/markdown.js';
import { marked } from 'marked';

describe('RichViewer Non-Standard HTML/XML Tag Escaping Test Suite', () => {

  test('Preserves raw XML tags in prose like <path fill="#000000">', () => {
    const input = 'ic_launcher_monochrome.xml previously contained a giant background squircle path (<path fill="#000000">). On Samsung launcher and Android 13+ Material You themed icon mode, Android tinted the full background path with the dark system accent, turning the launcher icon into a solid pitch-black box.';
    const escaped = escapeNonStandardTags(input);
    const parsed = marked.parse(escaped);
    
    assert.strictEqual(escaped.includes('&lt;path fill="#000000"&gt;'), true);
    assert.strictEqual(parsed.includes('Samsung launcher and Android 13+'), true);
    assert.strictEqual(parsed.includes('solid pitch-black box'), true);
  });

  test('Preserves standard HTML tags like <b>, <i>, <a>, <iframe>', () => {
    const input = '<b>Bold text</b> and <i>Italic text</i> and <a href="https://example.com">Link</a> and <iframe src="https://www.youtube.com/embed/123"></iframe>';
    const escaped = escapeNonStandardTags(input);
    
    assert.strictEqual(escaped.includes('<b>Bold text</b>'), true);
    assert.strictEqual(escaped.includes('<i>Italic text</i>'), true);
    assert.strictEqual(escaped.includes('<a href="https://example.com">Link</a>'), true);
    assert.strictEqual(escaped.includes('<iframe src="https://www.youtube.com/embed/123"></iframe>'), true);
  });

  test('Does not mutate code blocks and inline code', () => {
    const input = '```xml\n<path fill="#000000" />\n```\n\nInline code: `<vector android:name="test">`';
    const escaped = escapeNonStandardTags(input);
    const parsed = marked.parse(escaped);
    
    assert.strictEqual(parsed.includes('<code class="language-xml">'), true);
    assert.strictEqual(parsed.includes('&lt;vector android:name=&quot;test&quot;&gt;'), true);
  });

});
