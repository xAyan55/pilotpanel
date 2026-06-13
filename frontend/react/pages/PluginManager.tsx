import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Search, ToyBrick, Check, Download, ArrowUpRight, Power, Trash2, ShieldAlert } from 'lucide-react';

interface PluginItem {
  id: string;
  name: string;
  source: string;
  description: string;
  version: string;
  downloads: string;
}

interface InstalledPlugin {
  name: string;
  version: string;
  author: string;
  enabled: boolean;
  file: string;
}

interface InstalledMod {
  id: string;
  name: string;
  version: string;
  authors: string[];
  file: string;
}

interface DetectionResult {
  software: string;
  version: string;
  plugins: InstalledPlugin[];
  mods: InstalledMod[];
}

const PluginManager: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [activeTab, setActiveTab] = useState<'catalog' | 'installed'>('catalog');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('Modrinth');
  const [minecraftVersion, setMinecraftVersion] = useState('');
  const [loaderFilter, setLoaderFilter] = useState('');
  
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Auto-detection results
  const [detected, setDetected] = useState<DetectionResult | null>(null);
  const [detectLoading, setDetectLoading] = useState(true);

  useEffect(() => {
    runDetection();
  }, [uuid, token]);

  const runDetection = async () => {
    setDetectLoading(true);
    try {
      const res = await fetch(`/api/servers/${uuid}/detect`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data: DetectionResult = await res.json();
        setDetected(data);
        
        // Auto-configure filters based on server specs if not already set
        if (data.version && data.version !== 'Auto-detected') {
          setMinecraftVersion(data.version);
        }
        if (data.software) {
          const sw = data.software.toLowerCase();
          if (['paper', 'purpur', 'spigot'].includes(sw)) {
            setLoaderFilter('paper');
          } else if (['fabric', 'forge', 'neoforge', 'velocity', 'waterfall'].includes(sw)) {
            setLoaderFilter(sw);
          }
        }
      }
    } catch (err) {
      console.error('Failed to run server auto-detection:', err);
    } finally {
      setDetectLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let url = `/api/plugins/search?query=${encodeURIComponent(query)}&source=${source}`;
      if (minecraftVersion) url += `&version=${minecraftVersion}`;
      if (loaderFilter) url += `&loader=${loaderFilter}`;

      const res = await fetch(url, {
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
    try {
      const res = await fetch(`/api/servers/${uuid}/plugins/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: plugin.id,
          source: plugin.source,
          name: plugin.name
        })
      });

      if (res.ok) {
        // Refresh installed addons lists
        await runDetection();
      } else {
        const data = await res.json();
        alert(`Failed to install: ${data.error || 'Unknown error'}`);
      }
    } catch {
      alert('Error during installation.');
    } finally {
      setInstallingId(null);
    }
  };

  // Toggle plugin state (rename jar files to .disabled or vice versa)
  const handleTogglePlugin = async (plugin: InstalledPlugin) => {
    const isCurrentlyEnabled = plugin.enabled;
    const oldPath = `plugins/${plugin.file}`;
    const newFile = isCurrentlyEnabled ? `${plugin.file}.disabled` : plugin.file.replace('.disabled', '');
    const newPath = `plugins/${newFile}`;

    try {
      const res = await fetch(`/api/servers/${uuid}/files/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ oldPath, newPath })
      });

      if (res.ok) {
        await runDetection();
      } else {
        alert('Failed to change plugin state.');
      }
    } catch {
      alert('Error communicating with daemon.');
    }
  };

  // Uninstall addon file
  const handleUninstall = async (file: string, folder: 'plugins' | 'mods') => {
    if (!window.confirm(`Are you sure you want to delete ${file}?`)) return;

    try {
      const res = await fetch(`/api/servers/${uuid}/files`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ path: `${folder}/${file}` })
      });

      if (res.ok) {
        await runDetection();
      } else {
        alert('Failed to delete file.');
      }
    } catch {
      alert('Error communicating with daemon.');
    }
  };

  // Check if a plugin/mod is already installed (matches project title or slug)
  const isProjectInstalled = (projectName: string) => {
    if (!detected) return false;
    const cleanName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const inPlugins = detected.plugins.some(
      (p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName
    );
    const inMods = detected.mods.some(
      (m) => m.name.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName
    );
    return inPlugins || inMods;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Plugin & Mod Installer</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/servers/${uuid}`)}>Console</span>
            <ArrowUpRight size={14} />
            <span>Search live Minecraft repositories or manage active server files</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem', paddingBottom: '0.5rem' }}>
        <button
          className="btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'catalog' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            borderBottom: activeTab === 'catalog' ? '2px solid var(--text-primary)' : 'none',
            borderRadius: 0,
            padding: '0.5rem 1rem'
          }}
          onClick={() => setActiveTab('catalog')}
        >
          Addon Marketplace
        </button>
        <button
          className="btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'installed' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            borderBottom: activeTab === 'installed' ? '2px solid var(--text-primary)' : 'none',
            borderRadius: 0,
            padding: '0.5rem 1rem'
          }}
          onClick={() => setActiveTab('installed')}
        >
          Installed Addons (
          {detectLoading ? '...' : (detected?.plugins.length || 0) + (detected?.mods.length || 0)}
          )
        </button>
      </div>

      {activeTab === 'catalog' ? (
        <>
          {/* Marketplace Search Filters */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: '2 1 300px', marginBottom: 0 }}>
                <label className="form-label">Search Addons</label>
                <div className="console-input-wrapper" style={{ padding: '0.75rem 1rem', background: 'white', border: '1px solid rgba(0,0,0,0.08)' }}>
                  <Search size={18} color="#929AAB" style={{ marginRight: '0.5rem' }} />
                  <input
                    type="text"
                    className="console-input"
                    style={{ color: '#393E46' }}
                    placeholder="Search LuckPerms, EssentialsX, WorldEdit, JEI..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                <label className="form-label">API Catalog</label>
                <select className="form-control" style={{ background: 'white' }} value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="Modrinth">Modrinth Marketplace</option>
                  <option value="SpigotMC">SpigotMC (Plugins only)</option>
                  <option value="Hangar">Hangar (Paper/Velocity)</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
                <label className="form-label">Game Version</label>
                <input
                  type="text"
                  placeholder="e.g. 1.20.1"
                  className="form-control"
                  style={{ background: 'white' }}
                  value={minecraftVersion}
                  onChange={(e) => setMinecraftVersion(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flex: '1 1 130px', marginBottom: 0 }}>
                <label className="form-label">Server Loader</label>
                <select className="form-control" style={{ background: 'white' }} value={loaderFilter} onChange={(e) => setLoaderFilter(e.target.value)}>
                  <option value="">Any Loader</option>
                  <option value="paper">Paper/Purpur</option>
                  <option value="fabric">Fabric</option>
                  <option value="forge">Forge</option>
                  <option value="neoforge">NeoForge</option>
                  <option value="velocity">Velocity</option>
                </select>
              </div>

              <button type="submit" className="btn btn-primary" style={{ padding: '0.8rem 2rem' }}>Search</button>
            </form>
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: '400px' }}></div>
          ) : (
            <div className="plugin-grid">
              {plugins.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                  <ToyBrick size={48} style={{ margin: '0 auto 1rem' }} />
                  <h3>No results found in {source}.</h3>
                  <p>Try refining your search keyword or loader options.</p>
                </div>
              ) : (
                plugins.map((plugin) => {
                  const isInstalled = isProjectInstalled(plugin.name);
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
                          {plugin.description || 'No description available.'}
                        </p>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '1rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#929AAB' }}>{plugin.downloads} downloads</span>
                        {isInstalled ? (
                          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', gap: '0.25rem' }} disabled>
                            <Check className="badge-success" size={12} style={{ color: 'var(--color-success)' }} /> Installed
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
                })
              )}
            </div>
          )}
        </>
      ) : (
        /* Installed Addons Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {detectLoading ? (
            <div className="skeleton" style={{ height: '300px' }}></div>
          ) : (
            <>
              {/* Detected Plugins */}
              <div className="card">
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ToyBrick size={20} color="var(--color-success)" />
                  Installed Plugins ({detected?.plugins.length || 0})
                </h3>

                {detected?.plugins.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
                    No plugins detected in the /plugins folder.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Plugin Name</th>
                          <th>Version</th>
                          <th>Author</th>
                          <th>File Name</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detected?.plugins.map((plugin) => (
                          <tr key={plugin.file} style={{ opacity: plugin.enabled ? 1 : 0.6 }}>
                            <td><strong>{plugin.name}</strong></td>
                            <td>{plugin.version}</td>
                            <td>{plugin.author}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{plugin.file}</td>
                            <td>
                              <span className={`badge ${plugin.enabled ? 'badge-success' : 'badge-danger'}`}>
                                {plugin.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', gap: '0.25rem' }}
                                  onClick={() => handleTogglePlugin(plugin)}
                                  title={plugin.enabled ? "Disable plugin" : "Enable plugin"}
                                >
                                  <Power size={12} color={plugin.enabled ? "var(--color-danger)" : "var(--color-success)"} />
                                  {plugin.enabled ? 'Disable' : 'Enable'}
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  style={{ padding: '0.35rem' }}
                                  onClick={() => handleUninstall(plugin.file, 'plugins')}
                                  title="Uninstall plugin"
                                >
                                  <Trash2 size={12} color="#D9534F" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Detected Mods */}
              <div className="card">
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldAlert size={20} color="var(--color-info)" />
                  Installed Mods ({detected?.mods.length || 0})
                </h3>

                {detected?.mods.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
                    No mods detected in the /mods folder.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Mod Name</th>
                          <th>Version</th>
                          <th>Authors</th>
                          <th>File Name</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detected?.mods.map((mod) => (
                          <tr key={mod.file}>
                            <td><strong>{mod.name}</strong></td>
                            <td>{mod.version}</td>
                            <td>{mod.authors.join(', ')}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{mod.file}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.35rem' }}
                                onClick={() => handleUninstall(mod.file, 'mods')}
                                title="Uninstall mod"
                              >
                                <Trash2 size={12} color="#D9534F" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PluginManager;
