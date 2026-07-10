'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-client';
import BrandMark from './BrandMark';

interface DashboardNavProps {
  role: 'staff' | 'admin';
  userName: string;
}

export default function DashboardNav({ role, userName }: DashboardNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  // Count of unhandled complaints — drives the red badge on COMPLAINT.
  // Refreshes automatically: on mount, every 30s, and whenever the tab/window
  // regains focus — so a new report shows up without a manual page refresh.
  const [newCount, setNewCount] = useState(0);
  useEffect(() => {
    let active = true;
    const fetchCount = () => {
      supabase
        .from('incident_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
        .then(({ count }) => {
          if (active && typeof count === 'number') setNewCount(count);
        });
    };

    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchCount();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fetchCount);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fetchCount);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const links = role === 'admin'
    ? [
        { href: '/admin/complaint', label: 'COMPLAINT' },
        { href: '/admin', label: 'TODAY' },
        { href: '/admin/history', label: 'HISTORY' },
        { href: '/admin/customers', label: 'CUSTOMERS' },
        { href: '/admin/attention', label: 'ATTENTION' },
        { href: '/admin/reports', label: 'REPORTS' },
        { href: '/admin/import', label: 'IMPORT' },
        { href: '/admin/audit', label: 'AUDIT' },
      ]
    : [
        { href: '/staff/complaint', label: 'COMPLAINT' },
        { href: '/staff', label: 'TODAY' },
        { href: '/staff/history', label: 'HISTORY' },
        { href: '/staff/customers', label: 'CUSTOMERS' },
        { href: '/staff/attention', label: 'ATTENTION' },
      ];

  const isActive = (href: string) => {
    if (href === '/admin' || href === '/staff') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="bg-ink text-bone border-b-2 border-accent sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        <div className="flex items-center gap-4">
          <BrandMark size="sm" />
          <span className="font-display text-[10px] tracking-widest bg-accent text-ink px-2 py-1 hidden sm:inline-block">
            {role.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative hidden md:inline-block font-display text-xs tracking-widest px-3 py-2 transition-colors ${
                isActive(link.href)
                  ? 'bg-accent text-ink'
                  : 'text-neutral-300 hover:text-accent'
              }`}
            >
              {link.label}
              {link.label === 'COMPLAINT' && newCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-danger text-white font-display text-[9px] leading-none ring-2 ring-ink">
                  {newCount}
                </span>
              )}
            </Link>
          ))}

          <span className="hidden lg:inline-block font-mono text-xs ml-3 px-3 py-1 border border-ink-line">
            {userName}
          </span>

          <button
            onClick={handleLogout}
            className="font-display text-xs tracking-widest px-3 py-2 text-neutral-400 hover:text-danger transition-colors"
          >
            EXIT
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden flex border-t border-ink-line overflow-x-auto">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`relative font-display text-xs tracking-widest px-4 py-2.5 whitespace-nowrap ${
              isActive(link.href) ? 'bg-accent text-ink' : 'text-neutral-400'
            }`}
          >
            {link.label}
            {link.label === 'COMPLAINT' && newCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-danger text-white font-display text-[8px] leading-none">
                {newCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </header>
  );
}
