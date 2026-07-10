'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase-client';
import { COUNTRY_CODES, validateMyIC } from '@/lib/utils';

/**
 * Excel/CSV bulk import for customers.
 *
 * Flow:
 *   1. Admin downloads template (xlsx with header row + example).
 *   2. Admin uploads filled file.
 *   3. We parse it client-side, validate every row, show preview.
 *   4. Admin clicks "Import N new" — we do bulk insert.
 *   5. After import: error report CSV downloadable.
 *
 * Template columns (in order):
 *   name *               — full name (auto-uppercased)
 *   nationality *        — "malaysian" or "foreigner"
 *   ic_or_passport *     — 12-digit IC for malaysian, passport string for foreigner
 *   phone *              — full phone with country code, e.g. "+60123456789"
 *   dob                  — optional, YYYY-MM-DD; auto-parsed from IC if omitted
 *   emergency_relationship — optional (Friend / Father / Mother / Spouse / etc.)
 *   emergency_phone      — optional, full phone with country code
 *   membership           — optional, "member" or empty
 *   notes                — optional
 */

type RowStatus = 'new' | 'exists' | 'invalid';

interface ParsedRow {
  rowNum: number;          // 1-indexed (matches Excel row, header = row 1)
  status: RowStatus;
  errors: string[];
  data: {
    name: string;
    nationality: 'malaysian' | 'foreigner' | null;
    ic: string;
    phone: string;
    dob: string | null;
    emergency_relationship: string | null;
    emergency_phone: string | null;
    membership: 'member' | null;
    gender: 'male' | 'female' | null;
    notes: string | null;
  };
}

const TEMPLATE_HEADERS = [
  'name',
  'nationality',
  'ic_or_passport',
  'phone',
  'dob',
  'emergency_relationship',
  'emergency_phone',
  'membership',
  'gender',
  'notes',
];

const VALID_RELATIONSHIPS = ['Friend', 'Partner', 'Father', 'Mother', 'Relative', 'Guardian', 'Sibling', 'Spouse', 'Other'];

function normalizeRelationship(v: string): string | null {
  if (!v) return null;
  const cleaned = v.trim();
  const match = VALID_RELATIONSHIPS.find((r) => r.toLowerCase() === cleaned.toLowerCase());
  return match || cleaned; // store as-is if doesn't match — admin can clean later
}

function normalizePhone(raw: string): { ok: boolean; value: string; reason?: string } {
  if (!raw) return { ok: false, value: '', reason: 'phone empty' };
  let p = String(raw).trim().replace(/[\s\-()]/g, '');
  // If user wrote it without +, try to interpret
  if (!p.startsWith('+')) {
    if (p.startsWith('60') || p.startsWith('65')) {
      p = '+' + p;
    } else if (p.startsWith('0')) {
      // Local Malaysian number — assume +60
      p = '+60' + p.replace(/^0+/, '');
    } else {
      // Bare digits — assume Malaysia
      p = '+60' + p;
    }
  }
  // Validate it matches some country code
  const sortedCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
  const match = sortedCodes.find((c) => p.startsWith(c.code));
  if (!match) {
    return { ok: false, value: p, reason: 'unknown country code' };
  }
  const localPart = p.slice(match.code.length);
  if (localPart.length < 7 || localPart.length > 15) {
    return { ok: false, value: p, reason: `phone digits ${localPart.length} out of range (7-15)` };
  }
  if (!/^\d+$/.test(localPart)) {
    return { ok: false, value: p, reason: 'phone has non-digits' };
  }
  return { ok: true, value: p };
}

