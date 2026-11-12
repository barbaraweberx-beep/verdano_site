const { createServer } = require('node:http');
const { timingSafeEqual, createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { EventStore } = require('./store.cjs');
const runtime = process.env.EVENT_DATA_DIR || path.join(__dirname, 'runtime');
const digest = value => createHash('sha256').update(value).digest();
const ASSETS = {
  'style.css': 'text/css; charset=utf-8',
  'vagalumen-symbol.svg': 'image/svg+xml',
  'Caprasimo-Regular.ttf': 'font/ttf',
  'Figtree-Variable.ttf': 'font/ttf',
};
function page(checkpoint, password) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Uma descoberta iluminada · Verdano</title><link rel="stylesheet" href="/evento/assets/style.css"></head><body><main class="card"><img class="lumen" src="/evento/assets/vagalumen-symbol.svg" alt="Lumen, símbolo do VagaLumen" width="136" height="136"><p class="eyebrow">VagaLumen por Verdano</p><span class="checkpoint">Descoberta ${checkpoint} de 4</span><h1>Parabéns por encontrar a senha ${checkpoint} da Verdano!</h1><p class="label">Sua senha é:</p><p class="password" aria-label="Senha: ${password.split('').join(' ')}">${password}</p><p class="case-note">Use as letras maiúsculas e minúsculas exatamente como aparecem.</p><p class="reminder">Não se esqueça de tirar uma captura de tela ou anotar a senha para não esquecê-la.</p><p class="footer">Continue explorando. Cada descoberta acende uma nova experiência.</p></main></body></html>`;
}
function createEventServer({ store = new EventStore(path.join(runtime, 'event.sqlite')), standKey = process.env.EVENT_STAND_KEY || store.standKey(), gameOrigin = process.env.EVENT_GAME_ORIGIN || 'http://www.verdano.com.br:18080', now = Date.now } = {}) {
  // Individual per-IP buckets plus a global bound; no visitor identification required.
  const buckets = new Map();
  function limited(key, maximum) {
    const minute = Math.floor(now() / 60000);
    if (buckets.size > 10000) { for (const [k, v] of buckets) if (v.minute !== minute) buckets.delete(k); }
    const bucket = buckets.get(key);
    if (!bucket || bucket.minute !== minute) { buckets.set(key, { minute, count: 1 }); return false; }
    return ++bucket.count > maximum;
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      const origin = req.headers.origin;
      if (origin === gameOrigin) {
        res.setHeader('Access-Control-Allow-Origin', gameOrigin);
        res.setHeader('Vary', 'Origin');
      }
      const verification = url.pathname === '/evento/api/redeem';
      if (verification && origin && origin !== gameOrigin) return json(403, { success: false, code: 'ORIGIN_NOT_ALLOWED' });
      if (verification && req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Stand-Key' });
        return res.end();
      }
      if (req.method === 'GET' && url.pathname.startsWith('/evento/assets/')) {
        const name = url.pathname.slice('/evento/assets/'.length);
        if (!Object.hasOwn(ASSETS, name)) return json(404, { code: 'NOT_FOUND' });
        res.writeHead(200, { 'Content-Type': ASSETS[name] });
        return res.end(readFileSync(path.join(__dirname, 'assets', name)));
      }
      const checkpoint = /^\/evento\/p\/([a-f0-9]{48})$/.exec(url.pathname);
      // HEAD and prefetch must not issue consumable passwords.
      if (checkpoint && req.method === 'GET') {
        if (req.headers['sec-purpose']?.includes('prefetch') || req.headers.purpose === 'prefetch') { res.writeHead(204); return res.end(); }
        const ip = req.socket.remoteAddress || 'unknown';
        // The service binds to loopback; Caddy overwrites X-Forwarded-For.
        const visitor = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
          ? String(req.headers['x-forwarded-for'] || ip).split(',').at(-1).trim() : ip;
        if (limited('issue-global', 1000) || limited('issue:' + visitor, 60)) return json(429, { code: 'RATE_LIMITED' });
        const issued = store.issue(checkpoint[1]);
        if (!issued) return json(404, { code: 'NOT_FOUND' });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(page(issued.checkpoint, issued.password));
      }
      if (!verification) return json(404, { code: 'NOT_FOUND' });
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return json(405, { code: 'METHOD_NOT_ALLOWED' }); }
      if (limited('redeem-global', 300)) return json(429, { success: false, code: 'RATE_LIMITED' });
      if (!timingSafeEqual(digest(String(req.headers['x-stand-key'] || '')), digest(standKey))) return json(401, { success: false, code: 'UNAUTHORIZED' });
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return json(415, { success: false, code: 'JSON_REQUIRED' });
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) { json(413, { success: false, code: 'BODY_TOO_LARGE' }); return; }
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400, { success: false, code: 'INVALID_JSON' }); }
      if (!input || typeof input.submissionId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(input.submissionId) ||
          !Array.isArray(input.passwords) || input.passwords.length !== 4 || !input.passwords.every(p => typeof p === 'string' && /^[a-zA-Z0-9]{5}$/.test(p))) {
        return json(400, { success: false, code: 'INVALID_REQUEST' });
      }
      const result = store.redeem(input.submissionId, input.passwords);
      json(result.status, result.body);
    } catch (error) {
      console.error('Event request failed:', error.code || error.name);
      if (!res.headersSent) json(503, { success: false, code: 'TEMPORARILY_UNAVAILABLE' }); else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (require.main === module) {
  const store = new EventStore(path.join(runtime, 'event.sqlite'));
  const server = createEventServer({ store });
  server.listen(Number(process.env.EVENT_PORT || 3100), '127.0.0.1', () => console.log('Verdano event server listening on loopback.'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
module.exports = { createEventServer, page };
