export default {
async fetch(req, env, ctx) {
const ALLOWED = ['https://nazargru.github.io'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const origin = req.headers.get('Origin') || '';
const cors = { 'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0], 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'x-goog-api-key, content-type, x-goog-upload-protocol, x-goog-upload-command, x-goog-upload-header-content-length, x-goog-upload-header-content-type, x-goog-upload-offset', 'Access-Control-Expose-Headers': 'x-goog-upload-url', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
if (origin && !ALLOWED.includes(origin)) return new Response('Forbidden', { status: 403 });
const u = new URL(req.url);
const cookieOf = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; ');
try {
if (['/sync', '/backups', '/backup'].includes(u.pathname)) {
const id = u.searchParams.get('id') || '';
if (!/^[A-Za-z0-9_-]{24,64}$/.test(id)) return json({ error: 'bad id' }, 400);
if (!env.DB) return json({ error: 'KV not bound' }, 500);
const key = 'u:' + id;
if (u.pathname === '/backups') { const l = await env.DB.list({ prefix: 'b:' + id + ':' }); return json({ days: l.keys.map(k => k.name.split(':').pop()) }); }
if (u.pathname === '/backup') { const day = (u.searchParams.get('day') || '').replace(/[^0-9-]/g, ''); return new Response((await env.DB.get('b:' + id + ':' + day)) || 'null', { headers: { ...cors, 'Content-Type': 'application/json' } }); }
if (req.method === 'GET') return new Response((await env.DB.get(key)) || 'null', { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
if (req.method === 'PUT') {
const body = await req.text();
if (body.length > 24 * 1024 * 1024) return json({ error: 'too big' }, 413);
JSON.parse(body);
const day = new Date().toISOString().slice(0, 10);
const old = await env.DB.getWithMetadata(key);
if (old.value && (!old.metadata || old.metadata.bday !== day)) await env.DB.put('b:' + id + ':' + day, old.value, { expirationTtl: 30 * 86400 });
await env.DB.put(key, body, { metadata: { bday: old.value ? day : '', at: Date.now() } });
return json({ ok: true, at: Date.now() });
}
}
if (u.pathname === '/g') {
const target = u.searchParams.get('u') || '';
if (new URL(target).hostname !== 'generativelanguage.googleapis.com') return new Response('Forbidden host', { status: 403, headers: cors });
const h = new Headers();
for (const [k, v] of req.headers) { const kl = k.toLowerCase(); if (kl === 'x-goog-api-key' || kl === 'content-type' || kl.startsWith('x-goog-upload')) h.set(k, v); }
if (req.method === 'POST' && target.includes(':generateContent')) {
const buf = await req.arrayBuffer();
const ts = new TransformStream();
const w = ts.writable.getWriter();
const enc = new TextEncoder();
const work = (async () => {
const ka = setInterval(() => { w.write(enc.encode(' ')).catch(() => {}); }, 8000);
let out;
try { const r = await fetch(target, { method: 'POST', headers: h, body: buf }); out = await r.text(); }
catch (e) { out = JSON.stringify({ error: { code: 502, message: String(e) } }); }
clearInterval(ka);
await w.write(enc.encode(out));
await w.close();
})();
ctx.waitUntil(work);
return new Response(ts.readable, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
const r = await fetch(target, { method: req.method, headers: h, body: req.method === 'GET' ? undefined : req.body });
const oh = new Headers(cors);
oh.set('Content-Type', r.headers.get('Content-Type') || 'application/json');
const up = r.headers.get('x-goog-upload-url');
if (up) oh.set('x-goog-upload-url', up);
return new Response(r.body, { status: r.status, headers: oh });
}
if (u.pathname === '/tt') {
const url = u.searchParams.get('url') || '';
if (!url.includes('tiktok.com/')) return json({ code: -1, msg: 'TikTok link needed' }, 400);
let m = url.match(/\/(?:video|photo)\/(\d{10,})/);
if (!m) { const first = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } }); m = first.url.match(/\/(?:video|photo|v)\/(\d{10,})/); if (!m) m = (await first.text()).match(/"(?:id|aweme_id|itemId)":"(\d{15,})"/); }
if (!m) return json({ code: -1, msg: 'No video id' });
const id = m[1];
const page = await fetch('https://www.tiktok.com/@_/video/' + id, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
const cookie = cookieOf(page);
const html = await page.text();
const s = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
let item = null;
try { item = JSON.parse(s[1]).__DEFAULT_SCOPE__['webapp.video-detail'].itemInfo.itemStruct; } catch (e) {}
if (!item) return json({ code: -1, msg: 'TikTok page blocked' });
const author = (item.author && item.author.uniqueId) || '';
const v = item.video || {};
const images = ((item.imagePost || {}).images || []).map(i => ((i.imageURL || {}).urlList || [])[0]).filter(Boolean);
const comments = [];
try {
const r = await fetch('https://www.tiktok.com/api/comment/list/?aid=1988&count=50&cursor=0&aweme_id=' + id, { headers: { 'User-Agent': UA, 'Referer': 'https://www.tiktok.com/', 'Cookie': cookie } });
const t = await r.text();
const j = t ? JSON.parse(t) : {};
for (const c of (j.comments || [])) { const cu = (c.user && c.user.unique_id) || ''; comments.push({ text: c.text || '', user: cu, likes: c.digg_count || 0, pinned: !!(c.author_pin || c.stick_position), byAuthor: !!author && cu === author }); for (const rc of (c.reply_comment || [])) { const ru = (rc.user && rc.user.unique_id) || ''; if (author && ru === author) comments.push({ text: rc.text || '', user: ru, likes: rc.digg_count || 0, byAuthor: true, reply: true }); } }
} catch (e) {}
return json({ code: 0, via: 'direct', ck: btoa(cookie), data: { id, title: item.desc || '', play: v.playAddr || v.downloadAddr || '', images }, author, comments });
}
if (u.pathname === '/comments') {
const url = u.searchParams.get('url') || '';
if (!url.includes('tiktok.com/')) return json({ code: -1, msg: 'TikTok link needed' }, 400);
const first = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
let m = first.url.match(/\/(?:video|photo|v)\/(\d{10,})/);
if (!m) m = (await first.text()).match(/"(?:id|aweme_id|itemId)":"(\d{15,})"/);
if (!m) return json({ code: -1, msg: 'No video id' });
const id = m[1], errors = [];
let author = '', comments = [];
try {
const page = await fetch('https://www.tiktok.com/@_/video/' + id, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
const cookie = cookieOf(page);
const ph = await page.text();
const sm = ph.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
if (sm) { try { const it = JSON.parse(sm[1]).__DEFAULT_SCOPE__['webapp.video-detail'].itemInfo.itemStruct; author = (it.author && it.author.uniqueId) || ''; } catch (e) {} }
const r = await fetch('https://www.tiktok.com/api/comment/list/?aid=1988&count=50&cursor=0&aweme_id=' + id, { headers: { 'User-Agent': UA, 'Referer': 'https://www.tiktok.com/', 'Cookie': cookie } });
const t = await r.text();
const j = t ? JSON.parse(t) : {};
for (const c of (j.comments || [])) {
const cu = (c.user && c.user.unique_id) || '';
comments.push({ text: c.text || '', user: cu, likes: c.digg_count || 0, pinned: !!(c.author_pin || c.stick_position), byAuthor: !!author && cu === author });
for (const rc of (c.reply_comment || [])) { const ru = (rc.user && rc.user.unique_id) || ''; if (author && ru === author) comments.push({ text: rc.text || '', user: ru, likes: rc.digg_count || 0, byAuthor: true, reply: true }); }
}
if (!comments.length) errors.push('tiktok: empty');
} catch (e) { errors.push('tiktok: ' + e); }
if (!comments.length) {
try {
const r = await fetch('https://www.tikwm.com/api/comment/list/', { method: 'POST', body: new URLSearchParams({ url, count: '50', cursor: '0' }), headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
const j = await r.json();
for (const c of ((j.data && j.data.comments) || [])) { const cu = (c.user && c.user.unique_id) || ''; comments.push({ text: c.text || '', user: cu, likes: c.digg_count || 0, byAuthor: !!author && cu === author }); }
if (!comments.length) errors.push('tikwm: ' + (j.msg || 'empty'));
} catch (e) { errors.push('tikwm: ' + e); }
}
return json({ code: 0, id, author, comments, errors });
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
