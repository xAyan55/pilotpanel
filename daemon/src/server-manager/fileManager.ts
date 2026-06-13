import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { getVolumePath } from '../docker/containerManager';

// Verify file target remains in the server's sandbox data directory
const safePath = (serverUuid: string, relativePath: string = '') => {
  const root = getVolumePath(serverUuid);
  const target = path.normalize(path.join(root, relativePath));
  if (!target.startsWith(root)) {
    throw new Error('Access denied: directory traversal detected.');
  }
  return target;
};

export const listFiles = (serverUuid: string, dirPath: string = '') => {
  const target = safePath(serverUuid, dirPath);

  if (!fs.existsSync(target)) {
    return [];
  }

  const items = fs.readdirSync(target, { withFileTypes: true });

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
};

export const readFileContent = (serverUuid: string, filePath: string) => {
  const target = safePath(serverUuid, filePath);

  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    throw new Error('File not found or is a directory.');
  }

  return fs.readFileSync(target, 'utf-8');
};

export const writeFileContent = (serverUuid: string, filePath: string, content: string) => {
  const target = safePath(serverUuid, filePath);
  
  // Ensure target folder exists
  const parent = path.dirname(target);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }

  fs.writeFileSync(target, content, 'utf-8');
  return { success: true };
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

export const zipFiles = (serverUuid: string, folderToZip: string, archiveName: string) => {
  const source = safePath(serverUuid, folderToZip);
  const dest = safePath(serverUuid, archiveName);

  return new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(dest);
    const archive = archiver('zip', { zlib: { level: 9 } });

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

  return new Promise<void>((resolve, reject) => {
    fs.createReadStream(source)
      .pipe(unzipper.Extract({ path: dest }))
      .on('close', resolve)
      .on('error', reject);
  });
};
