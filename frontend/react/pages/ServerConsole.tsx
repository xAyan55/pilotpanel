import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Terminal, Power, RotateCw, Play, CircleAlert, Folder, ToyBrick, Search, Pause, PlayCircle, Trash2, Download } from 'lucide-react';

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

const LINE_HEIGHT = 20; // fixed height for virtualized lines (in pixels)

const ServerConsole: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  
  const [server, setServer] = useState<ServerDetails | null>(null);
  const [status, setStatus] = useState<string>('offline');
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [stats, setStats] = useState({ cpuUsage: 0, memoryUsage: 0, diskUsage: 0 });
  const [statHistory, setStatHistory] = useState<StatHistory[]>([]);
  
  // Console Settings
  const [searchQuery, setSearchQuery] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Virtualization Scroll Container States
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(380);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Load server details and open connection
  useEffect(() => {
    fetchServerDetails();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [uuid, token]);

  // Adjust container height dynamically on resize
  useEffect(() => {
    if (logsContainerRef.current) {
      setContainerHeight(logsContainerRef.current.clientHeight || 380);
    }
  }, [logsContainerRef.current]);

  // Handle scroll events for virtualization & auto-pause
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    
    // Auto-detect manual scroll up
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 40;
    if (!isAtBottom && !isPaused && searchQuery === '') {
      // User scrolled up, pause auto-scroll
      setIsPaused(true);
    } else if (isAtBottom && isPaused && searchQuery === '') {
      // User scrolled back to the bottom, resume auto-scroll
      setIsPaused(false);
    }
  };

  // Auto-scroll on new log arrival
  useEffect(() => {
    if (isPaused || searchQuery !== '') return;
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, isPaused, searchQuery]);

  const fetchServerDetails = async () => {
    try {
      const res = await fetch(`/api/servers/${uuid}`, {
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

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/ws?token=${token}&server=${uuid}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === 'history') {
          const cleanHistory = payload.data.map((l: any) => 
            l.text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
          );
          setLogs(cleanHistory);
        } else if (payload.event === 'console') {
          const cleanLog = payload.data.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
          setLogs((prev) => [...prev.slice(-999), cleanLog]);
        } else if (payload.event === 'status') {
          setStatus(payload.data);
        } else if (payload.event === 'stats') {
          setStats({
            cpuUsage: payload.data.cpuUsage,
            memoryUsage: payload.data.memoryUsage,
            diskUsage: payload.data.diskUsage
          });

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
        setLogs((prev) => [...prev.slice(-999), event.data]);
      }
    };

    ws.onclose = () => {
      setLogs((prev) => [...prev, '[System] WebSocket stream disconnected. Reconnecting in 5s...']);
      setTimeout(connectWebSocket, 5000);
    };
  };

  const sendPowerAction = async (action: string) => {
    try {
      const res = await fetch(`/api/servers/${uuid}/power`, {
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

  const handleSendCommand = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!command.trim() || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({
      event: 'command',
      data: command
    }));

    setCommandHistory((prev) => [command, ...prev.slice(0, 49)]); // Store last 50 commands
    setHistoryIndex(-1);
    setLogs((prev) => [...prev, `> ${command}`]);
    setCommand('');
  };

  // Command History arrow key navigation & keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setCommand(commandHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommand(commandHistory[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  // Keyboard shortcut Ctrl + L for clear console
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setLogs([]);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  const handleClearConsole = () => {
    setLogs([]);
  };

  const handleDownloadLogs = () => {
    const element = document.createElement("a");
    const file = new Blob([logs.join("\n")], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${server?.name || 'server'}-console.log`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Log filter based on search query
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    return logs.filter((l) => l.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [logs, searchQuery]);

  // Virtualization Calculations
  const totalHeight = filteredLogs.length * LINE_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - 5);
  const endIndex = Math.min(filteredLogs.length, Math.ceil((scrollTop + containerHeight) / LINE_HEIGHT) + 5);

  const visibleLines = useMemo(() => {
    return filteredLogs.slice(startIndex, endIndex).map((line, index) => ({
      index: startIndex + index,
      text: line
    }));
  }, [filteredLogs, startIndex, endIndex]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">{server?.name || 'Minecraft Server'}</h1>
          <p className="page-subtitle" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.25rem' }}>
            <span className={`badge ${status === 'online' ? 'badge-success' : status === 'offline' ? 'badge-danger' : 'badge-warning'}`}>
              {status}
            </span>
            <span>Port: {server?.port}</span>
            <span>{server?.software} ({server?.version})</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/servers/${uuid}/files`)}>
            <Folder size={16} /> File Manager
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/servers/${uuid}/plugins`)}>
            <ToyBrick size={16} /> Plugins / Mods
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Terminal Console */}
          <div className="console-wrapper" style={{ height: '480px' }}>
            
            {/* Console Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, maxWidth: '280px' }}>
                <Search size={14} color="#929AAB" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '0.8rem',
                    width: '100%'
                  }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', color: 'white', borderColor: 'rgba(255,255,255,0.1)' }}
                  onClick={() => setIsPaused(!isPaused)}
                  title={isPaused ? "Resume auto-scroll" : "Pause auto-scroll"}
                >
                  {isPaused ? <PlayCircle size={12} style={{ marginRight: '4px' }} /> : <Pause size={12} style={{ marginRight: '4px' }} />}
                  {isPaused ? "Resumed" : "Scroll Paused"}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', color: 'white', borderColor: 'rgba(255,255,255,0.1)' }}
                  onClick={handleClearConsole}
                >
                  <Trash2 size={12} style={{ marginRight: '4px' }} /> Clear
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', color: 'white', borderColor: 'rgba(255,255,255,0.1)' }}
                  onClick={handleDownloadLogs}
                >
                  <Download size={12} style={{ marginRight: '4px' }} /> Download
                </button>
              </div>
            </div>

            {/* Virtualized Logs Window */}
            <div
              className="console-logs"
              ref={logsContainerRef}
              onScroll={handleScroll}
              style={{
                position: 'relative',
                overflowY: 'auto',
                overflowX: 'auto',
                whiteSpace: 'pre',
                lineHeight: `${LINE_HEIGHT}px`
              }}
            >
              <div style={{ height: `${totalHeight}px`, width: '100%', position: 'relative' }}>
                {visibleLines.map((line) => (
                  <div
                    key={line.index}
                    className="console-line"
                    style={{
                      position: 'absolute',
                      top: `${line.index * LINE_HEIGHT}px`,
                      left: 0,
                      right: 0,
                      height: `${LINE_HEIGHT}px`,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
              {filteredLogs.length === 0 && (
                <div style={{ color: '#929AAB', textAlign: 'center', padding: '4rem' }}>
                  {searchQuery ? "No log lines match your query." : "Connecting to console output..."}
                </div>
              )}
            </div>

            {/* Command Input */}
            <form onSubmit={handleSendCommand} className="console-input-wrapper">
              <span className="console-input-prefix">$</span>
              <input
                type="text"
                className="console-input"
                placeholder="Type Minecraft command here (Press Up/Down for history)..."
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
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
