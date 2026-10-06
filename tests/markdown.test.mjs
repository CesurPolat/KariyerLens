import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownMessage } from "../src/content/components/MarkdownMessage.tsx";

const render = (content) => renderToStaticMarkup(createElement(MarkdownMessage, { content }));

test("assistant markdown renders headings, inline formatting, lists, code and GFM", () => {
  const html = render("## SQL\n\n**Güçlü** ve *önemli*, ~~eski~~.\n\n- SQL\n- ERP\n\n1. Hazırlık\n\n> Öneri\n\n`SELECT`\n\n```sql\nSELECT * FROM jobs;\n```\n\n| Alan | Değer |\n| --- | --- |\n| SQL | Gerekli |\n\n- [x] Hazır\n\n[Kaynak](https://www.kariyer.net/)");
  for (const pattern of [/<h2>SQL<\/h2>/, /<strong>Güçlü<\/strong>/, /<em>önemli<\/em>/, /<del>eski<\/del>/,
    /<ul>/, /<ol>/, /<blockquote>/, /<code>SELECT<\/code>/, /<pre><code class="language-sql">/,
    /class="markdown-table"><table>/, /<input[^>]*disabled=""[^>]*checked=""/, /target="_blank" rel="noopener noreferrer"/]) assert.match(html, pattern);
});

test("raw HTML and unsafe links cannot create executable content", () => {
  const html = render('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n<iframe src="https://evil.test"></iframe>\n\n[Click](javascript:alert%281%29)\n\n[Data](data:text/html,bad)\n\n[File](file:///private)\n\n**Safe**');
  assert.doesNotMatch(html, /<script|<img|<iframe|onerror=|href=|javascript:|data:text|file:\/\//);
  assert.match(html, /<strong>Safe<\/strong>/);
});

test("Markdown images render only alt text and code stays escaped", () => {
  const html = render('![Şirket logosu](https://evil.test/tracker.png)\n\n```html\n<script>alert(1)</script>\n```');
  assert.match(html, /Şirket logosu/);
  assert.doesNotMatch(html, /<img|evil\.test|<script/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("footnotes retain their readable content", () => {
  const html = render('SQL gerekli.[^1]\n\n[^1]: İlan açıklaması.');
  assert.match(html, /İlan açıklaması/);
  assert.match(html, /data-footnotes/);
});
