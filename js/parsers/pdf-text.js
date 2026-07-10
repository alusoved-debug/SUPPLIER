'use strict';

import { parseEvaluation, isCompliantEvaluation, normalizeDate } from './detect.js';
import { createFinding } from '../normalize.js';

const EVAL_WORD = '(?:תקין|מתאים|נמצא\\s*מתאים|מינורי|מהותי|לא\\s*מתאים)';

/** Group PDF document pages into text lines by Y position. */
export async function extractLinesFromPdf(pdf) {
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const groups = new Map();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(item);
    }
    for (const y of [...groups.keys()].sort((a, b) => b - a)) {
      const text = groups.get(y)
        .sort((a, b) => a.transform[4] - b.transform[4])
        .map(i => i.str).join(' ')
        .replace(/\s+/g, ' ').trim();
      if (text.length > 1) lines.push(text);
    }
  }
  return lines;
}

/** Parse lines from IAI Hebrew audit PDFs (RTL + LTR column layouts). */
export function parseIaiHebrewLines(lines, meta) {
  const findings = [];

  for (const line of lines) {
    if (line.length > 350) continue;
    if (/^(סיכום|KASET|לתעשייה|www\.iai|הספק יציג|הצגת מערכת)/i.test(line)) continue;

    const parsed = parseRtlEvaluationLine(line) || parseLtrEvaluationLine(line);
    if (!parsed) continue;

    findings.push(createFinding({ ...meta, ...parsed }));
  }
  return findings;
}

/** RTL: "x מהותי ...text... V 8.4.2 9" or "X לא מתאים ... 3.4" */
function parseRtlEvaluationLine(line) {
  const m = line.match(new RegExp(`^(?:[Xx]\\s+)?(${EVAL_WORD})\\.?\\s*(.+)$`, 'i'));
  if (!m) return null;

  const evaluation = m[1].replace(/\s+/g, ' ').trim();
  if (isCompliantEvaluation(evaluation) || /^תקין$/i.test(evaluation)) return null;

  const severity = parseEvaluation(evaluation);
  if (!severity) return null;

  let body = m[2].trim().replace(/^\.\s*/, '');

  // Question number at end: "5" or "3.4" or "8.4.2 9" → take last number group
  let questionId = '';
  const endNum = body.match(/\s+(\d+(?:\.\d+)*)\s*$/);
  if (endNum) {
    questionId = endNum[1];
    body = body.slice(0, endNum.index).trim();
  }

  // Remove trailing "V 8.4.2" section marker
  body = body.replace(/\s+V\s+[\d.]+(?:\s+[\d.]+)?\s*$/i, '').trim();

  const secM = body.match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
  const questionText = secM ? secM[1] : questionId;
  const findingText = (body && body.length >= 4)
    ? body
    : (questionText ? `סעיף ${questionText} — ${evaluation}` : evaluation);

  if (findingText.length < 2) return null;
  return { questionId, questionText, findingText, severity };
}

/** LTR: "5 8.2.2 V ...text... מינורי x" */
function parseLtrEvaluationLine(line) {
  const evalRe = new RegExp(`(${EVAL_WORD})\\s*[Xx]?\\s*$`, 'i');
  const evalMatch = line.match(evalRe);
  if (!evalMatch) return null;

  const evaluation = evalMatch[1].replace(/\s+/g, ' ').trim();
  if (isCompliantEvaluation(evaluation) || /^תקין$/i.test(evaluation)) return null;

  const severity = parseEvaluation(evaluation);
  if (!severity) return null;

  const mainM = line.match(/^(\d{1,2})\s+([\d.]+)\s*(?:V|v|N\s*\/\s*A|NA)?\s*(.*)$/i);
  if (mainM) {
    let body = mainM[3].replace(evalRe, '').trim();
    body = body.replace(/\s+(V|v|N\s*\/\s*A)\s+/g, ' ').trim();
    return {
      questionId: mainM[1],
      questionText: mainM[2],
      findingText: body || mainM[2],
      severity,
    };
  }

  const subM = line.match(/^(\d+\.\d+)\s+(.+)$/);
  if (subM) {
    return {
      questionId: subM[1],
      questionText: subM[1],
      findingText: subM[2].replace(evalRe, '').trim() || subM[1],
      severity,
    };
  }
  return null;
}

