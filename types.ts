'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { COUNTRY_CODES, digitsOnly } from '@/lib/utils';

interface PhoneInputProps {
  value: { code: string; digits: string };
  onChange: (v: { code: string; digits: string }) => void;
  placeholder?: string;
}

/**
 * Phone input with country selector for 173 countries.
 *
 * INTERNAL STATE: We track the selected country by ISO code (e.g. "MY") since
 *   dial codes can be shared (e.g. +1 for both US and CA).
 *
 * EXTERNAL CONTRACT: We still emit { code: '+60', digits: '...' } so the rest
 *   of the codebase doesn't need to change.
 *
 * On mount we infer the ISO from `value.code` (defaulting to MY).
 */
export default function PhoneInput({ value, onChange, placeholder }: PhoneInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Internal: ISO is the source of truth. Default to first country with matching code.
  const [selectedIso, setSelectedIso] = useState<string>(() => {
    const found = COUNTRY_CODES.find((c) => c.code === value.code);
    return found ? found.iso : 'MY';
  });

  // Sync ISO if external value.code changes to something we don't currently match
  useEffect(() => {
    const current = COUNTRY_CODES.find((c) => c.iso === selectedIso);
    if (!current || current.code !== value.code) {
      const found = COUNTRY_CODES.find((c) => c.code === value.code);
      if (found) setSelectedIso(found.iso);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.code]);

  const selected =
    COUNTRY_CODES.find((c) => c.iso === selectedIso) || COUNTRY_CODES[0];

  const handleDigitsChange = (raw: string) => {
    onChange({ ...value, digits: digitsOnly(raw).slice(0, 15) });
  };

  const handleCountrySelect = (iso: string, code: string) => {
    setSelectedIso(iso);
    onChange({ code, digits: value.digits });
    setShowDropdown(false);
    setSearch('');
  };

  // Filter countries by search term (matches country name, dial code, or ISO)
  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRY_CODES;
    const q = search.trim().toLowerCase();
    return COUNTRY_CODES.filter(
      (c) =>
        c.country.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        c.iso.toLowerCase().includes(q)
    );
  }, [search]);

  // Auto-focus search box when dropdown opens
  useEffect(() => {
    if (showDropdown && searchInputRef.current) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showDropdown]);

  return (
    <div className="flex gap-2 relative">
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex-shrink-0 bg-ink-soft border-2 border-ink-line text-bone px-3 py-3.5 font-mono text-sm flex items-center gap-2 hover:border-accent"
      >
        <span>{selected.flag}</span>
        <span>{selected.code}</span>
        <span className="text-neutral-500">▼</span>
      </button>

      <input
        type="tel"
        inputMode="numeric"
        value={value.digits}
        onChange={(e) => handleDigitsChange(e.target.value)}
        placeholder={placeholder || 'Phone number'}
        className="input-field flex-1 min-w-0"
        maxLength={15}
      />

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/50"
            onClick={() => {
              setShowDropdown(false);
              setSearch('');
            }}
          />
          <div className="absolute top-full mt-1 left-0 z-40 bg-ink-soft border-2 border-accent w-[min(20rem,calc(100vw-2.5rem))] max-h-[60vh] flex flex-col">
            {/* Search box (sticky top) */}
            <div className="p-2 border-b-2 border-ink-line bg-ink-soft sticky top-0">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="w-full bg-ink border border-ink-line text-bone px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent"
              />
            </div>

            {/* Scrollable list */}
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="p-4 text-neutral-500 font-mono text-xs text-center">
                  No countries match &quot;{search}&quot;
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => handleCountrySelect(c.iso, c.code)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-accent hover:text-ink transition-colors flex items-center gap-3 ${
                      c.iso === selectedIso ? 'bg-accent text-ink' : 'text-bone'
                    }`}
                  >
                    <span className="text-xl flex-shrink-0">{c.flag}</span>
                    <span className="font-mono text-sm flex-1 truncate">{c.country}</span>
                    <span className="font-mono text-xs opacity-70 flex-shrink-0">{c.code}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
