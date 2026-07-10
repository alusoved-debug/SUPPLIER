'use strict';

/**
 * Generate executive summary report (rule-based, no AI).
 */
export function buildExecutiveReport(summaries, allFindings) {
  const totalSuppliers = summaries.length;
  const ratingCounts = { excellent: 0, good: 0, average: 0, weak: 0 };
  for (const s of summaries) {
    ratingCounts[s.rating.key]++;
  }

  const categoryTotals = {};
  const categorySuppliers = {};

  for (const f of allFindings) {
    if (f.severity !== 'major') continue;
    categoryTotals[f.category] = (categoryTotals[f.category] || 0) + 1;
    if (!categorySuppliers[f.category]) categorySuppliers[f.category] = new Set();
    categorySuppliers[f.category].add(f.supplier);
  }

  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const crossCutting = topCategories
    .filter(([cat]) => (categorySuppliers[cat]?.size || 0) >= 2)
    .map(([cat, count]) => ({
      category: cat,
      count,
      supplierCount: categorySuppliers[cat].size,
      suppliers: [...categorySuppliers[cat]],
    }));

  const urgent = summaries.filter(s => s.majorCount >= 3 || s.score < 55);

  const totalMajor = allFindings.filter(f => f.severity === 'major').length;
  const totalMinor = allFindings.filter(f => f.severity === 'minor').length;

  const paragraphs = [];

  paragraphs.push(
    `נותחו ${totalSuppliers} ספקים עם סך של ${totalMajor} ממצאי Major ו-${totalMinor} ממצאי Minor. ` +
    `התפלגות הדירוגים: ${ratingCounts.excellent} מצוין, ${ratingCounts.good} טוב, ` +
    `${ratingCounts.average} בינוני, ${ratingCounts.weak} חלש.`
  );

  if (topCategories.length) {
    const top3 = topCategories.slice(0, 3).map(([c, n]) => `${c} (${n})`).join(', ');
    paragraphs.push(`שלוש קטגוריות הבעיות המרכזיות: ${top3}.`);
  }

  if (crossCutting.length) {
    const cross = crossCutting.map(c =>
      `${c.category} — ${c.count} ממצאים אצל ${c.supplierCount} ספקים`
    ).join('; ');
    paragraphs.push(`בעיות חוצות-ספקים (2+ ספקים): ${cross}.`);
  } else if (topCategories.length) {
    paragraphs.push('לא זוהו קטגוריות Major שחוזרות אצל יותר מספק אחד — הממצאים מפוזרים.');
  }

  if (urgent.length) {
    const names = urgent.map(s => `${s.supplier} (ציון ${s.score}, ${s.majorCount} Major)`).join(', ');
    paragraphs.push(`ספקים הדורשים טיפול מיידי: ${names}.`);
  } else {
    paragraphs.push('אין ספקים במצב קריטי (Major ≥ 3 או ציון מתחת ל-55).');
  }

  const avgScore = totalSuppliers
    ? Math.round(summaries.reduce((a, s) => a + s.score, 0) / totalSuppliers)
    : 0;
  paragraphs.push(`ציון ממוצע כולל: ${avgScore}. מומלץ להתמקד בשיפור קטגוריות Major החוזרות ולעקוב אחר ספקים בדירוג חלש או בינוני.`);

  return {
    paragraphs,
    ratingCounts,
    topCategories,
    crossCutting,
    urgent,
    totalMajor,
    totalMinor,
    avgScore,
    categoryTotals,
  };
}

export function renderExecutiveHtml(report) {
  let html = '';

  html += '<h3>סיכום כללי</h3>';
  for (const p of report.paragraphs) {
    html += `<p>${escapeHtml(p)}</p>`;
  }

  if (report.crossCutting.length) {
    html += '<h3>בעיות מרכזיות חוצות-ספקים</h3><ul>';
    for (const c of report.crossCutting) {
      html += `<li><strong>${escapeHtml(c.category)}</strong>: ${c.count} ממצאי Major אצל ${c.supplierCount} ספקים (${escapeHtml(c.suppliers.join(', '))})</li>`;
    }
    html += '</ul>';
  }

  if (report.topCategories.length) {
    html += '<h3>פילוח לפי סוג בעיה (Major)</h3><ul>';
    for (const [cat, n] of report.topCategories) {
      html += `<li>${escapeHtml(cat)}: ${n}</li>`;
    }
    html += '</ul>';
  }

  return html;
}

/** Full HTML block for one supplier / one file. */
export function renderSupplierDetailHtml(s, index) {
  let html = `<div class="sup-block">`;
  html += `<h2>${index}. ${escapeHtml(s.supplier)}</h2>`;
  html += `<p class="meta">קובץ: ${escapeHtml(s.sourceFileLabel || '')} · תאריך: ${escapeHtml(s.auditDate || '—')} · ציון: ${s.score} (${escapeHtml(s.rating.label)}) · Major: ${s.majorCount} · Minor: ${s.minorCount}</p>`;

  if (s.improveAreas.length) {
    html += '<h3>במה לשפר</h3><ul>';
    for (const a of s.improveAreas) {
      html += `<li><strong>${escapeHtml(a.category)}</strong> — ${a.count} ממצאי Major</li>`;
    }
    html += '</ul>';
  }

  if (s.majors.length) {
    html += `<h3>ממצאי Major (${s.majorCount})</h3><ul>`;
    for (const f of s.majors) {
      const q = f.questionId ? `[${escapeHtml(f.questionId)}] ${escapeHtml(f.questionText)} — ` : '';
      html += `<li class="major">${q}${escapeHtml(f.findingText)}</li>`;
    }
    html += '</ul>';
  }

  if (s.minors.length) {
    html += `<h3>ממצאי Minor (${s.minorCount})</h3><ul>`;
    for (const f of s.minors) {
      const q = f.questionId ? `[${escapeHtml(f.questionId)}] ${escapeHtml(f.questionText)} — ` : '';
      html += `<li class="minor">${q}${escapeHtml(f.findingText)}</li>`;
    }
    html += '</ul>';
  }

  html += '</div>';
  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
