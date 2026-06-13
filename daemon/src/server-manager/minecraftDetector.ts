import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { getVolumePath } from '../docker/containerManager';

interface PluginMeta {
  name: string;
  version: string;
  author: string;
  enabled: boolean;
  file: string;
}

interface ModMeta {
  id: string;
  name: string;
  version: string;
  authors: string[];
  file: string;
}

// Caches to prevent repeated expensive zip parsing
const pluginCache = new Map<string, { mtime: number; meta: Omit<PluginMeta, 'enabled'> }>();
const modCache = new Map<string, { mtime: number; meta: ModMeta }>();

// Simple regex parsers for YAML-like plugin.yml and TOML-like mods.toml
const parsePluginYml = (content: string): { name: string; version: string; author: string } => {
  const nameMatch = content.match(/^name:\s*['"]?([^'"\r\n]+)['"]?/m);
  const versionMatch = content.match(/^version:\s*['"]?([^'"\r\n]+)['"]?/m);
  // Author can be under 'author' or 'authors'
  const authorMatch = content.match(/^(?:author|authors):\s*['"]?([^'"\r\n\[\]]+)['"]?/m);

  return {
    name: nameMatch ? nameMatch[1].trim() : 'Unknown',
    version: versionMatch ? versionMatch[1].trim() : 'Unknown',
    author: authorMatch ? authorMatch[1].trim().replace(/^\s*-\s*/, '') : 'Unknown'
  };
};

const parseModsToml = (content: string): { name: string; version: string; author: string } => {
  const nameMatch = content.match(/displayName\s*=\s*['"]?([^'"\r\n]+)['"]?/);
  const versionMatch = content.match(/version\s*=\s*['"]?([^'"\r\n]+)['"]?/);
  const authorMatch = content.match(/authors\s*=\s*['"]?([^'"\r\n]+)['"]?/);

  return {
    name: nameMatch ? nameMatch[1].trim() : 'Unknown',
    version: versionMatch ? versionMatch[1].trim() : 'Unknown',
    author: authorMatch ? authorMatch[1].trim() : 'Unknown'
  };
};

export const detectServerSoftware = (serverUuid: string): { software: string; version: string } => {
  const rootDir = getVolumePath(serverUuid);

  if (!fs.existsSync(rootDir)) {
    return { software: 'Unknown', version: 'Unknown' };
  }

  // Detect software by configuration files
  if (fs.existsSync(path.join(rootDir, 'purpur.yml'))) {
    return { software: 'Purpur', version: 'Auto-detected' };
  }
  if (fs.existsSync(path.join(rootDir, 'paper.yml')) || fs.existsSync(path.join(rootDir, 'config', 'paper-global.yml'))) {
    return { software: 'Paper', version: 'Auto-detected' };
  }
  if (fs.existsSync(path.join(rootDir, 'spigot.yml'))) {
    return { software: 'Spigot', version: 'Auto-detected' };
  }
  if (fs.existsSync(path.join(rootDir, 'velocity.toml'))) {
    return { software: 'Velocity', version: 'Auto-detected' };
  }
  if (fs.existsSync(path.join(rootDir, 'waterfall.yml'))) {
    return { software: 'Waterfall', version: 'Auto-detected' };
  }

  // Fallback check for server.jar name or generic presence
  const files = fs.readdirSync(rootDir);
  const jarFile = files.find(f => f.endsWith('.jar'));
  if (jarFile) {
    if (jarFile.toLowerCase().includes('fabric')) return { software: 'Fabric', version: 'Auto-detected' };
    if (jarFile.toLowerCase().includes('forge')) return { software: 'Forge', version: 'Auto-detected' };
    if (jarFile.toLowerCase().includes('neoforge')) return { software: 'NeoForge', version: 'Auto-detected' };
    return { software: 'Vanilla/Spigot', version: 'Auto-detected' };
  }

  return { software: 'Vanilla', version: 'Auto-detected' };
};

