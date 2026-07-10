'use strict';

/** Column field aliases — Hebrew + English */
export const FIELD_ALIASES = {
  supplier: [
    'ספק', 'שם ספק', 'שם הספק', 'vendor', 'supplier', 'supplier name',
    'company', 'organization', 'ארגון', 'חברה', 'supplier company',
  ],
  auditDate: [
    'תאריך מבדק', 'תאריך', 'תאריך ביקורת', 'audit date', 'date', 'inspection date',
    'audit_date', 'review date', 'תאריך בדיקה',
  ],
  questionId: [
    'מס', 'מספר', 'מס\'', '#', 'id', 'no', 'num', 'clause', 'סעיף', 'קוד',
    'question no', 'item', 'ref',
  ],
  question: [
    'שאלה', 'דרישה', 'requirement', 'question', 'clause text', 'סעיף',
    'audit question', 'checklist item', 'נושא', 'תיאור דרישה', 'criteria',
    'פריט', 'נקודת ביקורת', 'item description',
  ],
  evaluation: [
    'הערכה', 'ערכה', 'evaluation', 'assessment', 'rating', 'result',
    'תוצאה', 'ציון', 'grade', 'score', 'conformance', 'עמידה', 'מסקנה',
    'תשובה', 'response', 'answer',
  ],
  finding: [
    'ממצא', 'finding', 'observation', 'nc', 'non conformance', 'nonconformance',
    'הערה', 'comment', 'remarks', 'remark', 'issue', 'deficiency', 'פער',
    'תיאור ממצא', 'finding description', 'nc description',
    'הערות', 'פירוט', 'הערות מבדק', 'notes', 'details', 'תיאור', 'description',
  ],
  severity: [
    'חומרה', 'severity', 'classification', 'class', 'דרגה', 'רמה', 'level',
    'grade', 'priority', 'nc class', 'finding type', 'סוג ממצא', 'סיווג',
  ],
};

const MAJOR_TERMS = [
  'major', 'maj', 'משמעותי', 'עיקרי', 'גבוה', 'high', 'significant', 'critical',
  'מ\'', 'maj.', 'major nc',
];

const MINOR_TERMS = [
  'minor', 'min', 'קל', 'משני', 'low', 'נמוך', 'min.', 'minor nc',
];

const NO_FINDING_TERMS = [
  'compliant', 'conform', 'conformance', 'pass', 'ok', 'n/a', 'na', 'none',
  'no finding', 'no nc', 'עמידה', 'תקין', 'ללא ממצא', 'אין ממצא', 'עומד',
  'satisfactory', 'acceptable', '—', '-', '',
  'מתאים', 'מתאימה', 'conforms', 'suitable', 'yes', 'כן',
];

/** Values in the "הערכה" (evaluation) column */
const EVAL_COMPLIANT = ['מתאים', 'מתאימה', 'conforms', 'conform', 'compliant', 'pass', 'ok', 'עומד', 'תקין', 'נמצא מתאים', 'n/a', 'na', 'n / a'];
const EVAL_MAJOR = ['מהותי', 'מהותית', 'לא מתאים', 'לא מתאימה', 'major', 'significant', 'critical'];
const EVAL_MINOR = ['מינורי', 'מינורית', 'minor'];

/**
 * Normalize header cell for matching.
 */
export function normHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\-./\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\u0590-\u05FF\s]/g, '');
}

/**
 * Score how well a header matches alias patterns.
 */
function matchScore(header, patterns) {
  const h = normHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const p of patterns) {
    const pn = normHeader(p);
    if (!pn) continue;
    if (h === pn) return 100;
    if (h.includes(pn) || pn.includes(h)) best = Math.max(best, 80);
    const hw = h.split(' ');
    const pw = pn.split(' ');
    for (const w of pw) {
      if (w.length >= 3 && hw.some(x => x === w || x.includes(w))) {
        best = Math.max(best, 60);
      }
    }
  }
  return best;
}

/**
 * Detect column mapping from header row.
 * @returns {Record<string, number>} field -> column index
 */
