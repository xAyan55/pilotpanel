import { Request, Response } from 'express';
import axios from 'axios';
import prisma from '../config/db';

// Real-world popular plugin list to display as recommendations
const RECOMMENDED_PLUGINS = [
  { id: 'worldedit', name: 'WorldEdit', source: 'Modrinth', description: 'Easy to use in-game world editor.', downloads: '12,400,000+' },
  { id: 'luckperms', name: 'LuckPerms', source: 'Modrinth', description: 'An advanced permissions plugin for Minecraft servers.', downloads: '9,800,000+' },
  { id: 'essentialsx', name: 'EssentialsX', source: 'Modrinth', description: 'Essential commands and features for Spigot/Paper.', downloads: '8,200,000+' },
  { id: 'viaversion', name: 'ViaVersion', source: 'Modrinth', description: 'Allows newer client connections to older server versions.', downloads: '5,100,000+' },
  { id: 'dynmap', name: 'Dynmap', source: 'Modrinth', description: 'A real-time web-based map for your Minecraft server.', downloads: '3,900,000+' }
];

// Search all marketplaces via live APIs
export const searchPlugins = async (req: Request, res: Response) => {
  const { query, source, version, loader } = req.query;

  if (!query) {
    return res.json(RECOMMENDED_PLUGINS);
  }

  try {
    if (source === 'Modrinth') {
      // Build facets for precise filtering (loader/compatibility)
      const facets: string[][] = [];
      
      if (loader) {
        facets.push([`categories:${loader.toString().toLowerCase()}`]);
      }
      if (version) {
        facets.push([`versions:${version.toString()}`]);
      }
      // Return plugins or mods
      facets.push(['project_type:mod', 'project_type:plugin']);

      const response = await axios.get('https://api.modrinth.com/v2/search', {
        params: {
          query: query.toString(),
          facets: JSON.stringify(facets),
          limit: 20
        },
        headers: { 'User-Agent': 'PilotPanel/1.0.0 (contact@pilotpanel.io)' }
      });

      const results = response.data.hits.map((hit: any) => ({
        id: hit.project_id,
        name: hit.title,
        source: 'Modrinth',
        description: hit.description,
        version: hit.latest_version || 'Latest',
        downloads: hit.downloads.toLocaleString()
      }));

      return res.json(results);

    } else if (source === 'SpigotMC') {
      const response = await axios.get(`https://api.spiget.org/v2/search/resources/${encodeURIComponent(query.toString())}?size=20`);
      
      const results = response.data.map((res: any) => ({
        id: res.id.toString(),
        name: res.name,
        source: 'SpigotMC',
        description: res.tag || 'No description provided.',
        version: 'Latest',
        downloads: res.downloads?.toLocaleString() || '0'
      }));

      return res.json(results);

    } else if (source === 'Hangar') {
      const response = await axios.get('https://hangar.papermc.io/api/v1/projects', {
        params: {
          q: query.toString(),
          limit: 20
        }
      });

      const results = response.data.result.map((item: any) => ({
        id: `${item.namespace.owner}/${item.namespace.slug}`,
        name: item.name,
        source: 'Hangar',
        description: item.description || 'No description provided.',
        version: 'Latest',
        downloads: item.stats.downloads?.toLocaleString() || '0'
      }));

      return res.json(results);
    }

    return res.status(400).json({ error: 'Invalid search source selected.' });

  } catch (error: any) {
    console.error('Marketplace live API search failed:', error.message);
    // Graceful fallback to filtering local recommendations
    const filtered = RECOMMENDED_PLUGINS.filter(p => p.name.toLowerCase().includes(query.toString().toLowerCase()));
    return res.json(filtered);
  }
};

export const getPopularRecommendations = async (req: Request, res: Response) => {
  return res.json(RECOMMENDED_PLUGINS);
};

