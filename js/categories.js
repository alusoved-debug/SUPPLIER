'use strict';

/** Category definitions with bilingual keywords */
export const CATEGORIES = [
  {
    id: 'documentation',
    label: 'תיעוד',
    labelEn: 'Documentation',
    keywords: ['תיעוד', 'document', 'record', 'log', 'file', 'archive', 'רישום', 'מסמך', 'procedure doc'],
  },
  {
    id: 'quality',
    label: 'בקרת איכות',
    labelEn: 'Quality Control',
    keywords: ['quality', 'qc', 'inspection', 'בקרה', 'איכות', 'fai', 'acceptance', 'test', 'בדיקה'],
  },
  {
    id: 'calibration',
    label: 'כיול',
    labelEn: 'Calibration',
    keywords: ['calibration', 'calibrate', 'כיול', 'gauge', 'מד', 'instrument', 'מכשיר'],
  },
  {
    id: 'training',
    label: 'הדרכה',
    labelEn: 'Training',
    keywords: ['training', 'train', 'הדרכה', 'competence', 'competency', 'כשירות', 'skill'],
  },
  {
    id: 'safety',
    label: 'בטיחות',
    labelEn: 'Safety',
    keywords: ['safety', 'esd', 'בטיחות', 'hazard', 'ppe', 'fod', 'environment'],
  },
  {
    id: 'supplier_mgmt',
    label: 'ניהול ספקים',
    labelEn: 'Supplier Management',
    keywords: ['subcontract', 'outsourc', 'supplier', 'vendor', 'ספק', 'chain', 'flow down'],
  },
  {
    id: 'process',
    label: 'תהליכים',
    labelEn: 'Process',
    keywords: ['process', 'procedure', 'work instruction', 'תהליך', 'נוהל', 'wi', 'flow'],
  },
  {
    id: 'traceability',
    label: 'עקיבות',
    labelEn: 'Traceability',
    keywords: ['traceability', 'trace', 'serial', 'lot', 'batch', 'עקיבות', 'סריאלי', 'מנה'],
  },
];

const OTHER = { id: 'other', label: 'אחר', labelEn: 'Other' };

/**
 * Classify finding text into a category.
 */
export function classifyCategory(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return OTHER.label;

  let best = null;
  let bestCount = 0;

  for (const cat of CATEGORIES) {
    let count = 0;
    for (const kw of cat.keywords) {
      if (s.includes(kw.toLowerCase())) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = cat;
    }
  }

  return best ? best.label : OTHER.label;
}

export function getCategoryByLabel(label) {
  return CATEGORIES.find(c => c.label === label) || OTHER;
}

export function allCategoryLabels() {
  return [...CATEGORIES.map(c => c.label), OTHER.label];
}
