'use strict';

import { parseFilenameMeta } from './parsers/detect.js';
import { cleanSupplierFromFilename, isSupplierCode } from './parsers/pdf-text.js';

const DEFAULT_CONFIG = {
  baseScore: 100,
  majorPenalty: 10,
  minorPenalty: 3,
  excellentMin: 90,
  goodMin: 75,
  averageMin: 55,
};

const STORAGE_KEY = 'supplier_audit_scoring';

export function loadScoringConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (_) { /* ignore */ }
  return { ...DEFAULT_CONFIG };
}

export function saveScoringConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function getDefaultConfig() {
  return { ...DEFAULT_CONFIG };
}

/**
 * Calculate score from major/minor counts.
 */
export function calculateScore(majorCount, minorCount, config = loadScoringConfig()) {
  const raw = config.baseScore
    - majorCount * config.majorPenalty
    - minorCount * config.minorPenalty;
  return Math.max(0, Math.round(raw));
}

/**
 * Map score to Hebrew rating label.
 */
export function scoreToRating(score, config = loadScoringConfig()) {
  if (score >= config.excellentMin) return { key: 'excellent', label: 'מצוין', badge: 'b-excellent' };
  if (score >= config.goodMin) return { key: 'good', label: 'טוב', badge: 'b-good' };
  if (score >= config.averageMin) return { key: 'average', label: 'בינוני', badge: 'b-average' };
  return { key: 'weak', label: 'חלש', badge: 'b-weak' };
}

/**
 * Build supplier summary from findings array.
 */
export function summarizeSupplier(supplierName, findings, config) {
  const majors = findings.filter(f => f.severity === 'major');
  const minors = findings.filter(f => f.severity === 'minor');
  const dates = findings.map(f => f.auditDate).filter(Boolean);
  const auditDate = dates.sort().reverse()[0] || null;
  const score = calculateScore(majors.length, minors.length, config);
  const rating = scoreToRating(score, config);

  const catCount = {};
  for (const f of majors) {
    catCount[f.category] = (catCount[f.category] || 0) + 1;
  }
  const improveAreas = Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([cat, n]) => ({ category: cat, count: n }));

  return {
    supplier: supplierName,
    auditDate,
    majorCount: majors.length,
    minorCount: minors.length,
    totalCount: findings.length,
    score,
    rating,
    majors,
    minors,
    improveAreas,
    findings,
  };
}

/**
 * Summarize one report file = one supplier (each file is a separate audit).
 */
export function summarizeBySourceFile(findings, config = loadScoringConfig()) {
  const byFile = new Map();
  for (const f of findings) {
    const k = f.sourceFile || 'לא ידוע';
    if (!byFile.has(k)) byFile.set(k, []);
    byFile.get(k).push(f);
  }

  const summaries = [];
  for (const [sourceFile, list] of byFile) {
    const supplierName = resolveSupplierDisplayName(sourceFile, list);
    const s = summarizeSupplier(supplierName, list, config);
    s.sourceFile = sourceFile;
    s.sourceFileLabel = sourceFile.split(/[/\\]/).pop() || sourceFile;
    summaries.push(s);
  }
  summaries.sort((a, b) => b.score - a.score || a.supplier.localeCompare(b.supplier, 'he'));
  return summaries;
}

/** Prefer readable supplier name from findings, then filename heuristics. */
function resolveSupplierDisplayName(sourceFile, findings) {
  const fileLabel = sourceFile.split(/[/\\]/).pop() || sourceFile;

  for (const f of findings) {
    const name = String(f.supplier || '').trim();
    if (name && name !== 'לא ידוע' && !isSupplierCode(name)) return name;
  }

  const fromPdfName = cleanSupplierFromFilename(fileLabel);
  if (fromPdfName && fromPdfName.length > 2) return fromPdfName;

  const { supplier } = parseFilenameMeta(fileLabel);
  if (supplier && supplier.length > 2 && !/^(audit|report|מבדק|דוח)/i.test(supplier)) {
    return supplier;
  }

  return fileLabel.replace(/\s*\(\d+\)(?=\.[^.]+$)/, '').replace(/\.[^.]+$/, '').trim() || sourceFile;
}

/**
 * Summarize all suppliers by name (legacy — may merge multiple files).
 */
export function summarizeAll(findings, config = loadScoringConfig()) {
  const bySupplier = new Map();
  for (const f of findings) {
    const k = f.supplier || 'לא ידוע';
    if (!bySupplier.has(k)) bySupplier.set(k, []);
    bySupplier.get(k).push(f);
  }

  const summaries = [];
  for (const [name, list] of bySupplier) {
    summaries.push(summarizeSupplier(name, list, config));
  }
  summaries.sort((a, b) => b.score - a.score || a.supplier.localeCompare(b.supplier, 'he'));
  return summaries;
}
