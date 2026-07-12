'use strict';

import { pickFolder, filesFromInput } from './folder.js';
import { parseExcelBuffer } from './parsers/excel.js';
import { parseCsvText } from './parsers/csv.js';
import { parseWordBuffer } from './parsers/word.js';
import { parsePdfBuffer } from './parsers/pdf.js';
import { loadScoringConfig, saveScoringConfig, summarizeBySourceFile } from './scoring.js';
import {
  showToast,
  renderFileList,
  renderKpis,
  renderRankList,
  renderCompareTable,
  renderSupplierCards,
  renderExecutive,
  renderParseLog,
  showParseFailure,
  hideParseFailure,
  switchToTab,
  updateSidebarMeta,
  exportHtmlReport,
  setupTabs,
} from './ui.js';

const state = {
  files: [],
  findings: [],
  summaries: [],
  parseLogs: [],
};

document.addEventListener('DOMContentLoaded', init);

function init() {
  setupTabs();
  loadSettingsToForm();
  adaptToDevice();
  bindEvents();
}

function adaptToDevice() {
  const hasDirectoryPicker = !!window.showDirectoryPicker;
  const isMobile = navigator.maxTouchPoints > 1 || window.matchMedia('(pointer: coarse)').matches;

  const btnPickFolder = document.getElementById('btnPickFolder');
  const folderFallbackLabel = document.getElementById('folderInputFallback')?.closest('label');
  const upSub = document.querySelector('.up-sub');
  const upTitle = document.querySelector('.up-title');

  if (isMobile) {
    btnPickFolder.style.display = 'none';
    if (folderFallbackLabel) folderFallbackLabel.style.display = 'none';
    if (upTitle) upTitle.textContent = 'בחר קבצי מבדק';
    if (upSub) upSub.innerHTML = 'לחץ <strong>בחר קבצים</strong> ובחר את קבצי המבדק<br><span style="font-size:0.82em;opacity:.75">(Excel · CSV · Word · PDF — ניתן לבחור מספר קבצים)</span>';
  } else if (!hasDirectoryPicker) {
    btnPickFolder.style.display = 'none';
  }
}

function bindEvents() {
  document.getElementById('btnPickFolder').addEventListener('click', onPickFolder);
  document.getElementById('fileInputFallback').addEventListener('change', onFilesFallback);
  document.getElementById('folderInputFallback').addEventListener('change', onFilesFallback);
  document.getElementById('btnAnalyze').addEventListener('click', onAnalyze);
  document.getElementById('btnReset').addEventListener('click', onReset);
  document.getElementById('btnSettings').addEventListener('click', () => toggleSettings('settingsPanel'));
  document.getElementById('btnSettingsApp').addEventListener('click', () => toggleSettings('settingsPanelApp'));
  document.getElementById('btnSaveSettings').addEventListener('click', onSaveSettings);
  document.getElementById('btnSaveSettingsApp').addEventListener('click', onSaveSettings);
  document.getElementById('btnPrint').addEventListener('click', () => window.print());
  document.getElementById('btnExportHtml').addEventListener('click', exportHtmlReport);

  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('over');
    const items = e.dataTransfer?.items;
    if (items) {
      const files = await collectDroppedFiles(items);
      if (files.length) await setFiles(files);
    }
  });
}

async function onPickFolder() {
  try {
    const files = await pickFolder();
    await setFiles(files);
  } catch (err) {
    if (err.message === 'FOLDER_API_UNAVAILABLE') {
      showToast('הדפדפן לא תומך בבחירת תיקייה — השתמש ב-fallback', 'err');
    } else if (err.name !== 'AbortError') {
      showToast(`שגיאה: ${err.message}`, 'err');
    }
  }
}

async function onFilesFallback(e) {
  const list = e.target.files;
  if (!list?.length) return;
  const files = await filesFromInput(list);
  await setFiles(files);
}

