/**
 * Bundle index.html + style.css + all JS modules → standalone.html
 * Usage: node scripts/build-single.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const JS_FILES = [
  'js/categories.js',
  'js/parsers/detect.js',
  'js/normalize.js',
  'js/parsers/pdf-text.js',
  'js/parsers/excel.js',
  'js/parsers/csv.js',
  'js/parsers/word.js',
  'js/parsers/pdf.js',
  'js/folder.js',
  'js/scoring.js',
  'js/report.js',
  'js/ui.js',
  'js/main.js',
];

function stripModuleSyntax(code) {
  return code
    .replace(/^import\s+(?:\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s+from\s+['"][^'"]+['"];?\s*/gm, '')
    .replace(/^export\s*\{[^}]+\};?\s*$/gm, '')
    .replace(/^export\s+(async\s+)?function\s+/gm, '$1function ')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+/gm, '');
}

const css = readFileSync(join(root, 'style.css'), 'utf8');
let html = readFileSync(join(root, 'index.html'), 'utf8');

const js = JS_FILES.map(f => {
  const code = stripModuleSyntax(readFileSync(join(root, f), 'utf8'));
  return `\n// --- ${f} ---\n${code}`;
}).join('\n');

html = html
  .replace('<link rel="stylesheet" href="style.css">', `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="js/main.js"></script>',
    `<script type="module">\n${js}\n</script>`,
  );

const out = join(root, 'standalone.html');
writeFileSync(out, html, 'utf8');

const bundled = html.match(/<script type="module">\n([\s\S]*)\n<\/script>/)?.[1] || '';
const fns = [...bundled.matchAll(/^function (\w+)/gm)].map(x => x[1]);
const dup = [...new Set(fns.filter((n, i) => fns.indexOf(n) !== i))];
if (dup.length) {
  console.error('Build error: duplicate functions in bundle:', dup.join(', '));
  process.exit(1);
}

console.log(`Built ${out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