// Install Plugin Controller (resolves exact compatible version, dependencies, downloads, and notifies daemon)
export const installPlugin = async (req: any, res: Response) => {
  const { uuid } = req.params;
  const { id, source, name } = req.body;

  if (!id || !source || !name) {
    return res.status(400).json({ error: 'Missing plugin installation parameters.' });
  }

  try {
    const server = await prisma.server.findUnique({
      where: { uuid },
      include: { node: true }
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    if (req.user?.role === 'Client' && server.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }

    // Determine target installation folder
    const softwareLower = server.software.toLowerCase();
    const isModded = ['fabric', 'forge', 'neoforge'].includes(softwareLower);
    const destFolder = isModded ? 'mods' : 'plugins';

    const daemonUrl = `http://${server.node.ipAddress}:${server.node.port}/api/servers/${uuid}/files/download-url`;

    const triggerDaemonDownload = async (downloadUrl: string, filename: string) => {
      await axios.post(daemonUrl, {
        url: downloadUrl,
        path: `${destFolder}/${filename}`
      }, {
        headers: {
          'x-node-token': server.node.token,
          'Content-Type': 'application/json'
        }
      });
    };

    if (source === 'Modrinth') {
      // Fetch Modrinth project versions
      const versionsResponse = await axios.get(`https://api.modrinth.com/v2/project/${id}/version`, {
        headers: { 'User-Agent': 'PilotPanel/1.0.0 (contact@pilotpanel.io)' }
      });

      const versions = versionsResponse.data;
      if (!versions || versions.length === 0) {
        return res.status(404).json({ error: 'No versions found for this project.' });
      }

      // Filter compatible versions
      let compatibleVersion = versions[0];
      const match = versions.find((v: any) => {
        const gameMatch = v.game_versions.includes(server.version);
        const loaderMatch = v.loaders.includes(softwareLower) || v.loaders.includes('spigot') || v.loaders.includes('paper');
        return gameMatch && loaderMatch;
      });

      if (match) {
        compatibleVersion = match;
      }

      const primaryFile = compatibleVersion.files.find((f: any) => f.primary) || compatibleVersion.files[0];
      if (!primaryFile) {
        return res.status(404).json({ error: 'No downloadable jar file found for compatible version.' });
      }

      // 1. Download primary plugin/mod
      console.log(`Installing primary file from Modrinth: ${primaryFile.url}`);
      await triggerDaemonDownload(primaryFile.url, primaryFile.filename);

      // 2. Resolve and install required dependencies
      if (compatibleVersion.dependencies && compatibleVersion.dependencies.length > 0) {
        for (const dep of compatibleVersion.dependencies) {
          if (dep.dependency_type === 'required') {
            console.log(`Resolving required dependency (project ID: ${dep.project_id})...`);
            try {
              const depVersionsRes = await axios.get(`https://api.modrinth.com/v2/project/${dep.project_id}/version`, {
                headers: { 'User-Agent': 'PilotPanel/1.0.0 (contact@pilotpanel.io)' }
              });
              const depVersions = depVersionsRes.data;
              let compatibleDep = depVersions[0];
              const depMatch = depVersions.find((dv: any) => {
                return dv.game_versions.includes(server.version) && (dv.loaders.includes(softwareLower) || dv.loaders.includes('spigot') || dv.loaders.includes('paper'));
              });
              if (depMatch) compatibleDep = depMatch;
              
              const depFile = compatibleDep.files.find((f: any) => f.primary) || compatibleDep.files[0];
              if (depFile) {
                console.log(`Installing dependency: ${depFile.filename} from ${depFile.url}`);
                await triggerDaemonDownload(depFile.url, depFile.filename);
              }
            } catch (depErr: any) {
              console.warn(`Failed to resolve dependency ${dep.project_id}: ${depErr.message}`);
            }
          }
        }
      }

      return res.json({ success: true, message: `Installed ${name} and resolved dependencies.` });

    } else if (source === 'SpigotMC') {
      const downloadUrl = `https://api.spiget.org/v2/resources/${id}/download`;
      // Clean name for safe filename
      const cleanFilename = `${name.replace(/[^a-zA-Z0-9_\-]/g, '_')}.jar`;
      
      console.log(`Installing from SpigotMC: ${downloadUrl}`);
      await triggerDaemonDownload(downloadUrl, cleanFilename);
      return res.json({ success: true, message: `Installed Spigot resource ${name}.` });

    } else if (source === 'Hangar') {
      // ID is owner/slug
      const [owner, slug] = id.split('/');
      const versionsResponse = await axios.get(`https://hangar.papermc.io/api/v1/projects/${owner}/${slug}/versions?limit=15`);
      const versions = versionsResponse.data.result;

      if (!versions || versions.length === 0) {
        return res.status(404).json({ error: 'No versions found on Hangar.' });
      }

      // Match platform compatibility (PAPER, VELOCITY, WATERFALL)
      let compatibleVersion = versions[0];
      const platformKey = softwareLower === 'paper' || softwareLower === 'purpur' || softwareLower === 'spigot' ? 'PAPER' :
                          softwareLower === 'velocity' ? 'VELOCITY' :
                          softwareLower === 'waterfall' ? 'WATERFALL' : '';

      if (platformKey) {
        const match = versions.find((v: any) => {
          return Object.keys(v.platformDependencies).includes(platformKey);
        });
        if (match) compatibleVersion = match;
      }

      const versionName = compatibleVersion.name;
      const downloadUrl = `https://hangar.papermc.io/api/v1/projects/${owner}/${slug}/versions/${versionName}/download`;
      const filename = `${slug}-${versionName}.jar`;

      console.log(`Installing from Hangar: ${downloadUrl}`);
      await triggerDaemonDownload(downloadUrl, filename);
      return res.json({ success: true, message: `Installed Hangar plugin ${name}.` });
    }

    return res.status(400).json({ error: 'Unknown installation source.' });

  } catch (error: any) {
    console.error('Plugin/Mod installation failed:', error.response?.data || error.message);
    return res.status(502).json({ error: error.response?.data?.error || 'Daemon failed to download plugin.' });
  }
};
