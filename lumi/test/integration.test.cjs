const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function worker() {
  const handlers = {}, removed = [];
  const self = { registration: { scope: 'https://verdano.test/lumi/' }, location: { origin: 'https://verdano.test' },
    addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim() {} }, skipWaiting() {} };
  const caches = { keys: async () => ['another-app-cache','lumi-v2','verdano-lumi-v1','verdano-lumi-v3'], delete: async key => { removed.push(key); } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), { self, caches, URL, Set });
  return { handlers, removed };
}
test('game inline JavaScript and bundled QR reader parse; PWA assets exist', () => {
  const html=fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
  new vm.Script(fs.readFileSync(path.join(root,'jsQR.js'),'utf8'));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  assert.equal(manifest.scope,'./');
  for (const file of ['index.html','jsQR.js','sw.js','manifest.json',...manifest.icons.map(icon=>icon.src)]) assert.ok(fs.existsSync(path.join(root,file)), file);
});
test('Lumi activation removes only its own older caches', async () => {
  const {handlers,removed}=worker(); let completion;
  handlers.activate({waitUntil: promise => {completion=promise;}});
  await completion;
  assert.deepEqual(removed,['lumi-v2','verdano-lumi-v1']);
});
test('worker never handles Gestor, event, Lumi API, third-party or POST requests', () => {
  const {handlers}=worker();
  for (const [url, method] of [
    ['https://verdano.test/teste/gestor/api/attractions','GET'],
    ['https://verdano.test/evento/p/checkpoint','GET'],
    ['https://verdano.test/lumi/api/ranking','GET'],
    ['https://verdano.test/lumi/api/sync','POST'],
    ['https://fonts.googleapis.com/css2','GET'],
  ]) handlers.fetch({request:{url,method},respondWith(){assert.fail('Request must bypass game cache');}});
});

async function cameraScenario({secure=true, state, queryFails=false, error}={}) {
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const source=html.slice(html.indexOf('const cameraPermissionHelp'),html.indexOf('function qrClose()'));
  const elements=Object.fromEntries(['#qr-msg','#qr-manual','#qr-note','#b-camera-retry','#qr-video'].map(id=>[id,{style:{},play:async()=>{}}]));
  let calls=0;
  const context={window:{isSecureContext:secure},navigator:{permissions:{query:async()=>{if(queryFails)throw new TypeError();return {state};}},mediaDevices:{getUserMedia:async()=>{calls++;if(error)throw {name:error};return {};}}}, $:id=>elements[id],show(){},qrClose(){},cur:'s-qr',qrLoop(){},qrStream:null};
  await vm.runInNewContext(source+';qrOpen();',context);
  return {elements,calls};
}
test('camera distinguishes insecure origin and blocked permissions without requesting capture',async()=>{
  const insecure=await cameraScenario({secure:false});
  assert.equal(insecure.calls,0);assert.match(insecure.elements['#qr-note'].textContent,/HTTPS/);
  const denied=await cameraScenario({state:'denied'});
  assert.equal(denied.calls,0);assert.match(denied.elements['#qr-note'].textContent,/permissões/);assert.equal(denied.elements['#b-camera-retry'].hidden,false);
});
test('unsupported permission query still opens camera; denial and missing hardware have distinct guidance',async()=>{
  const allowed=await cameraScenario({queryFails:true});assert.equal(allowed.calls,1);assert.equal(allowed.elements['#qr-note'].style.display,'none');
  const denied=await cameraScenario({error:'NotAllowedError'});assert.match(denied.elements['#qr-note'].textContent,/bloqueado/);
  const missing=await cameraScenario({error:'NotFoundError'});assert.match(missing.elements['#qr-note'].textContent,/Nenhuma câmera/);
});
