import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  extractLinesFromPdf,
  parseAllPdfLines,
  extractSupplier,
  extractDate,
} from '../js/parsers/pdf-text.js';
import { summarizeAll, getDefaultConfig } from '../js/scoring.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../דוחות ממצאים');
let all = [];

for (const name of readdirSync(dir).filter(f => f.endsWith('.pdf'))) {
  const buf = readFileSync(join(dir, name));
  const pdf = await getDocument({ data: new Uint8Array(buf) }).promise;
  const lines = await extractLinesFromPdf(pdf);
  const text = lines.join('\n');
  const meta = {
    supplier: extractSupplier(text, name),
    auditDate: extractDate(text),
    sourceFile: name,
  };
  const findings = parseAllPdfLines(lines, meta);
  console.log(name, '→', meta.supplier, '|', meta.auditDate, '|', findings.length, 'findings');
  findings.forEach(f => console.log(' ', f.severity, f.questionId, f.findingText.slice(0, 55)));
  all.push(...findings.map(f => ({ ...f, supplier: meta.supplier || f.supplier })));
}

console.log('\n--- Summary ---');
summarizeAll(all, getDefaultConfig()).forEach(s =>
  console.log(s.supplier, 'score', s.score, s.rating.label, 'M'+s.majorCount, 'm'+s.minorCount)
);
