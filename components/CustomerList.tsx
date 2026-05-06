'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import { Customer } from '@/lib/types';

interface CustomerListProps {
  baseHref: '/staff/customers' | '/admin/customers';
  role: 'staff' | 'admin';
}

export default function CustomerList({ baseHref, role }: CustomerListProps) {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'banned' | 'warned'>('all');
  const [loading, setLoading] = useState(true);

  const isAdmin = role === 'admin';

  const fetchCustomers = async () => {
    // Only select the columns the list view actually shows
    let query = supabase
      .from('customers')
      .select('id, name, ic, phone, nationality, status, warning_count, membership')
      .order('created_at', { ascending: false });
    if (filter === 'active') query = query.eq('status', 'active');
    if (filter === 'banned') query = query.eq('status', 'banned');
    if (filter === 'warned') query = query.gt('warning_count', 0);
    const { data } = await query.limit(500);
    if (data) setCustomers(data as Customer[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      c.ic.toLowerCase().includes(s) ||
      c.phone.toLowerCase().includes(s)
    );
  });

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'active', label: 'ACTIVE' },
    { key: 'warned', label: 'WARNED' },
    { key: 'banned', label: 'BANNED' },
  ];

  return (
    <div className="dashboard-light min-h-screen">
      <div className="bg-white border-b border-neutral-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">// DATABASE</p>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">CUSTOMERS</h1>
          </div>
          {isAdmin && (
            <Link
              href="/admin/customers/new"
              className="font-display text-sm tracking-wider px-4 py-2.5 bg-accent text-ink hover:translate-y-0.5 transition-transform"
            >
              + NEW CUSTOMER
            </Link>
          )}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH BY NAME, IC, OR PHONE..."
          className="input-field font-mono text-sm mb-3"
        />

        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`font-display text-[10px] tracking-widest px-3 py-1.5 border ${
                filter === f.key ? 'bg-ink text-bone border-ink' : 'bg-white text-ink border-neutral-300 hover:border-accent'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden md:grid bg-ink text-accent px-6 py-2 font-mono text-[10px] tracking-[0.15em] sticky top-0 z-10"
        style={{ gridTemplateColumns: '1fr 200px 180px 120px' }}>
        <div>NAME</div>
        <div>IC / PASSPORT</div>
        <div>PHONE</div>
        <div className="text-center">STATUS</div>
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-neutral-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-2xl text-neutral-700">NO CUSTOMERS FOUND</p>
        </div>
      ) : (
        <>
          {filtered.map((c) => (
            <Link key={c.id} href={`${baseHref}/${c.id}`}>
              <div
                className={`md:grid flex flex-col gap-1 items-center px-4 md:px-6 py-2.5 border-b border-neutral-200 cursor-pointer transition-colors ${
                  c.status === 'banned'
                    ? 'bg-red-50 hover:bg-red-100'
                    : c.warning_count > 0
                    ? 'bg-yellow-50 hover:bg-yellow-100'
                    : 'bg-white hover:bg-yellow-50'
                }`}
                style={{ gridTemplateColumns: '1fr 200px 180px 120px' }}
              >
                <div className="md:hidden w-full">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm truncate flex-1 flex items-center gap-1.5">
                      {c.membership === 'member' && (
                        <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐</span>
                      )}
                      <span className="truncate">{c.name.toUpperCase()}</span>
                    </span>
                    <StatusBadge customer={c} />
                  </div>
                  <div className="font-mono text-[11px] text-neutral-600 truncate">
                    {c.ic} · {c.phone}
                  </div>
                </div>

                <div className="hidden md:flex items-center gap-1.5 font-bold text-sm truncate">
                  {c.nationality === 'foreigner' && <span className="text-accent">🌍</span>}
                  {c.membership === 'member' && (
                    <span className="font-display text-[9px] tracking-widest px-1.5 py-0.5 bg-success-green text-white flex-shrink-0">⭐ MEMBER</span>
                  )}
                  <span className="truncate">{c.name.toUpperCase()}</span>
                </div>
                <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">{c.ic}</div>
                <div className="hidden md:block font-mono text-xs text-neutral-600 truncate">{c.phone}</div>
                <div className="hidden md:block text-center">
                  <StatusBadge customer={c} />
                </div>
              </div>
            </Link>
          ))}
          <div className="text-center font-mono text-xs text-neutral-500 py-4">
            {filtered.length} of {customers.length} shown
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ customer }: { customer: Customer }) {
  if (customer.status === 'banned') {
    return (
      <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-danger text-white">
        ✕ BANNED
      </span>
    );
  }
  if (customer.warning_count > 0) {
    return (
      <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-accent text-ink">
        ⚠ {customer.warning_count}/3
      </span>
    );
  }
  return (
    <span className="font-display text-[10px] tracking-widest px-2 py-1 bg-success text-white">
      ✓ OK
    </span>
  );
}
