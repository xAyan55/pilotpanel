import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { CreditCard, Check, ShieldCheck, Ticket } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  ram: number;
  cpu: number;
  disk: number;
  price: number;
  billingCycle: string;
}

interface Invoice {
  id: string;
  amount: number;
  status: string;
  gateway: string;
  createdAt: string;
}

const Billing: React.FC = () => {
  const { token } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingData();
  }, [token]);

  const fetchBillingData = async () => {
    setLoading(true);
    try {
      const plansRes = await fetch('http://localhost:3000/api/billing/plans', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const invoicesRes = await fetch('http://localhost:3000/api/billing/invoices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (plansRes.ok && invoicesRes.ok) {
        setPlans(await plansRes.json());
        setInvoices(await invoicesRes.json());
      }
    } catch {}
    finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (plan: Plan) => {
    try {
      const invoiceRes = await fetch('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: plan.price, gateway: 'Stripe' })
      });

      if (invoiceRes.ok) {
        const invoice = await invoiceRes.json();
        // Automatically pay (mock transaction gateway flow)
        handlePayInvoice(invoice.id);
      }
    } catch {
      alert('Checkout failed.');
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    setPayingId(invoiceId);
    try {
      const res = await fetch(`http://localhost:3000/api/billing/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ paymentId: `ch_${Math.random().toString(36).substring(2, 12)}` })
      });
      if (res.ok) {
        fetchBillingData();
      }
    } catch {
      alert('Mock Payment failed.');
    } finally {
      setPayingId(null);
    }
  };

  if (loading) {
    return <div className="skeleton" style={{ height: '400px' }}></div>;
  }

  // Pre-seed some default plans if database is completely empty
  const defaultPlans = plans.length > 0 ? plans : [
    { id: '1', name: 'Starter SMP', ram: 2048, cpu: 1, disk: 10000, price: 5.00, billingCycle: 'Monthly' },
    { id: '2', name: 'Pro SMP Network', ram: 8192, cpu: 4, disk: 40000, price: 18.00, billingCycle: 'Monthly' },
    { id: '3', name: 'Enterprise Cluster', ram: 16384, cpu: 8, disk: 100000, price: 35.00, billingCycle: 'Monthly' }
  ];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Billing Portal</h1>
          <p className="page-subtitle">Upgrade hardware limits, purchase server slots, and track invoices.</p>
        </div>
      </div>

      <div className="plugin-grid" style={{ marginBottom: '3rem' }}>
        {defaultPlans.map((plan) => (
          <div key={plan.id} className="card" style={{ display: 'flex', flexDirection: 'column', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{plan.name}</h3>
            <div style={{ margin: '1.5rem 0 1rem' }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 700, color: '#393E46' }}>${plan.price.toFixed(2)}</span>
              <span style={{ color: '#929AAB' }}> / {plan.billingCycle.toLowerCase()}</span>
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', fontSize: '0.9rem', color: '#686D76' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Check size={16} color="#4E9F3D" /> {plan.ram / 1024} GB DDR4 ECC RAM
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Check size={16} color="#4E9F3D" /> {plan.cpu} AMD EPYC CPU Cores
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Check size={16} color="#4E9F3D" /> {plan.disk / 1024} GB NVMe SSD Storage
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Check size={16} color="#4E9F3D" /> Auto backups & instant deployment
              </li>
            </ul>

            <button className="btn btn-primary" onClick={() => handlePurchase(plan)} style={{ marginTop: 'auto', width: '100%' }}>
              Choose Plan
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <CreditCard size={20} color="#393E46" />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Invoice Transactions</h3>
        </div>

        <div className="table-container">
          {invoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#929AAB' }}>
              No previous invoices on record.
            </div>
          ) : (
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Amount</th>
                  <th>Gateway</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace' }}>#{inv.id.substring(0, 8)}</td>
                    <td style={{ fontWeight: 600 }}>${inv.amount.toFixed(2)}</td>
                    <td>{inv.gateway}</td>
                    <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${inv.status === 'paid' ? 'badge-success' : 'badge-danger'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {inv.status === 'unpaid' && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          onClick={() => handlePayInvoice(inv.id)}
                          disabled={payingId === inv.id}
                        >
                          {payingId === inv.id ? 'Processing...' : 'Pay Invoice'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Billing;
