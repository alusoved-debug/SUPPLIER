'use strict';

import { classifyCategory } from './categories.js';
import { parseSeverity, parseEvaluation, isCompliantEvaluation, isNoFinding, normalizeDate, cellStr } from './parsers/detect.js';

/**
 * @typedef {Object} Finding
 * @property {string} supplier
 * @property {string|null} auditDate
 * @property {string} questionId
 * @property {string} questionText
 * @property {string} findingText
 * @property {'major'|'minor'} severity
 * @property {string} category
 * @property {string} sourceFile
 */

/**
 * Build a normalized finding object.
 */
export function createFinding(partial) {
  const text = partial.findingText || partial.questionText || '';
  return {
    supplier: String(partial.supplier || 'לא ידוע').trim(),
    auditDate: partial.auditDate || null,
    questionId: String(partial.questionId || '').trim(),
    questionText: String(partial.questionText || '').trim(),
    findingText: String(partial.findingText || '').trim(),
    severity: partial.severity,
    category: partial.category || classifyCategory(text),
    sourceFile: partial.sourceFile || '',
  };
}

/**
 * Merge metadata defaults into findings array.
 */
export function applyMeta(findings, meta) {
  return findings.map(f => createFinding({
    ...f,
    supplier: f.supplier && f.supplier !== 'לא ידוע' ? f.supplier : (meta.supplier || f.supplier),
    auditDate: f.auditDate || meta.auditDate || null,
    sourceFile: f.sourceFile || meta.sourceFile || '',
  }));
}

/**
 * Group findings by supplier name.
 */
export function groupBySupplier(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = f.supplier || 'לא ידוע';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(f);
  }
  return map;
}

/**
 * Parse rows from tabular data using column mapping.
 */
export function rowsToFindings(rows, headerRowIdx, mapping, meta) {
  const findings = [];
  const hasEvaluation = mapping.evaluation != null;

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => c == null || String(c).trim() === '')) continue;

    const get = (field) => cellStr(row, mapping[field]);

    const questionText = get('question');
    const questionId = get('questionId');
    const evaluationRaw = get('evaluation');
    const findingText = get('finding');
    const severityRaw = get('severity');

    let severity = null;

    // Primary: "הערכה" column (מתאים / לא מתאים / מינורי / מהותי)
    if (hasEvaluation && evaluationRaw) {
      if (isCompliantEvaluation(evaluationRaw)) continue;
      severity = parseEvaluation(evaluationRaw);
    }

    // Fallback: separate severity / major-minor column
    if (!severity && severityRaw) severity = parseSeverity(severityRaw);

    if (!severity) {
      const combined = `${findingText} ${questionText} ${evaluationRaw}`;
      if (/\bmajor\b|משמעותי|עיקרי|מהות/i.test(combined)) severity = 'major';
      else if (/\bminor\b|משני|קל|מינור/i.test(combined)) severity = 'minor';
      else if (/לא\s*מתא/i.test(combined)) severity = 'major';
    }

    if (!severity) continue;

    // Build finding text
    let text = findingText;
    if (!text || isNoFinding(text)) {
      if (questionText) {
        text = evaluationRaw && !isCompliantEvaluation(evaluationRaw)
          ? `${questionText} — ${evaluationRaw}`
          : questionText;
      } else {
        text = evaluationRaw;
      }
    }

    if (isNoFinding(text) && isCompliantEvaluation(evaluationRaw)) continue;

    const dateRaw = get('auditDate');
    findings.push(createFinding({
      supplier: get('supplier') || meta.supplier,
      auditDate: normalizeDate(dateRaw) || meta.auditDate,
      questionId,
      questionText,
      findingText: text,
      severity,
      sourceFile: meta.sourceFile,
    }));
  }

  return applyMeta(findings, meta);
}
