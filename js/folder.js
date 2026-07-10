'use strict';

const EXTENSIONS = ['.xlsx', '.xls', '.csv', '.docx', '.pdf'];

/**
 * @typedef {Object} ScannedFile
 * @property {string} name
 * @property {string} path
 * @property {string} ext
 * @property {ArrayBuffer} buffer
 * @property {string|null} folderSupplier
 */

/**
 * Pick folder via File System Access API.
 */
export async function pickFolder() {
  if (!window.showDirectoryPicker) {
    throw new Error('FOLDER_API_UNAVAILABLE');
  }
  const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  return scanDirectoryHandle(dirHandle, dirHandle.name);
}

/**
 * Recursively scan directory handle.
 */
async function scanDirectoryHandle(dirHandle, basePath = '') {
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const relPath = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === 'directory') {
      const sub = await scanDirectoryHandle(handle, relPath);
      files.push(...sub);
    } else if (handle.kind === 'file') {
      const ext = getExt(name);
      if (!EXTENSIONS.includes(ext)) continue;
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      const parts = relPath.split('/');
      const folderSupplier = parts.length > 1 ? parts[parts.length - 2] : null;
      files.push({
        name,
        path: relPath,
        ext,
        buffer,
        folderSupplier: folderSupplier && !looksLikeGenericFolder(folderSupplier) ? folderSupplier : null,
      });
    }
  }
  return files;
}

/**
 * Convert FileList / input files to ScannedFile[].
 */
export async function filesFromInput(fileList) {
  const files = [];
  for (const file of fileList) {
    const ext = getExt(file.name);
    if (!EXTENSIONS.includes(ext)) continue;
    const rel = file.webkitRelativePath || file.name;
    const parts = rel.split('/');
    const folderSupplier = parts.length > 1 ? parts[parts.length - 2] : null;
    files.push({
      name: file.name,
      path: rel,
      ext,
      buffer: await file.arrayBuffer(),
      folderSupplier: folderSupplier && !looksLikeGenericFolder(folderSupplier) ? folderSupplier : null,
    });
  }
  return files;
}

function getExt(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function looksLikeGenericFolder(name) {
  return /^(samples|data|files|docs|documents|מבדקים|קבצים)$/i.test(name.trim());
}

export { EXTENSIONS };
