'use strict';

import { detectColumns, parseFilenameMeta, parseSeverity, isNoFinding, normalizeDate, parseEvaluation, isCompliantEvaluation } from './detect.js';
import { createFinding, applyMeta, rowsToFindings } from '../normalize.js';

/**
 * Parse Word .docx ArrayBuffer via mammoth.
 */
export async function parseWordBuffer(buffer, filename, folderMeta = {}) {
  if (typeof mammoth === 'undefined') throw new Error('mammoth.js לא נטען');

  const fileMeta = parseFilenameMeta(filename);
  const meta = {
    supplier: folderMeta.supplier || fileMeta.supplier,
    auditDate: folderMeta.auditDate || fileMeta.auditDate,
    sourceFile: filename,
  };

  const warnings = [];
  let findings = [];

  const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = htmlResult.value || '';
  warnings.push(...(htmlResult.messages || []).map(m => m.message));

  findings = findings.concat(parseHtmlTables(html, meta));

  const textResult = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = textResult.value || '';
  meta.supplier = meta.supplier || extractMetaFromText(text, 'supplier');
  meta.auditDate = meta.auditDate || extractMetaFromText(text, 'date');

  if (!findings.length) {
    findings = parseFreeTextFindings(text, meta);
    if (findings.length) warnings.push('Word: ניתוח טקסט חופשי (לא טבלה)');
  }

  findings = applyMeta(findings, meta);
  return {
    findings,
    warnings: findings.length ? warnings : [...warnings, 'לא נמצאו ממצאים ב-Word'],
  };
}

function parseHtmlTables(html, meta) {
  const findings = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');

  for (const table of tables) {
    const rows = [...table.querySelectorAll('tr')].map(tr =>
      [...tr.querySelectorAll('th,td')].map(c => c.textContent.trim())
    );
    if (rows.length < 2) continue;

    let headerIdx = 0;
    let bestMap = {};
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const m = detectColumns(rows[i]);
      if (Object.keys(m).length > Object.keys(bestMap).length) {
        bestMap = m;
        headerIdx = i;
      }
    }
    if (Object.keys(bestMap).length < 2) continue;
    findings.push(...rowsToFindings(rows, headerIdx, bestMap, meta));
  }
  return findings;
}

function parseFreeTextFindings(text, meta) {
  const findings = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const majorMatch = line.match(/(?:major|משמעותי|עיקרי|מהותי|ממצא עיקרי|לא מתאים)\s*[:\-–]?\s*(.+)/i);
    const minorMatch = line.match(/(?:minor|משני|קל|מינורי|ממצא משני)\s*[:\-–]?\s*(.+)/i);
    if (majorMatch) {
      findings.push(createFinding({
        ...meta,
        findingText: majorMatch[1].trim(),
        questionText: lines[i - 1]?.match(/^\d+[\.)]/) ? lines[i - 1] : '',
        severity: 'major',
      }));
    } else if (minorMatch) {
      findings.push(createFinding({
        ...meta,
        findingText: minorMatch[1].trim(),
        questionText: lines[i - 1]?.match(/^\d+[\.)]/) ? lines[i - 1] : '',
        severity: 'minor',
      }));
    }
  }
  return findings;
}

function extractMetaFromText(text, type) {
  const lines = text.split(/\r?\n/);
  for (const line of lines.slice(0, 30)) {
    if (type === 'supplier') {
      const m = line.match(/(?:supplier|vendor|ספק|חברה)\s*[:\-–]\s*(.+)/i);
      if (m) return m[1].trim();
    }
    if (type === 'date') {
      const m = line.match(/(?:audit date|date|תאריך(?: מבדק)?)\s*[:\-–]\s*(.+)/i);
      if (m) return normalizeDate(m[1].trim());
    }
  }
  return null;
}
