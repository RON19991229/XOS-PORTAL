/* X FITNESS · 9.01 Grand Lucky Draw
   Shared config. Safe to commit — the publishable key is designed to be public,
   and every table is protected by Row Level Security. */
window.XF = {
  SUPABASE_URL:  'https://bkfbylntzmrjqgbrxgic.supabase.co',
  SUPABASE_KEY:  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZmJ5bG50em1yanFnYnJ4Z2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTQxODIsImV4cCI6MjA5OTk3MDE4Mn0.UhpinI05tu1WlLxHwGJDis-WiJUDp5AJYuKZysLJ2PY',

  DRAW_AT:  '2026-09-01T20:00:00+08:00',
  LOCKS_AT: '2026-09-01T19:59:00+08:00',

  /* FALLBACK ONLY. The live values come from the server (xf_points) and are
     edited in Admin -> Data -> TICKET VALUES. These are used for the split
     second before that call returns, or if it fails. No need to keep them
     in sync — they are never authoritative. */
  PTS: { checkin: 3, max_days: 8, social: 3, repost: 6, renewal: 1 },

  /* Direct links to the 9.01 poster POST (not the profile).
     Fill these in the moment the poster goes live — until then the
     button falls back to the profile page and members have to hunt for it. */
  POSTER: {
    instagram: '',   // e.g. https://www.instagram.com/p/XXXXXXXXXXX/
    facebook:  ''    // e.g. https://www.facebook.com/xfitness.my/posts/XXXXXXXXXXX
  },

  LINKS: {
    instagram: 'https://www.instagram.com/xfitness.my',
    facebook:  'https://www.facebook.com/share/1EFZeenGsw/',
    tiktok:    'https://www.tiktok.com/@xfitness.my?_r=1&_t=ZS-98INVgwV79F',
    xhs:       'https://xhslink.cn/m/7I4DVc8bdSm',
    google:    'https://g.page/r/CaF4i5tOkzXPEBM/review?utm_source=gbp&utm_medium=reviews&utm_campaign=qr'
  }
};

/* Minimal Supabase RPC helper — no SDK needed, keeps the page tiny and fast. */
window.rpc = async function (fn, args) {
  const res = await fetch(window.XF.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': window.XF.SUPABASE_KEY,
      'Authorization': 'Bearer ' + window.XF.SUPABASE_KEY
    },
    body: JSON.stringify(args || {})
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) {}
    throw new Error('rpc_' + res.status + (detail ? ': ' + detail : ''));
  }
  return res.json();
};
