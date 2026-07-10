'use strict';

import { buildExecutiveReport, renderExecutiveHtml, renderSupplierDetailHtml } from './report.js';

let categoryChart = null;
let ratingsChart = null;
let lastSummaries = [];
let lastFindings = [];

const PAGE_META = {
  dashboard: { title: 'דשבורד', sub: 'סקירה כללית של כל הספקים' },
  detail: { title: 'פרוט ספקים', sub: 'פירוט מלא לכל מבדק' },
  compare: { title: 'טבלת השוואה', sub: 'השוואה מלאה — ממוין לפי ציון' },
  summary: { title: 'סיכום מנהלים', sub: 'בעיות חוצות-ספקים והמלצות' },
  files: { title: 'קבצים', sub: 'יומן ניתוח קבצים' },
};

export function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3200);
}

export function renderFileList(files) {
  const wrap = document.getElementById('fileListWrap');
  const ul = document.getElementById('fileList');
  ul.innerHTML = '';
  for (const f of files) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(f.path || f.name)}</span><span class="ext">${f.ext}</span>`;
    ul.appendChild(li);
  }
  wrap.classList.remove('hidden');
}

export function updateSidebarMeta(summaries) {
  const el = document.getElementById('appMeta');
  if (!el) return;
  el.textContent = summaries.length ? `${summaries.length} ספקים` : '—';
}

function kpiStats(summaries, allFindings) {
  const totalMajor = allFindings.filter(f => f.severity === 'major').length;
  const totalMinor = allFindings.filter(f => f.severity === 'minor').length;
  const avg = summaries.length
    ? Math.round(summaries.reduce((a, s) => a + s.score, 0) / summaries.length)
    : 0;
  return { totalMajor, totalMinor, avg };
}

function kpiCard(v, l, icon, color) {
  return `<div class="kpi-card">
    <div class="kpi-icon ${color}">${icon}</div>
    <div><div class="kpi-v">${v}</div><div class="kpi-l">${escapeHtml(l)}</div></div>
  </div>`;
}

export function renderKpis(summaries, allFindings) {
  const { totalMajor, totalMinor, avg } = kpiStats(summaries, allFindings);
  const html = [
    kpiCard(summaries.length, 'ספקים', '👥', 'blue'),
    kpiCard(totalMajor, 'Major כולל', '⚠', 'yellow'),
    kpiCard(totalMinor, 'Minor כולל', 'ℹ', 'green'),
    kpiCard(avg, 'ציון ממוצע', '★', 'red'),
  ].join('');

  for (const id of ['kpiGrid', 'kpiGridCompare']) {
    const grid = document.getElementById(id);
    if (grid) grid.innerHTML = html;
  }
}

export function renderRankList(summaries) {
  const el = document.getElementById('rankList');
  if (!el) return;
  if (!summaries.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.86rem">אין נתונים</p>';
    return;
  }

  el.innerHTML = summaries.map((s, i) => {
    const pct = Math.max(0, Math.min(100, s.score));
    return `<div class="rank-row">
      <span class="rank-num ${i < 3 ? 'top' : ''}">${i + 1}</span>
      <span class="rank-name" title="${escapeHtml(s.supplier)}">${escapeHtml(s.supplier)}</span>
      <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%"></div></div>
      <span class="rank-score">${s.score}</span>
      <span class="badge ${s.rating.badge}">${escapeHtml(s.rating.label)}</span>
    </div>`;
  }).join('');
}

function supplierCell(s) {
  return `<td class="col-supplier">
    <strong class="supplier-name">${escapeHtml(s.supplier)}</strong>
  </td>`;
}

function buildCompareRow(s, i, compact) {
  if (compact) {
    return `<tr>
      ${supplierCell(s)}
      <td>${i + 1}</td>
      <td><span class="badge b-major">${s.majorCount}</span></td>
      <td><span class="badge b-minor">${s.minorCount}</span></td>
      <td><strong>${s.score}</strong></td>
      <td><span class="badge ${s.rating.badge}">${escapeHtml(s.rating.label)}</span></td>
    </tr>`;
  }
  return `<tr>
    ${supplierCell(s)}
    <td>${i + 1}</td>
    <td>${escapeHtml(s.auditDate || '—')}</td>
    <td><span class="badge b-major">${s.majorCount}</span></td>
    <td><span class="badge b-minor">${s.minorCount}</span></td>
    <td>${s.totalCount}</td>
    <td><strong>${s.score}</strong></td>
    <td><span class="badge ${s.rating.badge}">${escapeHtml(s.rating.label)}</span></td>
    <td class="col-file" title="${escapeHtml(s.sourceFileLabel || '')}">${escapeHtml(s.sourceFileLabel || '')}</td>
  </tr>`;
}

export function renderCompareTable(summaries) {
  renderTableBody('#compareTable tbody', summaries, false, 9);
  renderTableBody('#compareTableDash tbody', summaries, true, 6);
}

function renderTableBody(selector, summaries, compact, colspan) {
  const tbody = document.querySelector(selector);
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!summaries.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;color:var(--muted)">אין נתונים</td></tr>`;
    return;
  }
  summaries.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = buildCompareRow(s, i, compact);
    tbody.appendChild(tr);
  });
}

