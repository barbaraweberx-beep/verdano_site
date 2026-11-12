const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const jsQR = require('jsqr');
const { EventStore } = require('../store.cjs');
const { createEventServer } = require('../server.cjs');
const { encodeQr } = require('../scripts/generate-qr.cjs');
const fresh = store => store.checkpoints().map(row => store.issue(row.token).password);
test('different visitors get unique five-character case-sensitive passwords for each checkpoint', () => {
  const store = new EventStore(':memory:');
  try {
    const issued = [];
    for (const checkpoint of store.checkpoints()) for (let i = 0; i < 100; i++) {
      const result = store.issue(checkpoint.token);
      assert.equal(result.checkpoint, checkpoint.id);
      assert.match(result.password, /^[A-Za-z0-9]{5}$/);
      issued.push(result.password);
    }
    assert.equal(new Set(issued).size, 400);
    assert.equal(store.issue('unknown'), null);
  } finally { store.close(); }
});
test('all-or-nothing redemption, duplicate checkpoint, replay, and idempotent success', () => {
  const store = new EventStore(':memory:');
  try {
    const passwords = fresh(store);
    const repeat = store.issue(store.checkpoints()[0].token).password;
    assert.deepEqual(store.redeem(randomUUID(), [passwords[0], repeat, passwords[2], passwords[3]]).body.errors, [{ position: 2, code: 'DUPLICATE_CHECKPOINT' }]);
    assert.equal(store.redeem(randomUUID(), [passwords[0], passwords[0], passwords[2], passwords[3]]).status, 422);
    assert.equal(store.redeem(randomUUID(), [passwords[0], '!!!!!', passwords[2], passwords[3]]).body.errors[0].code, 'INVALID_PASSWORD');
    const id = randomUUID();
    const success = store.redeem(id, passwords);
    assert.equal(success.status, 200);
    assert.deepEqual(store.redeem(id, passwords), success);
    assert.equal(store.redeem(id, fresh(store)).status, 409);
    assert.deepEqual(store.redeem(randomUUID(), passwords).body.errors.map(e => e.code), Array(4).fill('ALREADY_USED'));
  } finally { store.close(); }
});
test('checkpoints, stand key, and consumed passwords survive restart and a second database connection', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'verdano-event-'));
  const filename = path.join(dir, 'event.sqlite');
  let store = new EventStore(filename);
  try {
    const checkpoints = store.checkpoints(), key = store.standKey(), passwords = fresh(store), id = randomUUID();
    store.close(); store = new EventStore(filename);
    assert.deepEqual(store.checkpoints(), checkpoints);
    assert.equal(store.standKey(), key);
    const second = new EventStore(filename);
    try {
      assert.equal(store.redeem(id, passwords).status, 200);
      assert.equal(second.redeem(randomUUID(), passwords).status, 422);
      assert.equal(second.redeem(id, passwords).status, 200);
    } finally { second.close(); }
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('HTTP pages, stand authentication, CORS, validation, rate limits, and racing redemptions', async () => {
  const store = new EventStore(':memory:');
  const server = createEventServer({ store, standKey: 'test-only-key' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const post = (input, headers = {}) => fetch(origin + '/evento/api/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stand-key': 'test-only-key', ...headers }, body: JSON.stringify(input) });
  try {
    const checkpoint = store.checkpoints()[0];
    const route = origin + '/evento/p/' + checkpoint.token;
    const prefetch = await fetch(route, { headers: { purpose: 'prefetch' } });
    assert.equal(prefetch.status, 204);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM passwords').get().n, 0);
    const response = await fetch(route), html = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.match(html, /Parabéns por encontrar a senha 1 da Verdano!/);
    assert.match(html, /Sua senha é:/);
    assert.match(html, /captura de tela/);
    assert.match(html, /vagalumen-symbol.svg/);
    assert.equal((await fetch(origin + '/evento/p/1')).status, 404);
    assert.equal((await fetch(origin + '/evento/assets/../runtime/event.sqlite')).status, 404);
    assert.equal((await fetch(origin + '/evento/api/redeem')).status, 405);
    const input = { submissionId: randomUUID(), passwords: fresh(store) };
    assert.equal((await post(input, { 'x-stand-key': 'wrong' })).status, 401);
    assert.equal((await post(input, { origin: 'https://foreign.invalid' })).status, 403);
    assert.equal((await post({ submissionId: 'bad', passwords: [] })).status, 400);
    assert.equal((await post(input, { 'content-type': 'text/plain' })).status, 415);
    const malformed = await fetch(origin + '/evento/api/redeem', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stand-key': 'test-only-key' }, body: '{' });
    assert.equal(malformed.status, 400);
    const big = await post({ submissionId: 'x'.repeat(3000), passwords: [] });
    assert.equal(big.status, 413);
    const options = await fetch(origin + '/evento/api/redeem', { method: 'OPTIONS', headers: { origin: 'http://www.verdano.com.br:18080' } });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), 'http://www.verdano.com.br:18080');
    const results = await Promise.all([post(input), post({ ...input, submissionId: randomUUID() })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 422]);
    assert.equal((await post(input)).status, 200);
    for (let i = 0; i < 59; i++) assert.equal((await fetch(route)).status, 200);
    assert.equal((await fetch(route)).status, 429);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
test('all four long-URL QR codes decode with centered Lumen at full and reduced size', async () => {
  for (let i = 0; i < 4; i++) {
    const url = 'http://www.verdano.com.br:18080/evento/p/' + require('node:crypto').randomBytes(24).toString('hex');
    const png = await encodeQr(url);
    for (const width of [1000, 400]) {
      const { data, info } = await sharp(png).resize(width, width, { kernel: 'nearest' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
      assert.equal(decoded?.data, url);
    }
  }
});
