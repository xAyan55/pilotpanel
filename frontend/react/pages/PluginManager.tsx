import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Search, ToyBrick, Check, Download, ArrowUpRight } from 'lucide-react';

interface PluginItem {
  id: string;
  name: string;
  source: string;
  description: string;
  version: string;
  downloads: string;
}

const PluginManager: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('Modrinth');
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installedPlugins, setInstalledPlugins] = useState<Record<string, boolean>>({});
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
    checkInstalledJars();
  }, [uuid, token]);

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/plugins/popular', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlugins(data);
      }
    } catch {
      console.error('Failed to load plugin suggestions');
    } finally {
      setLoading(false);
    }
  };

  const checkInstalledJars = async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/servers/${uuid}/files?path=plugins`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const files = await res.json();
        const map: Record<string, boolean> = {};
        files.forEach((f: any) => {
          if (f.name.endsWith('.jar')) {
            const cleanName = f.name.replace('.jar', '').toLowerCase();
            map[cleanName] = true;
          }
        });
        setInstalledPlugins(map);
      }
    } catch {}
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3000/api/plugins/search?query=${encodeURIComponent(query)}&source=${source}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlugins(data);
      }
    } catch {
      alert('Search request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (plugin: PluginItem) => {
    setInstallingId(plugin.id);
    const installPath = `plugins/${plugin.name.toLowerCase()}.jar`;

    try {
      // Direct call to write a mock Jar byte-buffer or file inside the plugins directory
      const res = await fetch(`http://localhost:3000/api/servers/${uuid}/files/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          path: installPath,
          content: `# Mock Minecraft plugin binary for ${plugin.name} (Source: ${plugin.source})\n`
        })
      });

      if (res.ok) {
        setInstalledPlugins((prev) => ({ ...prev, [plugin.name.toLowerCase()]: true }));
      } else {
        alert('Failed to install jar.');
      }
    } catch {
      alert('Error during installation.');
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Plugin & Mod Installer</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/servers/${uuid}`)}>Console</span>
            <ArrowUpRight size={14} />
            <span>Search SpigotMC, Modrinth, and Hangar</span>
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <div className="console-input-wrapper" style={{ padding: '0.75rem 1rem', background: 'white', border: '1px solid rgba(0,0,0,0.08)' }}>
              <Search size={18} color="#929AAB" style={{ marginRight: '0.5rem' }} />
              <input
                type="text"
                className="console-input"
                style={{ color: '#393E46' }}
                placeholder="Search LuckPerms, EssentialsX, WorldEdit..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ width: '180px', marginBottom: 0 }}>
            <select className="form-control" style={{ background: 'white' }} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="Modrinth">Modrinth Marketplace</option>
              <option value="SpigotMC">SpigotMC Catalog</option>
              <option value="Hangar">Hangar Releases</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ padding: '0 2rem' }}>Search</button>
        </form>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: '300px' }}></div>
      ) : (
        <div className="plugin-grid">
          {plugins.map((plugin) => {
            const isInstalled = installedPlugins[plugin.name.toLowerCase()];
            const isInstalling = installingId === plugin.id;

            return (
              <div key={plugin.id} className="card plugin-card">
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <span className="plugin-source">{plugin.source}</span>
                    <ToyBrick size={18} color="#929AAB" />
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.5rem' }}>{plugin.name}</h3>
                  <p style={{ color: '#686D76', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '1rem' }}>
                    {plugin.description || 'No description provided by the mod creator.'}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#929AAB' }}>{plugin.downloads} installs</span>
                  {isInstalled ? (
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.25rem' }} disabled>
                      <Check size={12} color="#4E9F3D" /> Installed
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.25rem' }}
                      onClick={() => handleInstall(plugin)}
                      disabled={isInstalling}
                    >
                      <Download size={12} /> {isInstalling ? 'Installing...' : 'Install'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PluginManager;
