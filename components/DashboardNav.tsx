'use client';

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const links = role === 'admin'
    ? [
        { href: '/admin', label: 'TODAY' },
        { href: '/admin/history', label: 'HISTORY' },
        { href: '/admin/customers', label: 'CUSTOMERS' },
        { href: '/admin/reports', label: 'REPORTS' },
        { href: '/admin/import', label: 'IMPORT' },
        { href: '/admin/audit', label: 'AUDIT' },
      ]
    : [
        { href: '/staff', label: 'TODAY' },
        { href: '/staff/history', label: 'HISTORY' },
        { href: '/staff/customers', label: 'CUSTOMERS' },
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
              className={`hidden md:inline-block font-display text-xs tracking-widest px-3 py-2 transition-colors ${
                isActive(link.href)
                  ? 'bg-accent text-ink'
                  : 'text-neutral-300 hover:text-accent'
              }`}
            >
              {link.label}
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
            className={`font-display text-xs tracking-widest px-4 py-2.5 whitespace-nowrap ${
              isActive(link.href) ? 'bg-accent text-ink' : 'text-neutral-400'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