async function collectDroppedFiles(items) {
  const files = [];
  async function walkEntry(entry, path = '') {
    if (entry.isFile) {
      await new Promise(resolve => {
        entry.file(async file => {
          const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
          if (['.xlsx', '.xls', '.csv', '.docx', '.pdf'].includes(ext)) {
            const rel = path ? `${path}/${file.name}` : file.name;
            const parts = rel.split('/');
            files.push({
              name: file.name,
              path: rel,
              ext,
              buffer: await file.arrayBuffer(),
              folderSupplier: parts.length > 1 ? parts[parts.length - 2] : null,
            });
          }
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      await new Promise(resolve => {
        reader.readEntries(async entries => {
          for (const ent of entries) {
            await walkEntry(ent, path ? `${path}/${entry.name}` : entry.name);
          }
          resolve();
        });
      });
    }
  }

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) await walkEntry(entry);
  }
  return files;
}

async function setFiles(files) {
  if (!files.length) {
    showToast('לא נמצאו קבצים נתמכים', 'err');
    return;
  }
  state.files = files;
  hideParseFailure();
  renderFileList(files);
  showToast(`נמצאו ${files.length} קבצים — מריץ ניתוח...`, 'ok');
  await onAnalyze();
}

async function onAnalyze() {
  if (!state.files.length) {
    showToast('בחר תיקייה תחילה', 'err');
    return;
  }

  showToast('מנתח...', 'ok');
  const allFindings = [];
  const logs = [];

  for (const file of state.files) {
    const folderMeta = { supplier: file.folderSupplier };
    try {
      const result = await parseFile(file, folderMeta);
      allFindings.push(...result.findings);
      const warnNote = result.warnings?.length ? ` · ${result.warnings[0]}` : '';
      logs.push({
        file: file.path,
        msg: `${result.findings.length} ממצאים${warnNote}`,
        ok: result.findings.length > 0,
        warn: result.findings.length === 0,
      });
    } catch (err) {
      logs.push({ file: file.path, msg: err.message, err: true });
    }
  }

  if (!allFindings.length) {
    showToast('לא נמצאו ממצאים בקבצים — ראה פירוט למטה', 'err');
    state.parseLogs = logs;
    document.getElementById('sectionUpload').classList.add('hidden');
    document.getElementById('sectionApp').classList.remove('hidden');
    renderParseLog(logs);
    showParseFailure(logs);
    switchToTab('files');
    return;
  }

  hideParseFailure();

  const config = loadScoringConfig();
  const summaries = summarizeBySourceFile(allFindings, config);

  state.findings = allFindings;
  state.summaries = summaries;
  state.parseLogs = logs;

  renderResults(summaries, allFindings, logs);
  showToast(`הניתוח הושלם — ${summaries.length} ספקים`, 'ok');
}

async function parseFile(file, folderMeta) {
  const meta = { ...folderMeta, sourceFile: file.path || file.name };
  switch (file.ext) {
    case '.xlsx':
    case '.xls':
      return parseExcelBuffer(file.buffer, file.name, meta);
    case '.csv': {
      const text = decodeCsvBuffer(file.buffer);
      return parseCsvText(text, file.name, meta);
    }
    case '.docx':
      return parseWordBuffer(file.buffer, file.name, meta);
    case '.pdf':
      return parsePdfBuffer(file.buffer, file.name, meta);
    default:
      throw new Error(`פורמט לא נתמך: ${file.ext}`);
  }
}

function renderResults(summaries, allFindings, logs) {
  document.getElementById('sectionUpload').classList.add('hidden');
  document.getElementById('sectionApp').classList.remove('hidden');

  updateSidebarMeta(summaries);
  renderKpis(summaries, allFindings);
  renderRankList(summaries);
  renderCompareTable(summaries);
  renderSupplierCards(summaries);
  renderExecutive(summaries, allFindings);
  renderParseLog(logs);
  switchToTab('dashboard');
}

function onReset() {
  state.files = [];
  state.findings = [];
  state.summaries = [];
  state.parseLogs = [];
  document.getElementById('sectionApp').classList.add('hidden');
  document.getElementById('sectionUpload').classList.remove('hidden');
  document.getElementById('fileListWrap').classList.add('hidden');
  hideParseFailure();
}

function toggleSettings(panelId) {
  document.getElementById(panelId)?.classList.toggle('hidden');
}

function loadSettingsToForm() {
  const cfg = loadScoringConfig();
  syncSettingsForm(cfg);
}

function syncSettingsForm(cfg) {
  const map = {
    cfgBase: cfg.baseScore,
    cfgMajor: cfg.majorPenalty,
    cfgMinor: cfg.minorPenalty,
    cfgExcellent: cfg.excellentMin,
    cfgGood: cfg.goodMin,
    cfgAverage: cfg.averageMin,
  };
  for (const [id, val] of Object.entries(map)) {
    document.getElementById(id).value = val;
    document.getElementById(`${id}App`).value = val;
  }
}

function readSettingsFromForm() {
  const appMode = !document.getElementById('sectionApp').classList.contains('hidden');
  const id = (base) => appMode ? `${base}App` : base;
  return {
    baseScore: numVal(id('cfgBase'), 100),
    majorPenalty: numVal(id('cfgMajor'), 10),
    minorPenalty: numVal(id('cfgMinor'), 3),
    excellentMin: numVal(id('cfgExcellent'), 90),
    goodMin: numVal(id('cfgGood'), 75),
    averageMin: numVal(id('cfgAverage'), 55),
  };
}

function onSaveSettings() {
  const cfg = readSettingsFromForm();
  saveScoringConfig(cfg);
  syncSettingsForm(cfg);
  document.getElementById('settingsPanel')?.classList.add('hidden');
  document.getElementById('settingsPanelApp')?.classList.add('hidden');
  showToast('הגדרות נשמרו', 'ok');
  if (state.findings.length) {
    const summaries = summarizeBySourceFile(state.findings, cfg);
    state.summaries = summaries;
    renderResults(summaries, state.findings, state.parseLogs);
  }
}

function numVal(id, fallback) {
  const v = parseInt(document.getElementById(id).value, 10);
  return isNaN(v) ? fallback : v;
}

function decodeCsvBuffer(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (!utf8.includes('\uFFFD') && /[\u0590-\u05FF]/.test(utf8)) return utf8.replace(/^\uFEFF/, '');
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');

  try {
    const win = new TextDecoder('windows-1255').decode(buffer);
    return win.replace(/^\uFEFF/, '');
  } catch (_) {
    return utf8.replace(/^\uFEFF/, '');
  }
}
