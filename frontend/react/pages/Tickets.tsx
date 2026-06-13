import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Plus, Check, LifeBuoy, ExternalLink, HelpCircle, Send } from 'lucide-react';

interface Message {
  id: string;
  message: string;
  isStaffReply: boolean;
  createdAt: string;
  user: { email: string; role: string };
}

interface Ticket {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
}

interface KBArticle {
  id: string;
  title: string;
  content: string;
  category: string;
}

const Tickets: React.FC = () => {
  const { token, user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Ticket Selection
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Ticket Creation Form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Technical');
  const [priority, setPriority] = useState('Medium');
  const [initialMsg, setInitialMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<'tickets' | 'kb'>('tickets');
  const [kbQuery, setKbQuery] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTicketsAndKB();
  }, [token]);

  useEffect(() => {
    if (selectedTicketId) {
      fetchTicketDetails(selectedTicketId);
    }
  }, [selectedTicketId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollTop = chatEndRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchTicketsAndKB = async () => {
    setLoading(true);
    try {
      const tRes = await fetch('http://localhost:3000/api/support/tickets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const kbRes = await fetch('http://localhost:3000/api/support/kb', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (tRes.ok) setTickets(await tRes.json());
      if (kbRes.ok) setArticles(await kbRes.json());
    } catch {}
    finally {
      setLoading(false);
    }
  };

  const fetchTicketDetails = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/support/tickets/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTicket(data);
        setMessages(data.messages);
      }
    } catch {}
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !initialMsg.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('http://localhost:3000/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, category, priority, message: initialMsg })
      });

      if (res.ok) {
        setTitle('');
        setInitialMsg('');
        setShowCreate(false);
        fetchTicketsAndKB();
      }
    } catch {
      alert('Failed to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicketId) return;

    setSendingReply(true);
    try {
      const res = await fetch(`http://localhost:3000/api/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: replyText })
      });

      if (res.ok) {
        setReplyText('');
        fetchTicketDetails(selectedTicketId);
      }
    } catch {
      alert('Could not submit reply.');
    } finally {
      setSendingReply(false);
    }
  };

  // Pre-seed default articles if database is completely empty
  const defaultArticles = articles.length > 0 ? articles : [
    { id: '1', title: 'How to allocate more RAM to your server', content: 'Navigate to Servers inside your dashboard, locate the target server slot, edit RAM allocations inside settings panel, and reboot the container.', category: 'Technical' },
    { id: '2', title: 'Configuring server.properties safely', content: 'Open File Manager, find server.properties file in directories list, select edit, change port/gamemode parameters, and hit Save File.', category: 'General' },
    { id: '3', title: 'Refund Policy & Billing questions', content: 'Subscriptions are governed monthly. You can void active subscriptions inside billing history or cancel renewal cycles.', category: 'Billing' }
  ];

  const filteredArticles = defaultArticles.filter(art =>
    art.title.toLowerCase().includes(kbQuery.toLowerCase()) ||
    art.content.toLowerCase().includes(kbQuery.toLowerCase())
  );

  if (loading) {
    return <div className="skeleton" style={{ height: '400px' }}></div>;
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Support Hub</h1>
          <p className="page-subtitle">Submit help tickets, view staff replies, and browse guides.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className={`btn ${activeTab === 'tickets' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('tickets')}>
            Tickets
          </button>
          <button className={`btn ${activeTab === 'kb' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('kb')}>
            Knowledge Base
          </button>
        </div>
      </div>

      {activeTab === 'kb' ? (
        <div>
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="console-input-wrapper" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', padding: '0.8rem 1rem' }}>
              <HelpCircle size={18} color="#929AAB" style={{ marginRight: '0.5rem' }} />
              <input
                type="text"
                className="console-input"
                style={{ color: '#393E46' }}
                placeholder="Search troubleshooting questions, configuration issues..."
                value={kbQuery}
                onChange={(e) => setKbQuery(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {filteredArticles.map((art) => (
              <div key={art.id} className="card" style={{ padding: '1.5rem' }}>
                <span className="plugin-source" style={{ marginBottom: '0.5rem' }}>{art.category}</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>{art.title}</h3>
                <p style={{ color: '#686D76', fontSize: '0.9rem', lineHeight: 1.6 }}>{art.content}</p>
              </div>
            ))}
          </div>
        </div>
      ) : selectedTicketId ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          <div className="card" style={{ height: '500px', overflowY: 'auto' }}>
            <button className="btn btn-secondary" style={{ width: '100%', marginBottom: '1.5rem' }} onClick={() => setSelectedTicketId(null)}>
              &larr; Back to Tickets List
            </button>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Open Cases</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: selectedTicketId === t.id ? 'var(--bg-secondary)' : 'transparent',
                    border: '1px solid rgba(0,0,0,0.04)'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.title}</div>
                  <span className={`badge ${t.status === 'Open' ? 'badge-info' : t.status === 'StaffReply' ? 'badge-success' : 'badge-warning'}`} style={{ marginTop: '0.25rem' }}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '500px' }}>
            <div style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selectedTicket?.title}</h3>
              <p style={{ fontSize: '0.8rem', color: '#929AAB', marginTop: '0.25rem' }}>
                Category: {selectedTicket?.category} | Priority: {selectedTicket?.priority}
              </p>
            </div>

            <div className="console-logs" ref={chatEndRef} style={{ background: 'transparent', flex: 1, padding: 0 }}>
              {messages.map((msg) => (
                <div key={msg.id} style={{
                  alignSelf: msg.isStaffReply ? 'flex-start' : 'flex-end',
                  maxWidth: '75%',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '18px',
                  background: msg.isStaffReply ? 'var(--bg-secondary)' : 'var(--text-primary)',
                  color: msg.isStaffReply ? 'var(--text-primary)' : 'white',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8, marginBottom: '0.2rem' }}>
                    {msg.isStaffReply ? 'Staff Support' : msg.user.email}
                  </div>
                  <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{msg.message}</div>
                  <div style={{ fontSize: '0.65rem', textAlign: 'right', marginTop: '0.25rem', opacity: 0.6 }}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <input
                type="text"
                className="form-control"
                style={{ flex: 1 }}
                placeholder="Type your reply here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={sendingReply}>
                <Send size={16} /> Send
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={20} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Active Support Tickets</h3>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Submit Ticket
            </button>
          </div>

          {tickets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#929AAB' }}>
              <LifeBuoy size={40} style={{ marginBottom: '0.5rem' }} />
              <p>No open help tickets found. Need assistance? Click Submit Ticket.</p>
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Topic Title</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Date Opened</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} onClick={() => setSelectedTicketId(t.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{t.title}</td>
                    <td>{t.category}</td>
                    <td>
                      <span className={`badge ${t.priority === 'High' ? 'badge-danger' : t.priority === 'Medium' ? 'badge-warning' : 'badge-info'}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${t.status === 'Open' ? 'badge-info' : t.status === 'StaffReply' ? 'badge-success' : 'badge-warning'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
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
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '2.5rem' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '1.5rem' }}>Submit Support Case</h3>
            <form onSubmit={handleCreateTicket}>
              <div className="form-group">
                <label className="form-label">Subject / Title</label>
                <input type="text" className="form-control" placeholder="Server failing to bootstrap" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="Technical">Technical Support</option>
                    <option value="Billing">Billing Issue</option>
                    <option value="General">General Inquiry</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-control" value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Describe your issue</label>
                <textarea
                  className="form-control"
                  style={{ height: '120px', resize: 'vertical' }}
                  placeholder="Provide logs or explain details here..."
                  value={initialMsg}
                  onChange={(e) => setInitialMsg(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tickets;
