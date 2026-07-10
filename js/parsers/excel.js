'use strict';

import { findHeaderRow, detectColumns, parseFilenameMeta, normalizeDate } from './detect.js';
import { rowsToFindings } from '../normalize.js';

const SUPPORTED = new Set(['.xlsx', '.xls', '.csv', '.docx', '.pdf']);

/**
 * Parse Excel workbook ArrayBuffer.
 */
export function parseExcelBuffer(buffer, filename, folderMeta = {}) {
  if (typeof XLSX === 'undefined') throw new Error('SheetJS לא נטען');
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const fileMeta = parseFilenameMeta(filename);
  const meta = {
    supplier: folderMeta.supplier || fileMeta.supplier,
    auditDate: folderMeta.auditDate || fileMeta.auditDate,
    sourceFile: filename,
  };

  let allFindings = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    if (!rows.length) continue;

    const headerIdx = findHeaderRow(rows);
    const mapping = detectColumns(rows[headerIdx]);
    if (Object.keys(mapping).length < 2) continue;

    const sheetMeta = { ...meta };
    if (!sheetMeta.supplier && wb.SheetNames.length > 1 && !looksLikeGenericSheet(sheetName)) {
      sheetMeta.supplier = sheetName.trim();
    }

    const findings = rowsToFindings(rows, headerIdx, mapping, sheetMeta);
    allFindings = allFindings.concat(findings);
  }

  // Scan first rows for supplier/date metadata
  if (wb.SheetNames.length) {
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
    const extraMeta = extractSheetMeta(rows.slice(0, 15));
    allFindings = allFindings.map(f => ({
      ...f,
      supplier: f.supplier === 'לא ידוע' || !f.supplier ? (extraMeta.supplier || meta.supplier || f.supplier) : f.supplier,
      auditDate: f.auditDate || extraMeta.auditDate || meta.auditDate,
    }));
  }

  return { findings: allFindings, warnings: allFindings.length ? [] : ['לא נמצאו ממצאים — בדוק מבנה עמודות'] };
}

function looksLikeGenericSheet(name) {
  return /^(sheet|גיליון|data|table|table\d+)$/i.test(name.trim());
}

function extractSheetMeta(rows) {
  const meta = { supplier: null, auditDate: null };
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (let i = 0; i < row.length - 1; i++) {
      const label = String(row[i] || '').toLowerCase();
      const val = String(row[i + 1] || '').trim();
      if (!val) continue;
      if (/supplier|ספק|vendor|company|חברה/.test(label) && !meta.supplier) meta.supplier = val;
      if (/date|תאריך|audit/.test(label) && !meta.auditDate) meta.auditDate = normalizeDate(val);
    }
  }
  return meta;
}

export { SUPPORTED };
