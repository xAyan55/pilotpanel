import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Terminal, Power, RotateCw, Play, CircleAlert, Folder, ToyBrick } from 'lucide-react';

interface ServerDetails {
  name: string;
  uuid: string;
  status: string;
  port: number;
  software: string;
  version: string;
  memoryLimit: number;
}

interface StatHistory {
  time: string;
  cpu: number;
  ram: number;
}

const ServerConsole: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [server, setServer] = useState<ServerDetails | null>(null);
  const [status, setStatus] = useState('offline');
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [stats, setStats] = useState({ cpuUsage: 0, memoryUsage: 0, diskUsage: 0 });
  const [statHistory, setStatHistory] = useState<StatHistory[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchServerDetails();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [uuid, token]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchServerDetails = async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/servers/${uuid}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setServer(data);
        setStatus(data.status);
      }
    } catch {}
  };

  const connectWebSocket = () => {
    if (wsRef.current) wsRef.current.close();

    const wsUrl = `ws://localhost:3000/api/ws?token=${token}&server=${uuid}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'console') {
          // Clean terminal ansi color codes
          const cleanLog = payload.data.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
          setLogs((prev) => [...prev.slice(-300), cleanLog]); // Keep last 300 lines
        } else if (payload.event === 'status') {
          setStatus(payload.data);
        } else if (payload.event === 'stats') {
          setStats({
            cpuUsage: payload.data.cpuUsage,
            memoryUsage: payload.data.memoryUsage,
            diskUsage: payload.data.diskUsage
          });

          // Add to chart history (limit 20 entries)
          setStatHistory((prev) => {
            const next = [...prev, {
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              cpu: payload.data.cpuUsage,
              ram: Math.round((payload.data.memoryUsage / payload.data.memoryLimit) * 100)
            }];
            return next.slice(-20);
          });
        }
      } catch {
        setLogs((prev) => [...prev.slice(-300), event.data]);
      }
    };

    ws.onclose = () => {
      setLogs((prev) => [...prev, '[System] WebSocket stream disconnected. Attempting reconnect...']);
      setTimeout(connectWebSocket, 5000);
    };
  };

  const sendPowerAction = async (action: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/servers/${uuid}/power`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        setStatus(action === 'start' ? 'starting' : action === 'stop' ? 'stopping' : 'offline');
      }
    } catch {
      alert('Failed to send power action.');
    }
  };

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({
      event: 'command',
      data: command
    }));

    setLogs((prev) => [...prev, `> ${command}`]);
    setCommand('');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">{server?.name || 'Minecraft Server'}</h1>
          <p className="page-subtitle" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.25rem' }}>
            <span className={`badge ${status === 'online' ? 'badge-success' : status === 'offline' ? 'badge-danger' : 'badge-warning'}`}>
              {status}
            </span>
            <span>IP Port: 127.0.0.1:{server?.port}</span>
            <span>{server?.software} ({server?.version})</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/servers/${uuid}/files`)}>
            <Folder size={16} /> File Manager
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/servers/${uuid}/plugins`)}>
            <ToyBrick size={16} /> Plugins
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="console-wrapper">
            <div className="console-logs" ref={logsEndRef}>
              {logs.length === 0 ? (
                <div style={{ color: '#929AAB', textAlign: 'center', marginTop: '5rem' }}>
                  Connecting to server output stream...
                </div>
              ) : (
                logs.map((line, idx) => (
                  <div key={idx} className="console-line">
                    {line}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendCommand} className="console-input-wrapper">
              <span className="console-input-prefix">$</span>
              <input
                type="text"
                className="console-input"
                placeholder="Type command here (e.g. op username)..."
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </form>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-success" onClick={() => sendPowerAction('start')} disabled={status === 'online'}>
              <Play size={16} /> Start
            </button>
            <button className="btn btn-warning" onClick={() => sendPowerAction('stop')} disabled={status === 'offline'}>
              <Power size={16} /> Stop
            </button>
            <button className="btn btn-secondary" onClick={() => sendPowerAction('restart')} disabled={status === 'offline'}>
              <RotateCw size={16} /> Restart
            </button>
            <button className="btn btn-danger" onClick={() => sendPowerAction('kill')} disabled={status === 'offline'} style={{ marginLeft: 'auto' }}>
              <CircleAlert size={16} /> Kill
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: '#929AAB', marginBottom: '1rem' }}>CPU Utilization</h3>
            <div className="stat-value">{stats.cpuUsage}%</div>
            <div style={{ width: '100%', height: 100, marginTop: '1rem' }}>
              <ResponsiveContainer>
                <LineChart data={statHistory}>
                  <Line type="monotone" dataKey="cpu" stroke="#393E46" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: '#929AAB', marginBottom: '1rem' }}>Memory Usage</h3>
            <div className="stat-value">{stats.memoryUsage} MB</div>
            <div style={{ fontSize: '0.8rem', color: '#929AAB' }}>Max Allowed: {server?.memoryLimit} MB</div>
            <div style={{ width: '100%', height: 100, marginTop: '1rem' }}>
              <ResponsiveContainer>
                <LineChart data={statHistory}>
                  <Line type="monotone" dataKey="ram" stroke="#929AAB" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: '#929AAB', marginBottom: '1rem' }}>Disk Storage</h3>
            <div className="stat-value">{stats.diskUsage} MB</div>
            <div style={{ fontSize: '0.8rem', color: '#929AAB' }}>Dynamic Allocation</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerConsole;
