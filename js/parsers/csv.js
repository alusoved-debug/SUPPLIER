'use strict';

import { findHeaderRow, detectColumns, parseFilenameMeta } from './detect.js';
import { rowsToFindings } from '../normalize.js';

/**
 * Parse CSV text to findings.
 */
export function parseCsvText(text, filename, folderMeta = {}) {
  const rows = parseCsvRows(text);
  if (!rows.length) return { findings: [], warnings: ['קובץ CSV ריק'] };

  const fileMeta = parseFilenameMeta(filename);
  const meta = {
    supplier: folderMeta.supplier || fileMeta.supplier,
    auditDate: folderMeta.auditDate || fileMeta.auditDate,
    sourceFile: filename,
  };

  const headerIdx = findHeaderRow(rows);
  const mapping = detectColumns(rows[headerIdx]);
  if (Object.keys(mapping).length < 2) {
    return { findings: [], warnings: ['לא זוהו עמודות מתאימות ב-CSV'] };
  }

  const findings = rowsToFindings(rows, headerIdx, mapping, meta);
  return {
    findings,
    warnings: findings.length ? [] : ['לא נמצאו ממצאים ב-CSV'],
  };
}

/**
 * Simple CSV parser with quoted fields support.
 */
function parseCsvRows(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  return lines
    .filter(l => l.trim())
    .map(parseCsvLine);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((c === ',' || c === ';') && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}