/** Parse lines from English KASET audit PDFs. */
export function parseKasetEnglishLines(lines, meta) {
  const findings = [];
  if (!lines.some(l => /KASET|AS9100|Supplier Type/i.test(l))) return findings;

  for (const line of lines) {
    if (line.length > 400) continue;
    const majorM = line.match(/^[\d#.\s,]+?\s+X\s+(.{15,})$/i);
    if (majorM) {
      const txt = majorM[1].trim();
      if (!/^(Page|KASET|Report|Audit|Sep\.)/i.test(txt)) {
        const secM = line.match(/(\d+(?:\.\d+)+)/);
        findings.push(createFinding({
          ...meta,
          questionId: secM ? secM[1] : '',
          questionText: line.split(/\s+X\s+/)[0].trim().slice(0, 80),
          findingText: txt.slice(0, 500),
          severity: 'major',
        }));
      }
    }
  }
  return findings;
}

export function extractSupplier(text, filename) {
  const fromFile = cleanSupplierFromFilename(filename);
  const fromText = extractSupplierFromText(text);

  if (fromText && !isSupplierCode(fromText) && fromText.length > 4) return fromText;
  if (fromFile && fromFile.length > 2) return fromFile;
  return fromText || fromFile;
}

function extractSupplierFromText(text) {
  const patterns = [
    /יחידה\s*נסקרת\s+(.+?)\s+קוד\s*ספק/i,
    /שם\s*ספק\s+(.+?)\s+קוד\s*ספק/i,
    /Supplier\s*Name\s+(.+?)(?:\s+Supplier\s*Type|\s+Address)/i,
    /(מסד\s*זילבר\s*תעשיה\s*מכנית[^\n.]{0,30})/i,
    /(א\s*\.\s*ת\s*\.\s*הנדסת\s*מערכות[^\n.]{0,25})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const name = m[1].replace(/\s+/g, ' ').trim().slice(0, 80);
      if (name.length > 2 && !isSupplierCode(name)) return name;
    }
  }
  return null;
}

export function isSupplierCode(s) {
  const t = String(s).trim();
  return /^[A-Z]{1,4}\d{2,6}$/i.test(t) || /^I[A-Z]?\d+$/i.test(t);
}

export function cleanSupplierFromFilename(filename) {
  let name = filename
    .replace(/\s*\(\d+\)\.pdf$/i, '')
    .replace(/\.pdf$/i, '');

  // Known patterns from filenames
  const known = [
    [/^דוח\s*מבדק\s+(.+)$/i, 1],
    [/^סיכום\s*מבדק\s+(.+)$/i, 1],
    [/^דוח\s*תיקוף\s*תהליך\s*מיוחד\s*[-–]\s*(.+)$/i, 1],
    [/^דוח\s*ממצאי\s*מבדק\s*הסמכה\s+(.+?)\s+\d{2}[-./]\d{2}[-./]\d{4}/i, 1],
    [/^מבדק\s*השלמה\s*.*ל[-–]?\s*(.+?)\s+\d{2}[-./]\d{2}[-./]\d{4}/i, 1],
    [/^Quality System Supplier Audit Report\s*[-–]\s*(.+)$/i, 1],
    [/^Winkelmann\s*-\s*Audit Report/i, () => 'Winkelmann'],
  ];
  for (const [re, g] of known) {
    const m = name.match(re);
    if (m) return typeof g === 'function' ? g() : m[g].trim();
  }

  return name
    .replace(/\s+\d{1,2}[-./]\d{1,2}[-./]\d{2,4}\s*$/g, '')
    .trim() || null;
}

export function extractDate(text) {
  const patterns = [
    /תאריך\s*מבדק\s+(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i,
    /Audit\s*Date\s+(\d{1,2}[./-]\d{1,2}(?:\s*[-–]\s*\d{1,2}[./-]\d{1,2})?[./-]?\d{0,4})/i,
    /בתאריך\s+(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i,
    /(\d{1,2}[./]\d{1,2}[./]\d{4})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return normalizeDate(m[1].split(/\s*[-–]\s*/)[0]) || null;
  }
  return null;
}

export function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter(f => {
    const key = `${f.questionId}|${f.severity}|${f.findingText.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseAllPdfLines(lines, meta) {
  let findings = parseIaiHebrewLines(lines, meta);
  findings = findings.concat(parseKasetEnglishLines(lines, meta));
  return dedupeFindings(findings);
}