export function renderSupplierCards(summaries) {
  const container = document.getElementById('supplierCards');
  container.innerHTML = '';

  summaries.forEach((s, idx) => {
    const card = document.createElement('div');
    card.className = 'sup-card';

    const improveHtml = s.improveAreas.length
      ? `<ul class="improve-list">${s.improveAreas.map(a =>
          `<li><strong>${escapeHtml(a.category)}</strong> — ${a.count} ממצאי Major</li>`
        ).join('')}</ul>`
      : '<p class="improve-list">אין תחומי שיפור Major מזוהים.</p>';

    const majorsHtml = s.majors.length
      ? s.majors.map(f => findingItem(f)).join('')
      : '<p style="color:var(--muted);font-size:0.86rem">אין ממצאי Major</p>';

    const minorsHtml = s.minors.map(f => findingItem(f)).join('');

    card.innerHTML = `
      <div class="sup-hdr" data-toggle>
        <div>
          <div class="sup-name">
            <span class="sup-index">${idx + 1}/${summaries.length}</span>
            ${escapeHtml(s.supplier)}
          </div>
          <div class="sup-file">📄 ${escapeHtml(s.sourceFileLabel || '')}</div>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:0.1rem">תאריך מבדק: ${escapeHtml(s.auditDate || '—')}</div>
        </div>
        <div class="sup-meta">
          <span class="badge b-major">${s.majorCount} Major</span>
          <span class="badge b-minor">${s.minorCount} Minor</span>
          <span class="badge ${s.rating.badge}">${escapeHtml(s.rating.label)} (${s.score})</span>
          <span style="color:var(--muted)">▼</span>
        </div>
      </div>
      <div class="sup-body open">
        <div class="sup-stats">
          <span>ציון: <strong>${s.score}</strong></span>
          <span>דירוג: <strong>${escapeHtml(s.rating.label)}</strong></span>
          <span>סה"כ ממצאים: <strong>${s.totalCount}</strong></span>
        </div>
        <h4 style="font-size:0.88rem;margin-bottom:0.45rem">ממצאי Major (${s.majorCount})</h4>
        ${majorsHtml}
        <h4 style="font-size:0.88rem;margin:0.85rem 0 0.45rem">במה לשפר</h4>
        ${improveHtml}
        ${s.minors.length ? `
          <h4 style="font-size:0.88rem;margin:0.85rem 0 0.45rem">ממצאי Minor (${s.minorCount})</h4>
          <div class="minor-list open">${minorsHtml}</div>
        ` : ''}
      </div>
    `;

    card.querySelector('[data-toggle]').addEventListener('click', () => {
      card.querySelector('.sup-body').classList.toggle('open');
    });

    container.appendChild(card);
  });
}

function findingItem(f) {
  const q = f.questionId
    ? `[${escapeHtml(f.questionId)}] ${escapeHtml(f.questionText)}`
    : escapeHtml(f.questionText);
  return `
    <div class="finding-item">
      ${q ? `<div class="finding-q">${q}</div>` : ''}
      <div class="finding-t">${escapeHtml(f.findingText)}</div>
      <span class="badge ${f.severity === 'major' ? 'b-major' : 'b-minor'}" style="margin-top:0.2rem">${f.severity === 'major' ? 'Major' : 'Minor'}</span>
      ${f.category ? `<span style="font-size:0.73rem;color:var(--muted);margin-right:0.45rem">${escapeHtml(f.category)}</span>` : ''}
    </div>
  `;
}

export function renderExecutive(summaries, allFindings) {
  lastSummaries = summaries;
  lastFindings = allFindings;
  const report = buildExecutiveReport(summaries, allFindings);
  const el = document.getElementById('executiveReport');
  if (el) el.innerHTML = renderExecutiveHtml(report);
  renderCharts(report, summaries);
  return report;
}

