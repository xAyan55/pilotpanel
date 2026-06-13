import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Plus, Server, Layers, Cpu, Database, Trash2 } from 'lucide-react';

interface ServerType {
  id: string;
  name: string;
  uuid: string;
  port: number;
  software: string;
  version: string;
  status: string;
  memoryLimit: number;
  cpuLimit: number;
  node: { name: string };
  user?: { email: string };
}

interface NodeType {
  id: string;
  name: string;
}

const Servers: React.FC = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerType[]>([]);
  const [nodes, setNodes] = useState<NodeType[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [port, setPort] = useState('25565');
  const [software, setSoftware] = useState('Paper');
  const [version, setVersion] = useState('1.20.6');
  const [memoryLimit, setMemoryLimit] = useState('1024');
  const [cpuLimit, setCpuLimit] = useState('1.0');
  const [diskLimit, setDiskLimit] = useState('10000');
  const [targetUserId, setTargetUserId] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [creating, setCreating] = useState(false);

  const isAdmin = user?.role === 'Owner' || user?.role === 'Administrator';

  useEffect(() => {
    fetchServers();
    if (isAdmin) {
      fetchNodes();
    }
  }, [token, user]);

  const fetchServers = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/servers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setServers(data);
      }
    } catch (err) {
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchNodes = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/nodes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNodes(data);
        if (data.length > 0) {
          setNodeId(data[0].id);
        }
      }
    } catch {}
  };

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setCreating(true);

    try {
      const res = await fetch('http://localhost:3000/api/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          nodeId,
          port,
          software,
          version,
          memoryLimit,
          cpuLimit,
          diskLimit,
          userId: targetUserId || user?.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create server.');
      }

      setShowModal(false);
      setName('');
      fetchServers();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteServer = async (uuid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this server and all its files?')) return;

    try {
      const res = await fetch(`http://localhost:3000/api/servers/${uuid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchServers();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to delete server.');
      }
    } catch (err) {
      alert('Network error during deletion.');
    }
  };

  if (loading) {
    return (
      <div className="skeleton" style={{ width: '100%', height: '500px', borderRadius: '18px' }}></div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Servers</h1>
          <p className="page-subtitle">Manage, control, and deploy your Minecraft instances.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => {
            setTargetUserId(user?.id || '');
            setShowModal(true);
          }}>
            <Plus size={18} /> Deploy Server
          </button>
        )}
      </div>

      <div className="table-container card">
        {servers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <Server size={48} color="#929AAB" style={{ marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>No servers found</h3>
            <p style={{ color: '#686D76', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              {isAdmin ? 'Deploy a new server using the button above.' : 'Contact an administrator to get a server assigned.'}
            </p>
          </div>
        ) : (
          <table className="custom-table">
            <thead>
              <tr>
                <th>Server Name</th>
                <th>Software / Version</th>
                <th>Node</th>
                <th>Hardware Limits</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {servers.map((srv) => (
                <tr key={srv.id} onClick={() => navigate(`/servers/${srv.uuid}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Server size={18} color="#929AAB" />
                      <div>
                        <div>{srv.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#929AAB', fontWeight: 400 }}>Port: {srv.port}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-info">{srv.software} {srv.version}</span>
                  </td>
                  <td>{srv.node?.name || 'Local'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#686D76' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Database size={14} /> {(srv.memoryLimit / 1024).toFixed(1)}GB
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Cpu size={14} /> {srv.cpuLimit} Cores
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${srv.status === 'online' ? 'badge-success' : srv.status === 'offline' ? 'badge-danger' : 'badge-warning'}`}>
                      {srv.status}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn-secondary" onClick={(e) => handleDeleteServer(srv.uuid, e)} style={{ padding: '0.4rem' }}>
                        <Trash2 size={16} color="#D9534F" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', padding: '2.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1.5rem' }}>Deploy Minecraft Server</h2>

            {submitError && (
              <div style={{ color: '#D9534F', background: 'rgba(219,83,79,0.1)', padding: '0.75rem', borderRadius: '12px', marginBottom: '1rem', fontSize: '0.9rem' }}>
                {submitError}
              </div>
            )}

            <form onSubmit={handleCreateServer}>
              <div className="form-group">
                <label className="form-label">Server Name</label>
                <input type="text" className="form-control" placeholder="Survival Server" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Node</label>
                  <select className="form-control" value={nodeId} onChange={(e) => setNodeId(e.target.value)} required>
                    {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Server Port</label>
                  <input type="number" className="form-control" value={port} onChange={(e) => setPort(e.target.value)} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Software Type</label>
                  <select className="form-control" value={software} onChange={(e) => setSoftware(e.target.value)}>
                    <option value="Paper">Paper (Recommended)</option>
                    <option value="Purpur">Purpur</option>
                    <option value="Spigot">Spigot</option>
                    <option value="Vanilla">Vanilla</option>
                    <option value="Velocity">Velocity Proxy</option>
                    <option value="Waterfall">Waterfall Proxy</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Minecraft Version</label>
                  <select className="form-control" value={version} onChange={(e) => setVersion(e.target.value)}>
                    <option value="1.20.6">1.20.6 (Latest)</option>
                    <option value="1.20.4">1.20.4</option>
                    <option value="1.19.4">1.19.4</option>
                    <option value="1.18.2">1.18.2</option>
                    <option value="1.16.5">1.16.5</option>
                    <option value="1.12.2">1.12.2</option>
                    <option value="1.8.8">1.8.8</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">RAM (MB)</label>
                  <input type="number" className="form-control" value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">CPU Cores</label>
                  <input type="text" className="form-control" value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Disk Space (MB)</label>
                  <input type="number" className="form-control" value={diskLimit} onChange={(e) => setDiskLimit(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Assign Owner User ID</label>
                <input type="text" className="form-control" placeholder={user?.id} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Setting Up...' : 'Deploy Now'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Servers;