export function detectColumns(headers) {
  const mapping = {};
  const used = new Set();

  for (const [field, patterns] of Object.entries(FIELD_ALIASES)) {
    let bestIdx = -1;
    let bestScore = 0;
    headers.forEach((h, i) => {
      if (used.has(i)) return;
      const sc = matchScore(h, patterns);
      if (sc > bestScore) {
        bestScore = sc;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestScore >= 55) {
      mapping[field] = bestIdx;
      used.add(bestIdx);
    }
  }
  return mapping;
}

/**
 * Find header row index in first N rows of a 2D array.
 */
export function findHeaderRow(rows, maxScan = 8) {
  let bestRow = 0;
  let bestScore = 0;
  const limit = Math.min(maxScan, rows.length);
  for (let r = 0; r < limit; r++) {
    const headers = rows[r] || [];
    const map = detectColumns(headers);
    const score = Object.keys(map).length;
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}

/**
 * Parse "הערכה" field: מתאים | לא מתאים | מינורי | מהותי
 * @returns {'major'|'minor'|null} null = compliant / no finding
 */
export function parseEvaluation(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;

  for (const t of EVAL_COMPLIANT) {
    if (s === t.toLowerCase()) return null;
  }
  for (const t of EVAL_MINOR) {
    if (s === t.toLowerCase() || s.includes(t.toLowerCase())) return 'minor';
  }
  for (const t of EVAL_MAJOR) {
    if (s === t.toLowerCase() || s.includes(t.toLowerCase())) return 'major';
  }
  // fallback: partial Hebrew matches
  if (/^מינור/i.test(s)) return 'minor';
  if (/^מהות/i.test(s) || /^לא\s*מתא/i.test(s)) return 'major';
  if (/^מתא/i.test(s)) return null;
  return null;
}

/** True when evaluation means compliant (מתאים) — no finding. */
export function isCompliantEvaluation(raw) {
  if (!raw) return false;
  return parseEvaluation(raw) === null && (
    EVAL_COMPLIANT.some(t => String(raw).trim().toLowerCase() === t.toLowerCase())
    || /^מתא/i.test(String(raw).trim())
  );
}

/**
 * Parse severity string to 'major' | 'minor' | null.
 */
export function parseSeverity(raw) {
  const evalResult = parseEvaluation(raw);
  if (evalResult) return evalResult;

  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  for (const t of NO_FINDING_TERMS) {
    if (s === t.toLowerCase()) return null;
  }
  for (const t of MAJOR_TERMS) {
    if (s.includes(t.toLowerCase())) return 'major';
  }
  for (const t of MINOR_TERMS) {
    if (s.includes(t.toLowerCase())) return 'minor';
  }
  if (/^m[^i]|maj/i.test(s)) return 'major';
  if (/^min/i.test(s)) return 'minor';
  return null;
}

/**
 * Check if finding text indicates no finding.
 */
export function isNoFinding(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return true;
  for (const t of NO_FINDING_TERMS) {
    if (s === t.toLowerCase()) return true;
  }
  if (/^(yes|y|כן)$/.test(s)) return true;
  if (/^(compliant|conform|conformance|pass|ok|n\/a|na|none|satisfactory|acceptable|עמידה|תקין|ללא ממצא|אין ממצא|עומד|מתאים|מתאימה)[\s.!]*$/i.test(s)) return true;
  return false;
}

/**
 * Extract supplier name and date from filename.
 * e.g. "ABC Ltd_2024-03-15.xlsx"
 */
export function parseFilenameMeta(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  let supplier = null;
  let auditDate = null;

  const dateMatch = base.match(/(\d{4}[-_/]\d{1,2}[-_/]\d{1,2}|\d{1,2}[-_/]\d{1,2}[-_/]\d{2,4})/);
  if (dateMatch) {
    auditDate = normalizeDate(dateMatch[1]);
    supplier = base.replace(dateMatch[0], '').replace(/[_\-.\s]+$/, '').replace(/^[_\-.\s]+/, '').trim();
  } else {
    supplier = base.trim();
  }

  if (supplier && /^(audit|report|מבדק|דוח)/i.test(supplier)) supplier = null;
  return { supplier: supplier || null, auditDate };
}

/**
 * Normalize date string to display format.
 */
export function normalizeDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw)) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;

  // Excel serial
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n > 30000 && n < 60000) {
      const d = new Date((n - 25569) * 86400000);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
  }

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmy) {
    let y = dmy[3];
    if (y.length === 2) y = '20' + y;
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return s;
}

export function cellStr(row, idx) {
  if (idx == null || idx < 0 || !row) return '';
  const v = row[idx];
  if (v == null) return '';
  return String(v).trim();
}