export const detectPlugins = async (serverUuid: string): Promise<PluginMeta[]> => {
  const rootDir = getVolumePath(serverUuid);
  const pluginsDir = path.join(rootDir, 'plugins');

  if (!fs.existsSync(pluginsDir) || !fs.statSync(pluginsDir).isDirectory()) {
    return [];
  }

  const files = fs.readdirSync(pluginsDir);
  const jarFiles = files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
  const list: PluginMeta[] = [];

  for (const file of jarFiles) {
    const filePath = path.join(pluginsDir, file);
    const enabled = file.endsWith('.jar');
    
    try {
      const stats = statsCache(filePath);
      const mtime = stats ? stats.mtimeMs : Date.now();
      const cache = pluginCache.get(filePath);

      if (cache && cache.mtime === mtime) {
        list.push({ ...cache.meta, enabled, file });
        continue;
      }

      // Open Jar Zip asynchronously
      const zip = await unzipper.Open.file(filePath);
      const pluginYmlFile = zip.files.find(f => f.path === 'plugin.yml');

      let meta: Omit<PluginMeta, 'enabled'> = {
        name: file.replace(/\.jar(\.disabled)?$/, ''),
        version: 'Unknown',
        author: 'Unknown',
        file
      };

      if (pluginYmlFile) {
        const buffer = await pluginYmlFile.buffer();
        const content = buffer.toString('utf8');
        const parsed = parsePluginYml(content);
        meta.name = parsed.name;
        meta.version = parsed.version;
        meta.author = parsed.author;
      }

      pluginCache.set(filePath, { mtime, meta });
      list.push({ ...meta, enabled });
    } catch (err: any) {
      console.warn(`Failed to parse plugin metadata for ${file}:`, err.message);
      list.push({
        name: file.replace(/\.jar(\.disabled)?$/, ''),
        version: 'Unknown',
        author: 'Unknown',
        enabled,
        file
      });
    }
  }

  return list;
};

// Helper for sync stat checks safely
const statsCache = (p: string) => {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
};

export const detectMods = async (serverUuid: string): Promise<ModMeta[]> => {
  const rootDir = getVolumePath(serverUuid);
  const modsDir = path.join(rootDir, 'mods');

  if (!fs.existsSync(modsDir) || !fs.statSync(modsDir).isDirectory()) {
    return [];
  }

  const files = fs.readdirSync(modsDir);
  const jarFiles = files.filter(f => f.endsWith('.jar'));
  const list: ModMeta[] = [];

  for (const file of jarFiles) {
    const filePath = path.join(modsDir, file);

    try {
      const stats = statsCache(filePath);
      const mtime = stats ? stats.mtimeMs : Date.now();
      const cache = modCache.get(filePath);

      if (cache && cache.mtime === mtime) {
        list.push(cache.meta);
        continue;
      }

      const zip = await unzipper.Open.file(filePath);
      
      let meta: ModMeta = {
        id: file.replace(/\.jar$/, '').toLowerCase(),
        name: file.replace(/\.jar$/, ''),
        version: 'Unknown',
        authors: ['Unknown'],
        file
      };

      // Check Fabric Mod
      const fabricJsonFile = zip.files.find(f => f.path === 'fabric.mod.json');
      if (fabricJsonFile) {
        try {
          const buffer = await fabricJsonFile.buffer();
          const parsed = JSON.parse(buffer.toString('utf8'));
          meta.id = parsed.id || meta.id;
          meta.name = parsed.name || meta.name;
          meta.version = parsed.version || meta.version;
          if (parsed.authors) {
            meta.authors = Array.isArray(parsed.authors)
              ? parsed.authors.map((a: any) => typeof a === 'string' ? a : (a.name || 'Unknown'))
              : [parsed.authors];
          }
        } catch {}
      } else {
        // Check Forge/NeoForge mod.toml
        const modsTomlFile = zip.files.find(f => f.path === 'META-INF/mods.toml');
        const mcmodInfoFile = zip.files.find(f => f.path === 'mcmod.info');

        if (modsTomlFile) {
          try {
            const buffer = await modsTomlFile.buffer();
            const parsed = parseModsToml(buffer.toString('utf8'));
            meta.name = parsed.name;
            meta.version = parsed.version;
            meta.authors = [parsed.author];
          } catch {}
        } else if (mcmodInfoFile) {
          try {
            const buffer = await mcmodInfoFile.buffer();
            const parsedList = JSON.parse(buffer.toString('utf8'));
            const parsed = Array.isArray(parsedList) ? parsedList[0] : parsedList;
            meta.name = parsed.name || meta.name;
            meta.version = parsed.version || meta.version;
            if (parsed.authorList) meta.authors = parsed.authorList;
          } catch {}
        }
      }

      modCache.set(filePath, { mtime, meta });
      list.push(meta);
    } catch (err: any) {
      console.warn(`Failed to parse mod metadata for ${file}:`, err.message);
      list.push({
        id: file.replace(/\.jar$/, '').toLowerCase(),
        name: file.replace(/\.jar$/, ''),
        version: 'Unknown',
        authors: ['Unknown'],
        file
      });
    }
  }

  return list;
};