function parseDob(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Try ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try Excel serial number
  const num = Number(s);
  if (!isNaN(num) && num > 25569 && num < 70000) {
    // Excel epoch 1900-01-01, with leap-year bug for dates after 1900-02-28
    const ms = (num - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return d.toISOString().split('T')[0];
  }
  // Try "DD/MM/YYYY" or "MM/DD/YYYY" — assume DD/MM since we're in Malaysia
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return null; // unparseable
}

function dobFromIc(ic: string): string | null {
  if (!/^\d{12}$/.test(ic)) return null;
  const yy = parseInt(ic.slice(0, 2));
  const year = yy <= 29 ? 2000 + yy : 1900 + yy;
  const mm = ic.slice(2, 4);
  const dd = ic.slice(4, 6);
  const monthN = parseInt(mm);
  const dayN = parseInt(dd);
  if (monthN < 1 || monthN > 12 || dayN < 1 || dayN > 31) return null;
  return `${year}-${mm}-${dd}`;
}

interface ImportClientProps {
  userName: string;
}

export default function ImportClient({ userName }: ImportClientProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    failed: { row: ParsedRow; reason: string }[];
  } | null>(null);

  // ---------- Template download ----------
  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      [
        'JOHN TAN',
        'malaysian',
        '950101025566',
        '+60123456789',
        '',                          // dob — optional, auto-parsed from IC
        'Spouse',
        '+60198765432',
        '',                          // membership — blank for walk-in, "member" for member
        '',                          // gender — leave blank; auto-derived from IC for Malaysians
        'Existing Google Form customer',
      ],
      [
        'MARIA SANTOS',
        'foreigner',
        'PH1234567',
        '+639171234567',
        '1992-04-15',
        'Friend',
        '+60111222333',
        'member',
        'female',                    // gender required for foreigners (no IC to derive from)
        '',
      ],
    ]);

    // Set column widths for readability
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 20 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');
    XLSX.writeFile(wb, 'xfitness-import-template.xlsx');
  };

  // ---------- File upload + parse ----------
  const handleFile = async (file: File) => {
    setParsing(true);
    setRows([]);
    setImportResult(null);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

      // Normalize header keys to lowercase
      const normalized = json.map((row) => {
        const out: Record<string, string> = {};
        for (const k of Object.keys(row)) {
          out[k.toLowerCase().trim()] = String(row[k] ?? '').trim();
        }
        return out;
      });

      // Check existing IC list once
      const allIcs = normalized
        .map((r) => r['ic_or_passport'] || r['ic'] || r['passport'] || '')
        .filter(Boolean);

      let existingIcs = new Set<string>();
      if (allIcs.length > 0) {
        const { data } = await supabase
          .from('customers')
          .select('ic')
          .in('ic', allIcs);
        if (data) existingIcs = new Set(data.map((c) => c.ic));
      }

      const parsed: ParsedRow[] = normalized.map((r, i) => {
        const errors: string[] = [];
        const name = (r['name'] || '').trim().toUpperCase();
        const nationalityRaw = (r['nationality'] || '').toLowerCase();
        const ic = (r['ic_or_passport'] || r['ic'] || r['passport'] || '').trim();
        const phoneRaw = (r['phone'] || '').trim();
        const dobRaw = (r['dob'] || '').trim();
        const empRel = (r['emergency_relationship'] || '').trim();
        const empPhoneRaw = (r['emergency_phone'] || '').trim();
        const membershipRaw = (r['membership'] || '').toLowerCase().trim();
        const genderRaw = (r['gender'] || '').toLowerCase().trim();
        const notes = (r['notes'] || '').trim();

        let nationality: 'malaysian' | 'foreigner' | null = null;
        if (nationalityRaw === 'malaysian' || nationalityRaw === 'm') nationality = 'malaysian';
        else if (nationalityRaw === 'foreigner' || nationalityRaw === 'f') nationality = 'foreigner';

        if (!name) errors.push('name empty');
        if (!nationality) errors.push(`nationality must be "malaysian" or "foreigner" (got "${nationalityRaw}")`);
        if (!ic) errors.push('ic_or_passport empty');
        else if (nationality === 'malaysian') {
          const icErr = validateMyIC(ic);
          if (icErr) errors.push('IC: ' + icErr);
        } else if (nationality === 'foreigner') {
          if (ic.length < 4) errors.push('passport too short');
        }

        const phoneCheck = normalizePhone(phoneRaw);
        if (!phoneCheck.ok) errors.push(`phone: ${phoneCheck.reason}`);

        let empPhone: string | null = null;
        if (empPhoneRaw) {
          const epc = normalizePhone(empPhoneRaw);
          if (!epc.ok) errors.push(`emergency_phone: ${epc.reason}`);
          else empPhone = epc.value;
        }

        // DOB: try the column, fall back to IC parse
        let dob = parseDob(dobRaw);
        if (!dob && nationality === 'malaysian') dob = dobFromIc(ic);

        let membership: 'member' | null = null;
        if (membershipRaw === 'member') membership = 'member';
        else if (membershipRaw && membershipRaw !== 'walkin' && membershipRaw !== 'walk-in' && membershipRaw !== '') {
          errors.push(`membership must be "member" or empty (got "${membershipRaw}")`);
        }

        // Gender: explicit value (m/male/f/female) wins. Otherwise auto-derive
        // for Malaysians from IC last digit. Foreigners stay null if blank.
        let gender: 'male' | 'female' | null = null;
        if (genderRaw === 'male' || genderRaw === 'm') gender = 'male';
        else if (genderRaw === 'female' || genderRaw === 'f') gender = 'female';
        else if (genderRaw && genderRaw !== '') {
          errors.push(`gender must be "male"/"female" or empty (got "${genderRaw}")`);
        } else if (nationality === 'malaysian' && /^\d{12}$/.test(ic)) {
          // Auto-derive from IC last digit
          gender = parseInt(ic.charAt(11), 10) % 2 === 1 ? 'male' : 'female';
        }

        let status: RowStatus;
        if (errors.length > 0) status = 'invalid';
        else if (existingIcs.has(ic)) status = 'exists';
        else status = 'new';

        return {
          rowNum: i + 2, // +2: 1 for header, +1 for 1-indexed
          status,
          errors,
          data: {
            name,
            nationality,
            ic,
            phone: phoneCheck.value,
            dob,
            emergency_relationship: normalizeRelationship(empRel),
            emergency_phone: empPhone,
            membership,
            gender,
            notes: notes || null,
          },
        };
      });

      setRows(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert('Failed to parse file: ' + msg);
    } finally {
      setParsing(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = ''; // allow re-upload of same file
  };

  // ---------- Import (bulk insert) ----------
  const handleImport = async () => {
    const newRows = rows.filter((r) => r.status === 'new');
    if (newRows.length === 0) {
      alert('No new rows to import');
      return;
    }
    if (!confirm(`Import ${newRows.length} new customer(s)?`)) return;

    setImporting(true);

    // Insert one-by-one so we capture per-row failures (e.g. unique phone constraint)
    const inserted: ParsedRow[] = [];
    const failed: { row: ParsedRow; reason: string }[] = [];

    for (const r of newRows) {
      const { error } = await supabase.from('customers').insert({
        nationality: r.data.nationality,
        ic: r.data.ic,
        name: r.data.name,
        phone: r.data.phone,
        dob: r.data.dob,
        emergency_relationship: r.data.emergency_relationship,
        emergency_phone: r.data.emergency_phone,
        membership: r.data.membership,
        gender: r.data.gender,
        notes: r.data.notes,
        status: 'active',
      });
      if (error) {
        failed.push({ row: r, reason: error.message });
      } else {
        inserted.push(r);
      }
    }

    // Log audit
    await supabase.from('audit_log').insert({
      action: 'bulk_import_customers',
      user_name: userName,
      details: {
        total_rows: rows.length,
        inserted: inserted.length,
        skipped_existing: rows.filter((r) => r.status === 'exists').length,
        invalid: rows.filter((r) => r.status === 'invalid').length,
        failed_inserts: failed.length,
      },
    });

    setImportResult({ inserted: inserted.length, failed });
    setImporting(false);
  };

  // ---------- Error report CSV ----------
  const downloadErrorReport = () => {
    if (!rows.length && !importResult) return;
    const headers = ['Row', 'Status', 'Name', 'IC/Passport', 'Phone', 'Errors'];
    const allErrors: string[][] = [];

    for (const r of rows) {
      if (r.status === 'invalid') {
        allErrors.push([
          String(r.rowNum),
          'INVALID (skipped)',
          r.data.name || '',
          r.data.ic || '',
          r.data.phone || '',
          r.errors.join('; '),
        ]);
      } else if (r.status === 'exists') {
        allErrors.push([
          String(r.rowNum),
          'EXISTS (skipped)',
          r.data.name || '',
          r.data.ic || '',
          r.data.phone || '',
          'Customer with this IC/passport is already registered',
        ]);
      }
    }
    if (importResult?.failed) {
      for (const f of importResult.failed) {
        allErrors.push([
          String(f.row.rowNum),
          'FAILED (DB error)',
          f.row.data.name || '',
          f.row.data.ic || '',
          f.row.data.phone || '',
          f.reason,
        ]);
      }
    }

    if (allErrors.length === 0) {
      alert('No errors to report');
      return;
    }

    const lines = [headers, ...allErrors].map((r) =>
      r.map((c) => {
        const s = String(c);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
        return s;
      }).join(',')
    );
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xfitness-import-errors-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setRows([]);
    setImportResult(null);
  };

  const counts = {
    total: rows.length,
    newCount: rows.filter((r) => r.status === 'new').length,
    exists: rows.filter((r) => r.status === 'exists').length,
    invalid: rows.filter((r) => r.status === 'invalid').length,
  };

  return (
    <div className="dashboard-light min-h-screen px-4 md:px-6 py-6 max-w-5xl mx-auto">
      <p className="font-mono text-[10px] tracking-[0.3em] text-neutral-500 mb-1">// ADMIN ONLY</p>
      <h1 className="font-display text-3xl md:text-4xl tracking-tight mb-6">IMPORT CUSTOMERS</h1>

      {/* Step 1 — download template */}
      <div className="bg-white border border-neutral-200 p-5 mb-4">
        <p className="font-display text-base tracking-wider mb-2">STEP 1 — DOWNLOAD TEMPLATE</p>
        <p className="text-sm text-neutral-600 mb-3">
          Download the Excel template, fill in your existing customers&apos; data following the format,
          then upload below.
        </p>
        <button
          onClick={handleDownloadTemplate}
          className="font-display text-sm tracking-wider px-4 py-2.5 bg-ink text-bone"
        >
          ⬇ DOWNLOAD .XLSX TEMPLATE
        </button>

        <details className="mt-4 text-xs text-neutral-700">
          <summary className="cursor-pointer font-mono tracking-wider">SHOW FIELD GUIDE</summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] pl-4 list-disc">
            <li><strong>name</strong> * — Full name (auto-uppercased)</li>
            <li><strong>nationality</strong> * — &quot;malaysian&quot; or &quot;foreigner&quot;</li>
            <li><strong>ic_or_passport</strong> * — 12-digit IC for Malaysians, passport for foreigners</li>
            <li><strong>phone</strong> * — Full number with country code, e.g. <code>+60123456789</code></li>
            <li><strong>dob</strong> — Optional. <code>YYYY-MM-DD</code>. Auto-parsed from IC if blank</li>
            <li><strong>emergency_relationship</strong> — Friend / Partner / Father / Mother / Relative / Guardian / Sibling / Spouse / Other</li>
            <li><strong>emergency_phone</strong> — Full number with country code</li>
            <li><strong>membership</strong> — &quot;member&quot; or empty (default = walk-in)</li>
            <li><strong>gender</strong> — &quot;male&quot; / &quot;female&quot; / empty. Auto-derived from IC for Malaysians (last digit odd = male, even = female). Required for foreigners</li>
            <li><strong>notes</strong> — Optional free-form text</li>
          </ul>
        </details>
      </div>

      {/* Step 2 — upload */}
      <div className="bg-white border border-neutral-200 p-5 mb-4">
        <p className="font-display text-base tracking-wider mb-2">STEP 2 — UPLOAD</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileInput}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={parsing}
          className="font-display text-sm tracking-wider px-4 py-2.5 bg-accent text-ink disabled:opacity-50"
        >
          {parsing ? 'PARSING...' : '⬆ SELECT FILE (.xlsx / .csv)'}
        </button>
        {rows.length > 0 && (
          <button
            onClick={handleClear}
            className="font-display text-xs tracking-wider px-3 py-2 ml-2 bg-white border border-neutral-300"
          >
            CLEAR
          </button>
        )}
      </div>

      {/* Step 3 — preview */}
      {rows.length > 0 && (
        <div className="bg-white border border-neutral-200 p-5 mb-4">
          <div className="flex justify-between items-center flex-wrap gap-2 mb-3">
            <p className="font-display text-base tracking-wider">STEP 3 — PREVIEW & CONFIRM</p>
            <p className="font-mono text-xs text-neutral-600">
              {counts.total} rows · <span className="text-success">{counts.newCount} new</span>
              {counts.exists > 0 && <> · <span className="text-accent-dark">{counts.exists} already exist</span></>}
              {counts.invalid > 0 && <> · <span className="text-danger">{counts.invalid} invalid</span></>}
            </p>
          </div>

          <div className="overflow-x-auto border border-neutral-200">
            <table className="w-full text-xs font-mono">
              <thead className="bg-ink text-accent">
                <tr>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">NAME</th>
                  <th className="px-2 py-2 text-left">IC / PASSPORT</th>
                  <th className="px-2 py-2 text-left">PHONE</th>
                  <th className="px-2 py-2 text-left">TAG</th>
                  <th className="px-2 py-2 text-left">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => {
                  let bg = '';
                  let badge = <span className="text-success">✓ NEW</span>;
                  if (r.status === 'exists') {
                    bg = 'bg-yellow-50';
                    badge = <span className="text-accent-dark">⚠ EXISTS</span>;
                  } else if (r.status === 'invalid') {
                    bg = 'bg-red-50';
                    badge = <span className="text-danger">✕ INVALID</span>;
                  }
                  return (
                    <tr key={r.rowNum} className={`border-b border-neutral-100 ${bg}`}>
                      <td className="px-2 py-2 align-top">{r.rowNum}</td>
                      <td className="px-2 py-2 align-top break-words" style={{ maxWidth: 200 }}>
                        {r.data.name || <span className="text-neutral-400">(empty)</span>}
                      </td>
                      <td className="px-2 py-2 align-top break-all" style={{ maxWidth: 160 }}>
                        {r.data.ic || <span className="text-neutral-400">(empty)</span>}
                      </td>
                      <td className="px-2 py-2 align-top break-all" style={{ maxWidth: 140 }}>
                        {r.data.phone || <span className="text-neutral-400">(empty)</span>}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-col gap-1">
                          {r.data.membership === 'member' && (
                            <span className="bg-success-green text-white px-1.5 py-0.5 text-[10px] inline-block w-fit">⭐ MEMBER</span>
                          )}
                          {r.data.gender === 'male' && (
                            <span className="bg-sky-500 text-white px-1.5 py-0.5 text-[10px] inline-block w-fit">♂ MALE</span>
                          )}
                          {r.data.gender === 'female' && (
                            <span className="bg-pink-500 text-white px-1.5 py-0.5 text-[10px] inline-block w-fit">♀ FEMALE</span>
                          )}
                          {!r.data.membership && !r.data.gender && (
                            <span className="text-neutral-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div>{badge}</div>
                        {r.errors.length > 0 && (
                          <div className="text-[10px] text-danger mt-1">{r.errors.join('; ')}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 200 && (
              <div className="px-3 py-2 text-xs text-neutral-500 bg-neutral-50">
                ... showing first 200 rows of {rows.length}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4 flex-wrap">
            <button
              onClick={handleImport}
              disabled={importing || counts.newCount === 0}
              className="font-display text-sm tracking-wider px-4 py-2.5 bg-success text-white disabled:opacity-50"
            >
              {importing ? 'IMPORTING...' : `IMPORT ${counts.newCount} NEW`}
            </button>
            {(counts.exists > 0 || counts.invalid > 0) && (
              <button
                onClick={downloadErrorReport}
                className="font-display text-sm tracking-wider px-4 py-2.5 bg-white border border-neutral-300"
              >
                ⬇ DOWNLOAD ERROR REPORT
              </button>
            )}
          </div>
        </div>
      )}

      {/* Result */}
      {importResult && (
        <div className="bg-success text-white p-5 mb-4">
          <p className="font-display text-2xl tracking-tight mb-2">
            ✓ IMPORTED {importResult.inserted} CUSTOMER{importResult.inserted !== 1 ? 'S' : ''}
          </p>
          {importResult.failed.length > 0 && (
            <p className="font-mono text-xs">
              {importResult.failed.length} row(s) failed at insert.
              <button onClick={downloadErrorReport} className="underline ml-2">
                Download error report
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
