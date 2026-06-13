import { Request, Response } from 'express';
import axios from 'axios';

// Static stubs for popular plugins in case of API rate limits or network issues
const POPULAR_PLUGINS = [
  { id: 'worldedit', name: 'WorldEdit', source: 'Modrinth', description: 'Easy to use in-game world editor.', version: '7.3.0', downloads: '12.4M' },
  { id: 'essentialsx', name: 'EssentialsX', source: 'SpigotMC', description: 'Essential commands and features for server management.', version: '2.20.1', downloads: '8.2M' },
  { id: 'luckperms', name: 'LuckPerms', source: 'Modrinth', description: 'An advanced permissions plugin for Minecraft servers.', version: '5.4.120', downloads: '9.8M' },
  { id: 'viaversion', name: 'ViaVersion', source: 'SpigotMC', description: 'Allows newer client connections to older server versions.', version: '4.9.2', downloads: '5.1M' },
  { id: 'dynmap', name: 'Dynmap', source: 'Modrinth', description: 'A real-time web-based map for your Minecraft server.', version: '3.6', downloads: '3.9M' }
];

export const searchPlugins = async (req: Request, res: Response) => {
  const { query, source } = req.query; // query string, source: "Modrinth" | "SpigotMC" | "Hangar"

  if (!query) {
    return res.json(POPULAR_PLUGINS);
  }

  try {
    if (source === 'Modrinth') {
      const response = await axios.get(`https://api.modrinth.com/v2/search?query=${query}&facets=[["categories:plugin"]]`, {
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
      const response = await axios.get(`https://api.spiget.org/v2/search/resources/${query}?size=10`);
      const results = response.data.map((res: any) => ({
        id: res.id.toString(),
        name: res.name,
        source: 'SpigotMC',
        description: res.tag,
        version: 'Latest',
        downloads: res.downloads?.toLocaleString() || '0'
      }));
      return res.json(results);
    } else {
      // Default / fallback combining stubs
      const filtered = POPULAR_PLUGINS.filter(p => p.name.toLowerCase().includes(query.toString().toLowerCase()));
      return res.json(filtered);
    }
  } catch (error) {
    console.warn('API fetch failed, falling back to static lists:', error);
    const filtered = POPULAR_PLUGINS.filter(p => p.name.toLowerCase().includes(query.toString().toLowerCase()));
    return res.json(filtered);
  }
};

export const getPopularRecommendations = async (req: Request, res: Response) => {
  return res.json(POPULAR_PLUGINS);
};
