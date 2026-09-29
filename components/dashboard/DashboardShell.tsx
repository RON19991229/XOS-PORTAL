'use client';

/**
 * v2.22.0 — "A · Control Room (light)" shell for every /admin and /staff page.
 * Replaces the old black top nav (DashboardNav):
 *
 *   - left icon rail (desktop) / scrollable tab row (mobile)
 *   - white top bar: page title + live clock, Ctrl+K customer search,
 *     SOUND, PRIVACY (on by default — lib/privacy.tsx), user, EXIT
 *   - the complaint badge count is shared with pages via useDashboard()
 *
 * Lives in the layouts, so it stays mounted across client navigation.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { formatTime } from '@/lib/utils';
import { PrivacyProvider, usePrivacy } from '@/lib/privacy';
import SoundToggle from '../SoundToggle';
import CommandPalette from './CommandPalette';

type Role = 'staff' | 'admin';

interface DashboardCtx {
  role: Role;
  base: '/admin' | '/staff';
  newComplaints: number;
  openSearch: () => void;
}

const Ctx = createContext<DashboardCtx>({ role: 'staff', base: '/staff', newComplaints: 0, openSearch: () => {} });

export function useDashboard(): DashboardCtx {
  return useContext(Ctx);
}

// Stroke icons (24×24 viewBox), drawn with currentColor.
const ICONS = {
  today: 'M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  customers: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  attention: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  complaint: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  reports: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  import: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  audit: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9',
  exit: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
} as const;

export function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

interface NavLink {
  href: string;
  label: string;
  short: string;
  icon: keyof typeof ICONS;
}

function navLinks(base: '/admin' | '/staff', role: Role): NavLink[] {
  const links: NavLink[] = [
    { href: base, label: 'TODAY', short: 'TODAY', icon: 'today' },
    { href: `${base}/history`, label: 'HISTORY', short: 'HISTORY', icon: 'history' },
    { href: `${base}/customers`, label: 'CUSTOMERS', short: 'CUSTMR', icon: 'customers' },
    { href: `${base}/attention`, label: 'ATTENTION', short: 'ATTN', icon: 'attention' },
    { href: `${base}/complaint`, label: 'COMPLAINT', short: 'CMPLNT', icon: 'complaint' },
  ];
  if (role === 'admin') {
    links.push(
      { href: '/admin/reports', label: 'REPORTS', short: 'REPORT', icon: 'reports' },
      { href: '/admin/import', label: 'IMPORT', short: 'IMPORT', icon: 'import' },
      { href: '/admin/audit', label: 'AUDIT', short: 'AUDIT', icon: 'audit' },
    );
  }
  return links;
}

function pageTitle(pathname: string, base: string): { kicker: string; title: string } {
  const rest = pathname.slice(base.length);
  if (rest === '' || rest === '/') return { kicker: 'LIVE FEED', title: 'TODAY' };
  if (rest.startsWith('/history')) return { kicker: 'VISIT LOG', title: 'HISTORY' };
  if (rest === '/customers/new') return { kicker: 'DATABASE', title: 'NEW CUSTOMER' };
  if (rest.startsWith('/customers/')) return { kicker: 'DATABASE', title: 'CUSTOMER' };
  if (rest.startsWith('/customers')) return { kicker: 'DATABASE', title: 'CUSTOMERS' };
  if (rest.startsWith('/attention')) return { kicker: 'BANNED & WARNED', title: 'ATTENTION' };
  if (rest.startsWith('/complaint')) return { kicker: 'CONFIDENTIAL', title: 'COMPLAINTS' };
  if (rest.startsWith('/reports')) return { kicker: 'ANALYTICS', title: 'REPORTS' };
  if (rest.startsWith('/import')) return { kicker: 'ADMIN ONLY', title: 'IMPORT' };
  if (rest.startsWith('/audit')) return { kicker: 'AUDIT TRAIL', title: 'AUDIT LOG' };
  return { kicker: 'X FITNESS', title: '' };
}

export default function DashboardShell({
  role, userName, children,
}: {
  role: Role;
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <PrivacyProvider>
      <ShellInner role={role} userName={userName}>
        {children}
      </ShellInner>
    </PrivacyProvider>
  );
}

function ShellInner({ role, userName, children }: { role: Role; userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const base: '/admin' | '/staff' = pathname.startsWith('/admin') ? '/admin' : '/staff';
  const links = navLinks(base, role);
  const { privacy, togglePrivacy } = usePrivacy();
  const [searchOpen, setSearchOpen] = useState(false);

  // Count of unhandled complaints — drives the red badge on COMPLAINT (and
  // the NEEDS ATTENTION card on TODAY). Refreshes on mount, every 30s, on
  // page change and whenever the tab regains focus.
  const [newComplaints, setNewComplaints] = useState(0);
  useEffect(() => {
    let active = true;
    const fetchCount = () => {
      supabase
        .from('incident_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
        .then(({ count }) => {
          if (active && typeof count === 'number') setNewComplaints(count);
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
  }, [pathname, supabase]);

  // Ctrl+K / ⌘K opens customer search from any page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const isActive = (href: string) => (href === base ? pathname === href : pathname.startsWith(href));
  const { kicker, title } = pageTitle(pathname, base);

  const ctx: DashboardCtx = { role, base, newComplaints, openSearch: () => setSearchOpen(true) };

  return (
    <Ctx.Provider value={ctx}>
      <div className={`dash-shell min-h-screen bg-paper text-ink md:pl-[76px] ${privacy ? 'privacy-on' : ''}`}>
        {/* ---- Left rail (desktop) ---- */}
        <nav
          aria-label="Main"
          className="hidden md:flex fixed left-0 top-0 bottom-0 w-[76px] z-40 flex-col items-center gap-1 py-4 bg-white border-r border-line"
        >
          <Link href={base} className="block w-14 h-14 mb-3" aria-label="X FITNESS — TODAY">
            <Image src="/report-logo-tile.png" alt="X FITNESS" width={56} height={56} priority className="w-14 h-14" />
          </Link>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              title={l.label}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className={`relative w-[60px] h-14 flex flex-col items-center justify-center gap-1 font-mono text-[8.5px] tracking-[0.08em] transition-colors ${
                isActive(l.href) ? 'bg-accent text-ink font-bold' : 'text-muted hover:text-ink hover:bg-paper'
              }`}
            >
              <Icon d={ICONS[l.icon]} />
              {l.short}
              {l.icon === 'complaint' && newComplaints > 0 && (
                <span className="absolute top-1.5 right-2 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white font-body font-bold text-[10px] grid place-items-center leading-none">
                  {newComplaints}
                </span>
              )}
            </Link>
          ))}
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="w-[60px] h-12 flex flex-col items-center justify-center gap-1 font-mono text-[8.5px] tracking-[0.08em] text-muted hover:text-danger"
          >
            <Icon d={ICONS.exit} size={18} />
            EXIT
          </button>
        </nav>

        {/* ---- Top bar ---- */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-line flex items-center gap-2 md:gap-3 px-3 md:px-6">
          <Link href={base} className="md:hidden block w-11 h-11 flex-shrink-0" aria-label="X FITNESS — TODAY">
            <Image src="/report-logo-tile.png" alt="X FITNESS" width={44} height={44} priority className="w-11 h-11" />
          </Link>
          <div className="min-w-0">
            <p className="hidden sm:block font-mono text-[10px] tracking-[0.3em] text-muted leading-none mb-1">
              // {kicker} · {role.toUpperCase()}
            </p>
            <div className="flex items-baseline gap-3 min-w-0">
              <h1 className="font-display text-xl md:text-[26px] leading-none truncate">{title}</h1>
              <span className="hidden lg:flex items-center gap-2 font-mono text-xs text-muted whitespace-nowrap">
                <span className="inline-block w-2 h-2 rounded-full bg-success-green animate-pulse-slow" />
                <LiveClock />
              </span>
            </div>
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="h-10 flex items-center gap-2.5 px-3 bg-paper border border-line text-muted hover:border-ink hover:text-ink transition-colors lg:w-[300px]"
            aria-label="Find customer"
          >
            <Icon d={ICONS.search} size={17} />
            <span className="hidden lg:inline flex-1 text-left text-sm whitespace-nowrap overflow-hidden">Find customer…</span>
            <span className="hidden lg:inline font-mono text-[11px] border border-line-strong bg-white px-1.5 py-0.5">Ctrl K</span>
          </button>
          <SoundToggle />
          <button
            type="button"
            onClick={togglePrivacy}
            aria-pressed={privacy}
            title={privacy ? 'Privacy ON — click to show names and numbers' : 'Privacy OFF — click to hide names and numbers (turns back on after 2 min idle)'}
            className={`h-10 flex items-center gap-2 px-3 font-mono text-[10px] font-bold tracking-[0.12em] border whitespace-nowrap transition-colors ${
              privacy ? 'bg-ink border-ink text-accent' : 'bg-white border-line-strong text-muted hover:border-ink hover:text-ink'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {privacy ? (
                <path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />
              ) : (
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
              )}
            </svg>
            <span className="hidden sm:inline">{privacy ? 'PRIVACY ON' : 'PRIVACY OFF'}</span>
          </button>
          <span className="hidden xl:inline-block font-mono text-xs px-3 py-2 border border-line text-muted max-w-[160px] truncate" title={userName}>
            {userName}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="md:hidden font-display text-[11px] tracking-widest px-2 py-2 text-muted hover:text-danger"
          >
            EXIT
          </button>
        </header>

        {/* ---- Mobile tab row ---- */}
        <nav aria-label="Main" className="md:hidden flex bg-white border-b border-line overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`relative font-display text-[11px] tracking-widest px-4 py-2.5 whitespace-nowrap ${
                isActive(l.href) ? 'bg-accent text-ink' : 'text-muted'
              }`}
            >
              {l.label}
              {l.icon === 'complaint' && newComplaints > 0 && (
                <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-danger text-white font-body font-bold text-[9px] leading-none">
                  {newComplaints}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <main>{children}</main>

        <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} base={base} />
      </div>
    </Ctx.Provider>
  );
}

/** Isolated per-second clock so only this text node re-renders. */
function LiveClock() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const date = d
        .toLocaleDateString('en-MY', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kuala_Lumpur' })
        .toUpperCase();
      setNow(`${date} · ${formatTime(d)}`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  return <>{now}</>;
}
