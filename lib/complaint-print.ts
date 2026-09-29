// ============================================================================
// complaint-print.ts — v2.18.0
// Builds a standalone, formal A4 "Incident Report" HTML document for a single
// complaint, suitable for printing / saving as PDF and handing to authorities
// (e.g. attached to a police report lodged by the reporting party).
//
// Design decisions (approved mockup, Jul 2026):
//   - Pure black & white, bilingual EN/BM labels, CONFIDENTIAL/SULIT banner.
//   - Section 4 is explicitly titled "AS ALLEGED BY REPORTING PARTY" and the
//     declaration block states contents are unverified — defamation guard.
//   - Statement (description) is reproduced verbatim and marked as such.
//   - Internal case log is OFF by default and carries an internal-use warning
//     when included (staff notes may contain speculation).
//   - Reporter identity can be redacted for third-party distribution.
//   - This is an INTERNAL incident record, NOT a police report — stated in
//     the declaration (a police report must be lodged by the complainant).
//
// The document is opened in a new window (window.open + document.write) so
// none of the dashboard CSS leaks in. All user-provided content is escaped.
// ============================================================================

import { IncidentReport, IncidentNote } from '@/lib/types';
import { StoredAnswer, QID } from '@/lib/report-config';
import { formatDateTime } from '@/lib/utils';

// ---- Company letterhead constants (edit here) ------------------------------
const COMPANY_NAME = 'X FITNESS CENTRE';
const COMPANY_SSM = 'SSM Reg. No.: 202503023755 (IP0604759-X)';
const COMPANY_ADDRESS_1 = 'NO 33A & 33B, JALAN BESTARI 12/2, TAMAN NUSA BESTARI,';
const COMPANY_ADDRESS_2 = '79150 ISKANDAR PUTERI, JOHOR';
const COMPANY_TEL = '+60 11-7260 3994';
const COMPANY_EMAIL = 'xfitness.my@gmail.com';

export interface PrintOptions {
  includePhoto: boolean;
  includeCaseLog: boolean;
  redactReporter: boolean;
}

// ---- helpers ---------------------------------------------------------------

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asAnswers(a: unknown): StoredAnswer[] {
  return Array.isArray(a) ? (a as StoredAnswer[]) : [];
}

const LANG_NAME: Record<string, string> = {
  en: 'English',
  zh: 'Chinese (中文)',
  ms: 'Bahasa Malaysia',
};

const REDACTED = '[REDACTED / DISUNTING]';

// One labelled cell in a fields table.
function cell(labEn: string, labBm: string, value: string, width?: string): string {
  return `<td${width ? ` style="width:${width}"` : ''}><span class="lab">${esc(labEn)} / ${esc(labBm)}</span><span class="val">${value}</span></td>`;
}

// Chunk cells into table rows of `per` columns, padding the last row.
function rows(cells: string[], per: number): string {
  const out: string[] = [];
  for (let i = 0; i < cells.length; i += per) {
    const chunk = cells.slice(i, i + per);
    while (chunk.length < per) chunk.push('<td></td>');
    out.push(`<tr>${chunk.join('')}</tr>`);
  }
  return out.join('');
}

// ---- main builder ----------------------------------------------------------

