export default {
async fetch(req) {
const ALLOWED = ['https://nazargru.github.io'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const origin = req.headers.get('Origin') || '';
const cors = { 'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0], 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'x-goog-api-key, content-type, x-goog-upload-protocol, x-goog-upload-command, x-goog-upload-header-content-length, x-goog-upload-header-content-type, x-goog-upload-offset', 'Access-Control-Expose-Headers': 'x-goog-upload-url', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...cors, 'Content-Type': 'application/json' } });
if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
if (origin && !ALLOWED.includes(origin)) return new Response('Forbidden', { status: 403 });
const u = new URL(req.url);
const cookieOf = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ');
try {
if (u.pathname === '/g') {
const target = u.searchParams.get('u') || '';
if (new URL(target).hostname !== 'generativelanguage.googleapis.com') return new Response('Forbidden host', { status: 403, headers: cors });
const h = new Headers();
for (const [k, v] of req.headers) { const kl = k.toLowerCase(); if (kl === 'x-goog-api-key' || kl === 'content-type' || kl.startsWith('x-goog-upload')) h.set(k, v); }
const r = await fetch(target, { method: req.method, headers: h, body: req.method === 'GET' ? undefined : req.body });
const oh = new Headers(cors);
oh.set('Content-Type', r.headers.get('Content-Type') || 'application/json');
const up = r.headers.get('x-goog-upload-url');
if (up) oh.set('x-goog-upload-url', up);
return new Response(r.body, { status: r.status, headers: oh });
}
if (u.pathname === '/info') {
const url = u.searchParams.get('url') || '';
if (!url.includes('tiktok.com/')) return json({ code: -1, msg: 'TikTok link needed' }, 400);
const errors = [];
try {
const r = await fetch('https://www.tikwm.com/api/', { method: 'POST', body: new URLSearchParams({ url, hd: '0' }), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
const j = await r.json();
if (j.code === 0 && j.data) return json({ code: 0, via: 'tikwm', data: { id: j.data.id, title: j.data.title, play: j.data.play, images: j.data.images } });
errors.push('tikwm: ' + j.msg);
} catch (e) { errors.push('tikwm: ' + e); }
const first = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
let m = first.url.match(/\/(?:video|photo|v)\/(\d{10,})/);
let html = await first.text();
if (!m) m = html.match(/"(?:id|aweme_id|itemId)":"(\d{15,})"/);
if (!m) return json({ code: -1, msg: 'No video id. ' + errors.join('; ') });
const page = await fetch('https://www.tiktok.com/@_/video/' + m[1], { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
const cookie = cookieOf(page);
html = await page.text();
const s = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
if (!s) return json({ code: -1, msg: 'TikTok page blocked. ' + errors.join('; ') });
const data = JSON.parse(s[1]);
const item = (((data.__DEFAULT_SCOPE__ || {})['webapp.video-detail'] || {}).itemInfo || {}).itemStruct;
if (!item) return json({ code: -1, msg: 'Video not available. ' + errors.join('; ') });
const v = item.video || {};
const images = ((item.imagePost || {}).images || []).map(i => ((i.imageURL || {}).urlList || [])[0]).filter(Boolean);
return json({ code: 0, via: 'direct', ck: btoa(cookie), data: { id: m[1], title: item.desc || '', play: v.playAddr || v.downloadAddr || '', images } });
}
if (u.pathname === '/media') {
const src = u.searchParams.get('src') || '';
const host = new URL(src).hostname;
const ok = ['tikwm.com', 'tiktok', 'byteimg', 'bytecdn', 'muscdn', 'ttwstatic'].some(k => host.includes(k));
if (!ok) return new Response('Forbidden host', { status: 403, headers: cors });
const ck = u.searchParams.get('ck');
const headers = { 'User-Agent': UA, 'Referer': host.includes('tikwm') ? 'https://www.tikwm.com/' : 'https://www.tiktok.com/' };
if (ck) headers['Cookie'] = atob(ck);
const r = await fetch(src, { headers });
return new Response(r.body, { status: r.status, headers: { ...cors, 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream' } });
}
return new Response('Kazanok proxy OK', { headers: cors });
} catch (e) {
return json({ code: -1, msg: String(e) }, 502);
}
}
};
