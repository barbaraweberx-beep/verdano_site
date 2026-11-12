const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = process.env.VERDANO_PREVIEW_URL || 'http://127.0.0.1:8080';
const base = origin + '/teste/gestor';
async function main() {
  const homepage = await fetch(origin, { redirect: 'manual' });
  assert.equal(homepage.status, 200);
  assert.equal(homepage.headers.get('location'), null);
  const html = Buffer.from(await homepage.arrayBuffer());
  assert.deepEqual(html, fs.readFileSync(path.join(__dirname, '../index.html')));
  assert.ok(!html.toString().includes('/teste/gestor'), 'Landing must not introduce a Gestor link.');
  const productPage = await fetch(origin + '/vagalumen/');
  assert.equal(productPage.status, 200);
  assert.deepEqual(Buffer.from(await productPage.arrayBuffer()), fs.readFileSync(path.join(__dirname, '../vagalumen/index.html')));
  const productRedirect = await fetch(origin + '/vagalumen', { redirect: 'manual' });
  assert.equal(productRedirect.status, 308);
  assert.equal(productRedirect.headers.get('location'), '/vagalumen/');
  for (const p of ['/.git/config', '/CNAME', '/README.md', '/deploy/routes.caddy', '/.env', '/admin', '/api/attractions', '/teste/gestor-extra', '/event-server/runtime/event.sqlite', '/event-server/print/qr-links.json', '/package.json', '/evento/api/passwords']) {
    assert.equal((await fetch(origin + p, { redirect: 'manual' })).status, 404, p);
  }
  for (const p of ['', '/admin/attractions', '/admin/attractions/id/plants/1/qr']) {
    const response = await fetch(base + p, { redirect: 'manual' });
    assert.equal(response.status, 307, p);
    assert.equal(response.headers.get('location'), base + '/login');
  }
  assert.equal((await fetch(base + '/login')).status, 200);
  assert.equal((await fetch(base + '/branding/vagalumen-symbol.svg')).status, 200);
  const catalog = await fetch(base + '/api/attractions');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get('access-control-allow-origin'), '*');
  const attractions = await catalog.json();
  assert.ok(Array.isArray(attractions));
  assert.equal((await fetch(base + '/api/plants')).status, 200);
  if (attractions[0]) assert.equal((await fetch(base + '/api/attractions/' + attractions[0].slug)).status, 200);
  assert.equal((await fetch(base + '/auth/login', { method: 'POST', headers: { origin: 'https://foreign.invalid' }, body: new URLSearchParams({username:'invalid',password:'invalid'}), redirect:'manual' })).status, 403);
  console.log('PASS: exact landing HTML, no manager link/redirect, private repository paths blocked, protected manager/QR, branding and anonymous catalog reads, foreign-origin POST blocked.');
  if (!process.env.GESTOR_TEST_USERNAME || !process.env.GESTOR_TEST_PASSWORD) {
    console.log('Login/logout check skipped: supply GESTOR_TEST_USERNAME and GESTOR_TEST_PASSWORD in the environment.');
    return;
  }
  const login = await fetch(base + '/auth/login', { method:'POST', headers:{origin}, body:new URLSearchParams({username:process.env.GESTOR_TEST_USERNAME,password:process.env.GESTOR_TEST_PASSWORD}), redirect:'manual' });
  assert.equal(login.status,303);
  assert.equal(login.headers.get('location'),base+'/admin/attractions');
  const setCookie = login.headers.get('set-cookie');
  assert.ok(setCookie); assert.match(setCookie,/HttpOnly/i); assert.match(setCookie,/Path=\/teste\/gestor/);
  const cookie = setCookie.split(';')[0];
  try {
    const admin = await fetch(base+'/admin/attractions',{headers:{cookie}});
    assert.equal(admin.status,200);
    assert.match(await admin.text(),/Conectado como/);
  } finally {
    const logout = await fetch(base+'/auth/logout',{method:'POST',headers:{cookie,origin},redirect:'manual'});
    assert.equal(logout.status,303); assert.equal(logout.headers.get('location'),base+'/login');
  }
  assert.equal((await fetch(base+'/admin/attractions',{headers:{cookie},redirect:'manual'})).status,307);
  console.log('PASS: real database login, proxy-aware redirect, scoped HttpOnly session, authenticated manager, logout and revoked-cookie replay.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