export function buildComplaintPrintHtml(
  report: IncidentReport,
  notes: IncidentNote[],
  photoUrl: string | null,
  opts: PrintOptions,
  generatedByName: string,
): string {
  const answers = asAnswers(report.answers);
  const byQid = new Map(answers.map((a) => [a.qid, a]));
  const get = (qid: string) => byQid.get(qid);
  const val = (a?: StoredAnswer): string => {
    if (!a) return '';
    const v = Array.isArray(a.value) ? a.value.join('; ') : a.value;
    return a.other ? `${v} — ${a.other}` : v;
  };

  const now = new Date();
  const generatedAt = `${formatDateTime(now)} (MYT)`;
  const submittedAt = `${formatDateTime(report.created_at)} (MYT)`;
  const ref = report.ref_code || report.id.slice(0, 8).toUpperCase();

  // ---- 1. Reporting party --------------------------------------------------
  const isAnon = report.is_anonymous || (!report.reporter_name && !report.reporter_contact);
  let reporterCells: string;
  if (isAnon) {
    reporterCells = `<td colspan="3"><span class="lab">Identity / Identiti</span><span class="val">Anonymous submission — identity not collected by the system / Penyerahan tanpa nama — identiti tidak dikumpul oleh sistem</span></td>`;
  } else {
    const name = opts.redactReporter ? REDACTED : esc(report.reporter_name || '—');
    const contact = opts.redactReporter ? REDACTED : esc(report.reporter_contact || '—');
    reporterCells = [
      cell('Name', 'Nama', name, '33.33%'),
      cell('Contact', 'Hubungan', contact, '33.33%'),
      cell('Submission method', 'Kaedah', 'Online report form (self-submitted)', '33.33%'),
    ].join('');
  }
  const langName = report.lang ? LANG_NAME[report.lang] ?? report.lang : null;

  // ---- 2. Incident details -------------------------------------------------
  const dateAns = get('incident_date');
  let incidentDate = '';
  if (dateAns && typeof dateAns.value === 'string' && dateAns.value) {
    const d = new Date(`${dateAns.value}T00:00:00`);
    incidentDate = isNaN(d.getTime())
      ? dateAns.value
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const incidentTime = val(get('incident_time'));
  const urgency = val(get(QID.urgency));

  const locAns = get(QID.location);
  const locParts: string[] = [];
  if (locAns) {
    if (Array.isArray(locAns.value)) locParts.push(...locAns.value);
    else if (locAns.value) locParts.push(locAns.value);
    if (locAns.other) locParts.push(locAns.other);
  }

  const incidentCells = [
    cell('Date of incident', 'Tarikh', esc(incidentDate || '—'), '25%'),
    cell('Time (approx.)', 'Masa', esc(incidentTime ? `~${incidentTime}` : '—'), '25%'),
    cell('Status at submission', 'Status semasa laporan', esc(urgency || '—'), '25%'),
    cell('Location', 'Lokasi', esc(locParts.join('; ') || '—'), '25%'),
  ];

  // ---- 4. Person description -----------------------------------------------
  const hair = [val(get('person_hair_color')), val(get('person_hair_length'))].filter(Boolean).join(' · ');
  const personPairs: [string, string, string][] = [
    ['Described as', 'Peranan', val(get('person_role'))],
    ['Gender', 'Jantina', val(get('person_gender'))],
    ['Approx. height', 'Anggaran tinggi', val(get('person_height'))],
    ['Race / ethnicity', 'Bangsa', val(get('person_race'))],
    ['Shirt colour', 'Warna baju', val(get('person_shirt'))],
    ['Hair', 'Rambut', hair],
    ['Tattoo', 'Tatu', val(get('person_tattoo'))],
    ['Glasses', 'Cermin mata', val(get('person_glasses'))],
    ['Build', 'Susuk badan', val(get('person_build'))],
    ['Usually seen at gym', 'Kebiasaan hadir', val(get('person_usual_time'))],
  ];
  const personCells = personPairs
    .filter(([, , v]) => v)
    .map(([en, bm, v]) => cell(en, bm, esc(v), '25%'));
  const personDetails = val(get('person_details'));

  // ---- 5. Additional information --------------------------------------------
  const fuPairs: [string, string, string][] = [
    ['Witnesses', 'Saksi', val(get('witnesses'))],
    ['Happened before', 'Pernah berlaku', val(get('happened_before'))],
    ['Requests gym to speak to person', 'Mohon pihak gim menegur individu', val(get('speak_to_person'))],
    ['Anonymous submission', 'Penyerahan tanpa nama', report.is_anonymous ? 'Yes' : 'No'],
  ];
  const anythingElse = val(get('anything_else'));

  // Any qids the fixed slots above don't consume (future config questions)
  // also print here so nothing is silently dropped.
  const consumed = new Set([
    QID.whatHappened, QID.urgency, QID.location,
    'incident_date', 'incident_time',
    'person_role', 'person_gender', 'person_height', 'person_race', 'person_shirt',
    'person_hair_color', 'person_hair_length', 'person_tattoo', 'person_glasses',
    'person_build', 'person_usual_time', 'person_details',
    'witnesses', 'happened_before', 'speak_to_person', QID.remainAnonymous, 'anything_else',
  ]);
  const extras = answers.filter((a) => !consumed.has(a.qid) && val(a));

  const fuCells = fuPairs
    .filter(([, , v]) => v)
    .map(([en, bm, v]) => cell(en, bm, esc(v), '25%'));
  extras.forEach((a) => {
    const lab = typeof a.label === 'string' ? a.label : (a.label as { en?: string })?.en ?? a.qid;
    fuCells.push(cell(lab, '', esc(val(a)), '25%'));
  });

  // ---- 6. Supporting material ------------------------------------------------
  let evidenceHtml: string;
  if (report.photo_path && opts.includePhoto && photoUrl) {
    evidenceHtml = `
      <div class="evi">
        <div class="ph-wrap">
          <img class="ph" src="${esc(photoUrl)}" alt="Evidence photograph"
               onerror="this.outerHTML='&lt;div class=&quot;ph ph-missing&quot;&gt;[ IMAGE FORMAT NOT PRINTABLE — DIGITAL FILE ON RECORD ]&lt;/div&gt;'">
        </div>
        <div class="ph-meta">
          <table class="fields">
            <tr><td><span class="lab">Type / Jenis</span><span class="val">Digital photograph, uploaded by reporting party</span></td></tr>
            <tr><td><span class="lab">Uploaded at / Masa muat naik</span><span class="val">${esc(submittedAt)} — together with report submission</span></td></tr>
            <tr><td><span class="lab">System file reference / Rujukan fail</span><span class="val mono-sm">${esc(report.photo_path)}</span></td></tr>
            <tr><td><span class="lab">Note / Nota</span><span class="val plain">Original digital file retained in system storage and available on request. / Fail digital asal disimpan dalam sistem dan boleh diberikan atas permintaan.</span></td></tr>
          </table>
        </div>
      </div>`;
  } else if (report.photo_path) {
    evidenceHtml = `
      <table class="fields">
        <tr><td><span class="lab">Photograph / Gambar</span><span class="val">Digital photograph on file — not printed in this copy. Available on request. / Gambar digital dalam simpanan — tidak dicetak dalam salinan ini. Boleh diberikan atas permintaan.</span></td></tr>
        <tr><td><span class="lab">System file reference / Rujukan fail</span><span class="val mono-sm">${esc(report.photo_path)}</span></td></tr>
      </table>`;
  } else {
    evidenceHtml = `
      <table class="fields">
        <tr><td><span class="lab">Photograph / Gambar</span><span class="val">None submitted / Tiada</span></td></tr>
      </table>`;
  }

  // ---- 7. Internal case log (optional) ----------------------------------------
  let caseLogHtml = '';
  if (opts.includeCaseLog && notes.length > 0) {
    const rowsHtml = notes
      .map(
        (n) => `
        <tr>
          <td style="width:32%"><span class="lab">By / Oleh</span><span class="val">${esc(n.added_by_name ?? 'Staff')}</span>
              <span class="lab" style="margin-top:4px">At / Pada</span><span class="val plain">${esc(formatDateTime(n.created_at))}</span></td>
          <td><span class="lab">Note / Nota</span><span class="val plain" style="white-space:pre-wrap">${esc(n.note)}</span></td>
        </tr>`,
      )
      .join('');
    caseLogHtml = `
      <div class="sec">
        <div class="sec-h"><span><span class="no">7.</span>INTERNAL CASE LOG <span class="bm">/ LOG KES DALAMAN</span></span></div>
        <div class="warn">Internal staff record. Entries reflect staff observations and follow-up actions; they are not statements of the reporting party. / Rekod dalaman kakitangan; bukan kenyataan pelapor.</div>
        <table class="fields">${rowsHtml}</table>
      </div>`;
  }

  // ---- assemble --------------------------------------------------------------
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Incident Report ${esc(ref)} — ${esc(COMPANY_NAME)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--ink:#111;--line:#bbb;--muted:#555;--faint:#777}
  html,body{background:#fff}
  body{font-family:"Helvetica Neue",Arial,"Noto Sans",sans-serif;color:var(--ink);
       -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .noprint{position:sticky;top:0;background:#0a0a0a;color:#f5f5f5;padding:11px 18px;
           display:flex;align-items:center;gap:14px;font-size:12.5px}
  .noprint button{background:#FFD60A;color:#0a0a0a;border:0;font-weight:800;font-size:12px;
                  letter-spacing:1px;padding:8px 20px;cursor:pointer;border-radius:3px}
  .noprint span{color:#8a8a8a;font-size:11px}
  .sheet{width:210mm;margin:0 auto;padding:14mm 16mm 12mm;background:#fff}
  .conf{text-align:center;font-family:"Courier New",monospace;font-weight:bold;font-size:10px;
        letter-spacing:4px;border:1.5px solid #111;padding:4px 0;margin-bottom:7mm}
  .lh{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #111;
      padding-bottom:5mm;margin-bottom:5mm}
  .lh img.mark{height:17mm;width:auto;display:block;margin-bottom:3mm}
  .lh .brand{font-weight:900;font-size:19px;letter-spacing:1.5px}
  .lh .brand small{display:block;font-weight:400;font-size:9px;letter-spacing:.3px;color:var(--muted);
                   margin-top:3px;line-height:1.55}
  .lh .doc{text-align:right}
  .lh .doc .t1{font-weight:800;font-size:15px;letter-spacing:1px}
  .lh .doc .t2{font-size:9.5px;color:var(--muted);letter-spacing:.5px;margin-top:2px}
  .lh .doc .ref{margin-top:6px;font-family:"Courier New",monospace;font-weight:bold;font-size:13px;
                border:1.5px solid #111;padding:3px 10px;display:inline-block}
  .meta{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #111;margin-bottom:6mm}
  .meta .mcell{padding:7px 10px;border-right:1px solid #111}
  .meta .mcell:last-child{border-right:0}
  .lab{font-family:"Courier New",monospace;font-size:8px;letter-spacing:1.2px;color:var(--faint);
       text-transform:uppercase;display:block;margin-bottom:3px}
  .val{font-size:11.5px;font-weight:600;display:block}
  .val.plain{font-weight:400;font-size:10.5px;line-height:1.6}
  .mono-sm{font-family:"Courier New",monospace;font-size:10px;font-weight:600;word-break:break-all}
  .sec{margin-bottom:6mm;break-inside:avoid}
  .sec-h{font-size:11px;font-weight:800;letter-spacing:1.5px;border-bottom:1.5px solid #111;
         padding-bottom:3px;margin-bottom:3.5mm}
  .sec-h .bm{font-weight:400;font-size:8.5px;color:var(--muted);letter-spacing:.5px}
  .sec-h .no{font-family:"Courier New",monospace;margin-right:8px}
  table.fields{width:100%;border-collapse:collapse}
  table.fields td{border:1px solid var(--line);padding:6px 9px;vertical-align:top}
  .statement{border:1px solid var(--line);padding:10px 12px;font-size:11.5px;line-height:1.75;
             min-height:22mm;white-space:pre-wrap}
  .vnote{font-size:8.5px;color:var(--muted);margin-top:3px;font-style:italic}
  .warn{font-size:8.5px;color:#222;border:1px dashed #888;padding:5px 9px;margin-bottom:3mm;line-height:1.6}
  .evi{display:flex;gap:6mm}
  .ph-wrap{width:52mm;flex-shrink:0}
  img.ph{max-width:52mm;max-height:62mm;border:1px solid #111;display:block}
  .ph-missing{width:52mm;height:30mm;border:1px solid #111;display:flex;align-items:center;
              justify-content:center;font-family:"Courier New",monospace;font-size:8.5px;color:#777;
              text-align:center;padding:4mm;line-height:1.8}
  .ph-meta{flex:1}
  .ph-meta table.fields td{padding:5px 9px}
  .decl{border:1.5px solid #111;padding:9px 12px;font-size:9.5px;line-height:1.7;color:#222;break-inside:avoid}
  .decl ol{margin:4px 0 0 16px}
  .decl li{margin-bottom:2px}
  .sig{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:9mm;break-inside:avoid}
  .sig .line{border-bottom:1px solid #111;height:15mm}
  .sig .cap{font-size:9px;margin-top:4px;line-height:1.7}
  .sig .cap b{font-size:10px}
  .foot{display:flex;justify-content:space-between;font-family:"Courier New",monospace;font-size:8px;
        color:#999;letter-spacing:1px;border-top:1px solid var(--line);padding-top:3mm;margin-top:8mm}
  @media print{
    .noprint{display:none}
    .sheet{width:auto;padding:0;margin:0}
    @page{size:A4;margin:14mm 16mm}
  }
</style>
</head>
<body>
<div class="noprint">
  <button onclick="window.print()">🖨 PRINT / SAVE PDF</button>
  <span>Print dialog opens automatically. Use "Save as PDF" as the destination to keep a digital copy.</span>
</div>
<div class="sheet">

  <div class="conf">CONFIDENTIAL&nbsp;&nbsp;·&nbsp;&nbsp;SULIT</div>

  <div class="lh">
    <div class="brand">
      <img class="mark" src="${esc(origin)}/print-logo.png" alt="" onerror="this.style.display='none'">
      ${esc(COMPANY_NAME)}
      <small>
        ${esc(COMPANY_ADDRESS_1)}<br>
        ${esc(COMPANY_ADDRESS_2)}<br>
        Tel: ${esc(COMPANY_TEL)} · ${esc(COMPANY_EMAIL)} · ${esc(COMPANY_SSM)}
      </small>
    </div>
    <div class="doc">
      <div class="t1">INCIDENT REPORT</div>
      <div class="t2">LAPORAN INSIDEN DALAMAN · 内部事件报告</div>
      <div class="ref">REF: ${esc(ref)}</div>
    </div>
  </div>

  <div class="meta">
    <div class="mcell"><span class="lab">Report submitted / Tarikh laporan diterima</span><span class="val">${esc(submittedAt)}</span></div>
    <div class="mcell"><span class="lab">Document generated / Dokumen dijana</span><span class="val">${esc(generatedAt)}</span></div>
    <div class="mcell"><span class="lab">Generated by / Dijana oleh</span><span class="val">${esc(generatedByName)}</span></div>
  </div>

  <div class="sec">
    <div class="sec-h"><span><span class="no">1.</span>REPORTING PARTY <span class="bm">/ PIHAK PELAPOR</span></span></div>
    <table class="fields"><tr>${reporterCells}</tr></table>
    ${langName ? `<div class="vnote">Report submitted in ${esc(langName)}. / Laporan dihantar dalam ${esc(langName)}.</div>` : ''}
  </div>

  <div class="sec">
    <div class="sec-h"><span><span class="no">2.</span>INCIDENT DETAILS <span class="bm">/ BUTIRAN INSIDEN</span></span></div>
    <table class="fields">${rows(incidentCells, 4)}</table>
  </div>

  <div class="sec">
    <div class="sec-h"><span><span class="no">3.</span>STATEMENT OF REPORTING PARTY <span class="bm">/ KENYATAAN PELAPOR</span></span></div>
    <div class="statement">${esc(report.description)}</div>
    <div class="vnote">Reproduced verbatim as submitted by the reporting party. Unedited. / Disalin sepenuhnya seperti yang dihantar oleh pelapor, tanpa suntingan.</div>
  </div>

  <div class="sec">
    <div class="sec-h"><span><span class="no">4.</span>DESCRIPTION OF PERSON, AS ALLEGED BY REPORTING PARTY <span class="bm">/ DESKRIPSI INDIVIDU (SEPERTI DIDAKWA PELAPOR)</span></span></div>
    ${personCells.length > 0 || personDetails
      ? `<table class="fields">
          ${rows(personCells, 4)}
          ${personDetails ? `<tr><td colspan="4"><span class="lab">Other identifying details / Butiran lain</span><span class="val">${esc(personDetails)}</span></td></tr>` : ''}
        </table>`
      : `<table class="fields"><tr><td><span class="val plain">No description provided. / Tiada deskripsi diberikan.</span></td></tr></table>`}
  </div>

  <div class="sec">
    <div class="sec-h"><span><span class="no">5.</span>ADDITIONAL INFORMATION <span class="bm">/ MAKLUMAT TAMBAHAN</span></span></div>
    <table class="fields">
      ${rows(fuCells, 4)}
      ${anythingElse ? `<tr><td colspan="4"><span class="lab">Anything else / Lain-lain</span><span class="val">${esc(anythingElse)}</span></td></tr>` : ''}
    </table>
  </div>

  <div class="sec">
    <div class="sec-h"><span><span class="no">6.</span>SUPPORTING MATERIAL <span class="bm">/ BAHAN SOKONGAN</span></span></div>
    ${evidenceHtml}
  </div>

  ${caseLogHtml}

  <div class="decl">
    <b>DECLARATION / PERAKUAN</b>
    <ol>
      <li>This document is an <b>internal incident record</b> generated from a report submitted through the ${esc(COMPANY_NAME)} online reporting system. It is <b>not a police report</b> and does not replace a report lodged with the Royal Malaysia Police (PDRM). / Dokumen ini adalah rekod insiden dalaman dan <b>bukan laporan polis</b>; ia tidak menggantikan laporan yang dibuat kepada Polis Diraja Malaysia (PDRM).</li>
      <li>Sections 2–6 reproduce information provided by the reporting party. ${esc(COMPANY_NAME)} has not independently verified the contents, and no finding of fact or wrongdoing is made against any person. / Kandungan diberikan oleh pelapor dan belum disahkan; tiada penemuan kesalahan dibuat terhadap mana-mana individu.</li>
      <li>This document contains personal data and is disclosed only for lawful purposes, including the prevention, detection or investigation of crime, in accordance with the Personal Data Protection Act 2010. / Dokumen ini mengandungi data peribadi dan hanya didedahkan untuk tujuan yang sah, termasuk pencegahan, pengesanan atau penyiasatan jenayah, menurut Akta Perlindungan Data Peribadi 2010.</li>
    </ol>
  </div>

  <div class="sig">
    <div>
      <div class="line"></div>
      <div class="cap"><b>Prepared by / Disediakan oleh</b><br>Name: ______________________&nbsp;&nbsp;Designation: ____________<br>Date: ______________</div>
    </div>
    <div>
      <div class="line"></div>
      <div class="cap"><b>Received by / Diterima oleh</b><br>Name: ______________________&nbsp;&nbsp;Agency/Dept: ____________<br>Date: ______________</div>
    </div>
  </div>

  <div class="foot">
    <span>${esc(COMPANY_NAME)} · INCIDENT REPORT · REF ${esc(ref)}</span>
    <span>GENERATED ${esc(generatedAt.toUpperCase())}</span>
  </div>
</div>
<script>
  // Auto-open the print dialog once everything (incl. the evidence photo)
  // has loaded. The toolbar PRINT button remains as a manual fallback.
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 400);
  });
</script>
</body>
</html>`;
}
