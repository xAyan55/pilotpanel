import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { KeyRound, ShieldCheck, Laptop, History, ToggleLeft, ToggleRight, Plus } from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  details: string;
  ipAddress: string;
  createdAt: string;
  user?: { email: string };
}

const Settings: React.FC = () => {
  const { token, user } = useAuth();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled || false);
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  
  // Node Registration
  const [nodeName, setNodeName] = useState('');
  const [nodeIp, setNodeIp] = useState('');
  const [registeredNode, setRegisteredNode] = useState<any | null>(null);

  const isAdmin = user?.role === 'Owner' || user?.role === 'Administrator';

  useEffect(() => {
    if (token) {
      fetchAuditLogs();
    }
  }, [token]);

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/admin/audit-logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch {}
  };

  const handleToggle2FA = async () => {
    try {
      if (twoFactorEnabled) {
        const res = await fetch('http://localhost:3000/api/auth/2fa/disable', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          setTwoFactorEnabled(false);
          setTwoFactorSecret('');
          setQrCodeUrl('');
        }
      } else {
        const res = await fetch('http://localhost:3000/api/auth/2fa/enable', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTwoFactorSecret(data.secret);
          setQrCodeUrl(data.qrCodeUrl);
          setTwoFactorEnabled(true);
        }
      }
    } catch {
      alert('Failed to update 2FA configuration.');
    }
  };

  const handleRegisterNode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3000/api/nodes/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: nodeName, ipAddress: nodeIp })
      });
      if (res.ok) {
        const data = await res.json();
        setRegisteredNode(data.node);
        setNodeName('');
        setNodeIp('');
      } else {
        alert('Failed to register node.');
      }
    } catch {
      alert('Node connection error.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings & Nodes</h1>
          <p className="page-subtitle">Configure security keys, connect hardware nodes, and inspect log histories.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <ShieldCheck size={20} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Two-Factor Authentication (2FA)</h3>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Secure Login Credentials</div>
                <div style={{ fontSize: '0.85rem', color: '#929AAB', marginTop: '0.25rem' }}>
                  Protect your host with secondary OTP passcodes.
                </div>
              </div>
              <div onClick={handleToggle2FA} style={{ cursor: 'pointer' }}>
                {twoFactorEnabled ? <ToggleRight size={40} color="#4E9F3D" /> : <ToggleLeft size={40} color="#929AAB" />}
              </div>
            </div>

            {twoFactorSecret && (
              <div style={{
                background: 'var(--bg-secondary)',
                padding: '1rem',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                fontSize: '0.9rem'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Authenticator Setup Secret:</div>
                <code style={{ fontSize: '1.1rem', fontWeight: 'bold', letterSpacing: '1px' }}>{twoFactorSecret}</code>
                <p style={{ fontSize: '0.75rem', color: '#686D76', marginTop: '0.5rem' }}>
                  Scan the QR code in Google Authenticator or input the secret key manually.
                </p>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <Laptop size={20} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Register New Game Node</h3>
              </div>

              <form onSubmit={handleRegisterNode} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Node Name</label>
                  <input type="text" className="form-control" placeholder="node-01-us" value={nodeName} onChange={(e) => setNodeName(e.target.value)} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Node IP Address</label>
                  <input type="text" className="form-control" placeholder="127.0.0.1" value={nodeIp} onChange={(e) => setNodeIp(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ gap: '0.5rem' }}>
                  <Plus size={16} /> Link Daemon Node
                </button>
              </form>

              {registeredNode && (
                <div style={{
                  background: 'rgba(78, 159, 61, 0.1)',
                  color: '#4E9F3D',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(78,159,61,0.2)',
                  marginTop: '1.5rem',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Node Registered! Daemon Token:</div>
                  <code style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{registeredNode.token}</code>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#393E46' }}>
                    Configure this token on your game node's daemon config file.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '550px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <History size={20} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Audit Logs (Last 50 Actions)</h3>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#929AAB', padding: '2rem' }}>
                No active session logs found.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} style={{
                  padding: '0.75rem',
                  background: 'rgba(0,0,0,0.02)',
                  borderRadius: '8px',
                  border: '1px solid rgba(0,0,0,0.04)',
                  fontSize: '0.85rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>{log.action}</span>
                    <span style={{ color: '#929AAB', fontWeight: 400 }}>{new Date(log.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p style={{ color: '#686D76', marginTop: '0.25rem' }}>{log.details}</p>
                  <div style={{ fontSize: '0.75rem', color: '#929AAB', marginTop: '0.25rem' }}>
                    IP: {log.ipAddress} {log.user ? `| User: ${log.user.email}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
