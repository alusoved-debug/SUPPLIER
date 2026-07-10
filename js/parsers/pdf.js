'use strict';

import { applyMeta } from '../normalize.js';
import {
  extractLinesFromPdf,
  parseAllPdfLines,
  extractSupplier,
  extractDate,
} from './pdf-text.js';

let pdfjsLib = null;

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
  return pdfjsLib;
}

export async function parsePdfBuffer(buffer, filename, folderMeta = {}) {
  const lib = await getPdfJs();
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const meta = {
    supplier: folderMeta.supplier || null,
    auditDate: null,
    sourceFile: filename,
  };

  const pdf = await lib.getDocument({ data }).promise;
  const lines = await extractLinesFromPdf(pdf);
  const fullText = lines.join('\n');

  meta.supplier = meta.supplier || extractSupplier(fullText, filename);
  meta.auditDate = extractDate(fullText);

  let findings = parseAllPdfLines(lines, meta);
  findings = applyMeta(findings, meta);

  const warnings = findings.length
    ? ['PDF: נותח לפי מבנה דוח תע"א / KASET']
    : ['PDF: לא זוהו ממצאים — ייתכן שמבנה הדוח שונה'];

  return { findings, warnings };
}
