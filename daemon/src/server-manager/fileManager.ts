import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import unzipper from 'unzipper';
import * as tar from 'tar';
import { getVolumePath } from '../docker/containerManager';

// Verify file target remains in the server's sandbox data directory
export const safePath = (serverUuid: string, relativePath: string = '') => {
  const root = path.resolve(getVolumePath(serverUuid));
  
  // Strip drive letters (Windows) and leading slashes to prevent absolute breakouts
  let cleanRelative = relativePath.replace(/^[a-zA-Z]:/, '');
  cleanRelative = path.normalize(cleanRelative).replace(/^\\|^\//, '');
  
  const target = path.resolve(root, cleanRelative);
  const relative = path.relative(root, target);
  
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    console.error(`[FILE_MANAGER] Traversal blocked! Root: ${root}, Requested: ${relativePath}, Target: ${target}`);
    throw new Error('Access denied: directory traversal detected.');
  }
  return target;
};

export const listFiles = (serverUuid: string, dirPath: string = '') => {
  console.log(`[FILE_MANAGER] Requested list files for path: "${dirPath}"`);
  try {
    const target = safePath(serverUuid, dirPath);
    console.log(`[FILE_MANAGER] Resolved path: "${target}"`);

    if (!fs.existsSync(target)) {
      console.warn(`[FILE_MANAGER] Path does not exist: "${target}"`);
      return [];
    }

    const items = fs.readdirSync(target, { withFileTypes: true });
    console.log(`[FILE_MANAGER] Result: Success. Found ${items.length} items.`);

    return items.map((item) => {
      const filePath = path.join(target, item.name);
      let stats;
      try {
        stats = fs.statSync(filePath);
      } catch {
        stats = { size: 0, mtime: new Date() };
      }

      return {
        name: item.name,
        isDirectory: item.isDirectory(),
        size: stats.size,
        modified: stats.mtime
      };
    });
  } catch (err: any) {
    console.error(`[FILE_MANAGER] Error listing files for "${dirPath}": ${err.message}`);
    throw err;
  }
};

export const readFileContent = (serverUuid: string, filePath: string) => {
  console.log(`[FILE_MANAGER] Requested read file path: "${filePath}"`);
  try {
    const target = safePath(serverUuid, filePath);
    console.log(`[FILE_MANAGER] Resolved path: "${target}"`);

    if (!fs.existsSync(target)) {
      console.error(`[FILE_MANAGER] Error: ENOENT (file not found: "${target}")`);
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    if (fs.statSync(target).isDirectory()) {
      console.error(`[FILE_MANAGER] Error: EISDIR (is a directory: "${target}")`);
      throw new Error(`EISDIR: illegal operation on a directory, read`);
    }

    const content = fs.readFileSync(target, 'utf-8');
    console.log(`[FILE_MANAGER] Result: Success (${content.length} chars)`);
    return content;
  } catch (error: any) {
    console.error(`[FILE_MANAGER] Error reading file: ${error.message}`);
    throw error;
  }
};

export const writeFileContent = (serverUuid: string, filePath: string, content: string) => {
  console.log(`[FILE_MANAGER] Requested write file path: "${filePath}"`);
  try {
    const target = safePath(serverUuid, filePath);
    console.log(`[FILE_MANAGER] Resolved path: "${target}"`);
    
    // Ensure target folder exists
    const parent = path.dirname(target);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }

    fs.writeFileSync(target, content, 'utf-8');
    console.log(`[FILE_MANAGER] Result: Success`);
    return { success: true };
  } catch (error: any) {
    console.error(`[FILE_MANAGER] Error writing file: ${error.message}`);
    throw error;
  }
};

export const deleteFileOrFolder = (serverUuid: string, filePath: string) => {
  const target = safePath(serverUuid, filePath);

  if (!fs.existsSync(target)) {
    throw new Error('File not found.');
  }

  const stats = fs.statSync(target);
  if (stats.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: true });
  } else {
    fs.unlinkSync(target);
  }

  return { success: true };
};

export const renameOrMoveFile = (serverUuid: string, oldPath: string, newPath: string) => {
  const source = safePath(serverUuid, oldPath);
  const dest = safePath(serverUuid, newPath);

  if (!fs.existsSync(source)) {
    throw new Error('Source file not found.');
  }

  // Ensure dest parent dir exists
  const destParent = path.dirname(dest);
  if (!fs.existsSync(destParent)) {
    fs.mkdirSync(destParent, { recursive: true });
  }

  fs.renameSync(source, dest);
  return { success: true };
};

export const copyFileOrFolder = (serverUuid: string, oldPath: string, newPath: string) => {
  const source = safePath(serverUuid, oldPath);
  const dest = safePath(serverUuid, newPath);

  if (!fs.existsSync(source)) {
    throw new Error('Source file/folder not found.');
  }

  // Ensure dest parent dir exists
  const destParent = path.dirname(dest);
  if (!fs.existsSync(destParent)) {
    fs.mkdirSync(destParent, { recursive: true });
  }

  const stats = fs.statSync(source);
  if (stats.isDirectory()) {
    fs.cpSync(source, dest, { recursive: true });
  } else {
    fs.copyFileSync(source, dest);
  }

  return { success: true };
};

export const zipFiles = (serverUuid: string, folderToZip: string, archiveName: string) => {
  const source = safePath(serverUuid, folderToZip);
  const dest = safePath(serverUuid, archiveName);

  return new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(dest);
    
    let archive;
    if (archiveName.endsWith('.tar.gz') || archiveName.endsWith('.tgz')) {
      archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
    } else if (archiveName.endsWith('.tar')) {
      archive = archiver('tar');
    } else {
      archive = archiver('zip', { zlib: { level: 9 } });
    }

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);

    const stats = fs.statSync(source);
    if (stats.isDirectory()) {
      archive.directory(source, false);
    } else {
      archive.file(source, { name: path.basename(source) });
    }

    archive.finalize();
  });
};

export const unzipFile = (serverUuid: string, archivePath: string, extractFolder: string = '') => {
  const source = safePath(serverUuid, archivePath);
  const dest = safePath(serverUuid, extractFolder);

  if (!fs.existsSync(source)) {
    throw new Error('Archive file not found.');
  }

  // Ensure dest folder exists
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  if (archivePath.endsWith('.zip')) {
    return new Promise<void>((resolve, reject) => {
      fs.createReadStream(source)
        .pipe(unzipper.Extract({ path: dest }))
        .on('close', resolve)
        .on('error', reject);
    });
  } else if (archivePath.endsWith('.tar') || archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    return tar.x({
      file: source,
      C: dest
    });
  } else {
    throw new Error('Unsupported archive format.');
  }
};

