import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Servers from './pages/Servers';
import ServerConsole from './pages/ServerConsole';
import FileManager from './pages/FileManager';
import PluginManager from './pages/PluginManager';
import Billing from './pages/Billing';
import Tickets from './pages/Tickets';
import Settings from './pages/Settings';
import { LayoutDashboard, Server, CreditCard, LifeBuoy, Settings as SettingsIcon, LogOut } from 'lucide-react';

const SidebarLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-text">
            PilotPanel<span className="logo-dot"></span>
          </div>
        </div>

        <nav>
          <ul className="nav-links">
            <li>
              <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/servers" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <Server size={18} />
                <span>Servers</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/billing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <CreditCard size={18} />
                <span>Billing</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/support" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <LifeBuoy size={18} />
                <span>Support</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <SettingsIcon size={18} />
                <span>Settings</span>
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div className="user-badge">
              <div className="user-avatar">
                {user.email.substring(0, 2).toUpperCase()}
              </div>
              <div className="user-info">
                <span className="user-email">{user.email}</span>
                <span className="user-role">{user.role}</span>
              </div>
            </div>
          )}
          <button className="btn btn-secondary" onClick={handleLogout} style={{ width: '100%', gap: '0.5rem', justifyContent: 'flex-start' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return <div className="auth-wrapper"><div className="card skeleton" style={{ width: '100px', height: '100px' }}></div></div>;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <SidebarLayout>{children}</SidebarLayout>;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Main routes */}
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/servers" element={<ProtectedRoute><Servers /></ProtectedRoute>} />
          <Route path="/servers/:uuid" element={<ProtectedRoute><ServerConsole /></ProtectedRoute>} />
          <Route path="/servers/:uuid/files" element={<ProtectedRoute><FileManager /></ProtectedRoute>} />
          <Route path="/servers/:uuid/plugins" element={<ProtectedRoute><PluginManager /></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
