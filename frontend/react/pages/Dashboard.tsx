import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Server, Activity, Database, Cpu, Network, HardDrive } from 'lucide-react';

interface Stats {
  totalServers: number;
  runningServers: number;
  totalNodes: number;
  totalRam: number;
  totalCpu: number;
  networkUsage: string;
  activeNodes: number;
}

const mockChartData = [
  { name: '10:00', cpu: 20, ram: 30 },
  { name: '10:10', cpu: 40, ram: 45 },
  { name: '10:20', cpu: 35, ram: 50 },
  { name: '10:30', cpu: 55, ram: 60 },
  { name: '10:40', cpu: 50, ram: 55 },
  { name: '10:50', cpu: 75, ram: 65 },
  { name: '11:00', cpu: 60, ram: 70 },
];

const Dashboard: React.FC = () => {
  const { token } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/dashboard/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [token]);

  if (loading) {
    return (
      <div>
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <div>
            <div className="skeleton" style={{ width: '200px', height: '2.5rem', marginBottom: '0.5rem' }}></div>
            <div className="skeleton" style={{ width: '350px', height: '1.25rem' }}></div>
          </div>
        </div>
        <div className="stats-grid" style={{ marginBottom: '2rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card skeleton" style={{ height: '120px' }}></div>
          ))}
        </div>
        <div className="dashboard-grid">
          <div className="card skeleton" style={{ height: '350px' }}></div>
          <div className="card skeleton" style={{ height: '350px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Real-time status overview of your Minecraft hosting cluster.</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: '2.5rem' }}>
        <div className="card stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-label">Total Servers</span>
            <Server size={20} color="#929AAB" />
          </div>
          <div className="stat-value">
            {stats?.totalServers || 0}
            <span className="stat-trend trend-up">Active</span>
          </div>
        </div>

        <div className="card stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-label">Running Servers</span>
            <Activity size={20} color="#4E9F3D" />
          </div>
          <div className="stat-value">
            {stats?.runningServers || 0}
            <span className="stat-trend trend-up">Online</span>
          </div>
        </div>

        <div className="card stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-label">Allocated RAM</span>
            <Database size={20} color="#929AAB" />
          </div>
          <div className="stat-value">
            {stats ? (stats.totalRam / 1024).toFixed(1) : 0} GB
            <span className="stat-trend trend-up">Healthy</span>
          </div>
        </div>

        <div className="card stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-label">Network Usage</span>
            <Network size={20} color="#929AAB" />
          </div>
          <div className="stat-value" style={{ fontSize: '1.6rem' }}>
            {stats?.networkUsage || '0 MB/s'}
            <span className="stat-trend trend-up">Peak</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem', color: '#393E46' }}>
            Cluster Resource Load (Historical)
          </h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#393E46" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#393E46" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#929AAB" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#929AAB" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" stroke="#929AAB" style={{ fontSize: '12px' }} />
                <YAxis stroke="#929AAB" style={{ fontSize: '12px' }} />
                <Tooltip />
                <Area type="monotone" dataKey="cpu" name="CPU Load (%)" stroke="#393E46" fillOpacity={1} fill="url(#colorCpu)" strokeWidth={2} />
                <Area type="monotone" dataKey="ram" name="RAM Allocation (%)" stroke="#929AAB" fillOpacity={1} fill="url(#colorRam)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#393E46' }}>
            Nodes Status ({stats?.totalNodes || 0})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[1].map((_, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                backgroundColor: 'rgba(0,0,0,0.02)',
                borderRadius: '12px',
                border: '1px solid rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#4E9F3D'
                  }}></div>
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Main-Game-Node-01</h4>
                    <p style={{ fontSize: '0.75rem', color: '#686D76' }}>127.0.0.1:3001</p>
                  </div>
                </div>
                <span className="badge badge-success">Online</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