function renderCharts(report, summaries) {
  if (categoryChart) categoryChart.destroy();
  if (ratingsChart) ratingsChart.destroy();

  const catLabels = report.topCategories.map(([c]) => c);
  const catData = report.topCategories.map(([, n]) => n);

  const ctx1 = document.getElementById('chartCategories');
  if (ctx1 && catLabels.length) {
    categoryChart = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: catLabels,
        datasets: [{
          label: 'Major',
          data: catData,
          backgroundColor: '#e6b42288',
          borderColor: '#e6b422',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8494a7' }, grid: { color: '#2a3544' } },
          y: { ticks: { color: '#e8edf4', font: { size: 11 } }, grid: { color: '#2a3544' } },
        },
      },
    });
  }

  const ctx2 = document.getElementById('chartRatings');
  if (ctx2) {
    ratingsChart = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['מצוין', 'טוב', 'בינוני', 'חלש'],
        datasets: [{
          data: [
            report.ratingCounts.excellent,
            report.ratingCounts.good,
            report.ratingCounts.average,
            report.ratingCounts.weak,
          ],
          backgroundColor: ['#3ecf8e', '#4d9fff', '#e6b422', '#f05d5e'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { position: 'bottom', labels: { color: '#e8edf4', padding: 12, font: { size: 11 } } } },
      },
    });
  }
}

export function renderParseLog(logs, targetId = 'parseLog') {
  const ul = document.getElementById(targetId);
  if (!ul) return;
  ul.innerHTML = '';
  for (const entry of logs) {
    const li = document.createElement('li');
    const cls = entry.err ? 'err' : entry.ok ? 'ok' : 'warn';
    li.innerHTML = `<span>${escapeHtml(entry.file)}</span><span class="${cls}">${escapeHtml(entry.msg)}</span>`;
    ul.appendChild(li);
  }
}

export function showParseFailure(logs) {
  const wrap = document.getElementById('parseErrorWrap');
  if (wrap) wrap.classList.remove('hidden');
  renderParseLog(logs, 'parseErrorLog');
}

export function hideParseFailure() {
  const wrap = document.getElementById('parseErrorWrap');
  if (wrap) wrap.classList.add('hidden');
}

export function switchToTab(tabName) {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.view-pane').forEach(pane => pane.classList.remove('active'));
  const paneId = `tab${capitalize(tabName)}`;
  const pane = document.getElementById(paneId);
  if (pane) pane.classList.add('active');

  const meta = PAGE_META[tabName];
  if (meta) {
    const title = document.getElementById('pageTitle');
    const sub = document.getElementById('pageSub');
    if (title) title.textContent = meta.title;
    if (sub) sub.textContent = meta.sub;
  }
}

export function exportHtmlReport() {
  if (!lastSummaries.length) return;

  const supplierSections = lastSummaries
    .map((s, i) => renderSupplierDetailHtml(s, i + 1))
    .join('');

  const report = buildExecutiveReport(lastSummaries, lastFindings);
  const executive = renderExecutiveHtml(report);
  const table = document.querySelector('#compareTable')?.outerHTML || '';

  const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>דוח מבדקי ספקים</title>
<style>
body{font-family:Arial,sans-serif;direction:rtl;padding:2rem;line-height:1.6;max-width:900px;margin:0 auto}
h1{color:#1a365d}h2{color:#2563eb;margin-top:2rem;border-top:2px solid #ddd;padding-top:1rem}
h3{color:#333;margin-top:1rem}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #ccc;padding:0.5rem;text-align:right}th{background:#eee}
.major{color:#b45309;font-weight:bold}.minor{color:#2563eb}.meta{color:#666;font-size:0.9rem}
ul{padding-right:1.25rem}li{margin-bottom:0.35rem}
.sup-block{margin-bottom:2.5rem;padding-bottom:1.5rem;border-bottom:1px solid #ddd}
</style></head><body>
<h1>דוח מבדקי הסמכה — ספקים</h1>
<p class="meta">נוצר: ${new Date().toLocaleDateString('he-IL')} · ${lastSummaries.length} ספקים</p>

<h2>פרוט לפי ספק</h2>
${supplierSections}

<h2>טבלת השוואה</h2>
${table}

<h2>סיכום מנהלים</h2>
${executive}
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `supplier-audit-report-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function setupTabs() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.dataset.tab));
  });

  document.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.dataset.goto));
  });
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
