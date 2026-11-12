const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const sharp = require('sharp');
const { EventStore } = require('../store.cjs');
async function encodeQr(payload) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' });
  const scale = Math.floor(1024 / (qr.modules.size + 8));
  const png = await QRCode.toBuffer(payload, { scale, margin: 4, errorCorrectionLevel: 'H' });
  const badgeSize = Math.floor(qr.modules.size * scale * 0.16);
  const logo = await sharp(readFileSync(path.join(__dirname, '../assets/vagalumen-symbol.svg'))).resize(badgeSize - 16, badgeSize - 16).png().toBuffer();
  const badge = await sharp({ create: { width: badgeSize, height: badgeSize, channels: 4, background: '#ffffff' } }).composite([{ input: logo, gravity: 'centre' }]).png().toBuffer();
  return sharp(png).composite([{ input: badge, gravity: 'centre' }]).png().toBuffer();
}
async function generate({ store, output, origin }) {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Supply an HTTP(S) origin without a path.');
  mkdirSync(output, { recursive: true });
  const entries = [];
  for (const row of store.checkpoints()) {
    const link = `${url.origin}/evento/p/${row.token}`;
    const filename = `senha-${row.id}.png`;
    writeFileSync(path.join(output, filename), await encodeQr(link));
    entries.push({ checkpoint: row.id, url: link, file: filename });
  }
  writeFileSync(path.join(output, 'qr-links.json'), JSON.stringify(entries, null, 2));
  writeFileSync(path.join(output, 'imprimir.html'), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>QRs do evento Verdano</title><style>body{font-family:Arial;text-align:center}.sheet{page-break-after:always;margin:30px auto;max-width:650px}img{display:block;width:85%;margin:auto}h1{color:#2c1a63}@media print{.sheet{break-after:page}}</style>${entries.map(e => `<section class="sheet"><h1>VagaLumen por Verdano</h1><h2>Descoberta ${e.checkpoint} de 4</h2><img src="${e.file}" alt="QR da senha ${e.checkpoint}"><p>Escaneie com a câmera do celular para descobrir sua senha.</p></section>`).join('')}</html>`);
  return entries;
}
if (require.main === module) {
  const store = new EventStore(path.join(process.env.EVENT_DATA_DIR || path.join(__dirname, '../runtime'), 'event.sqlite'));
  generate({ store, output: path.join(__dirname, '../print'), origin: process.env.EVENT_PUBLIC_ORIGIN || 'http://www.verdano.com.br:18080' })
    .then(() => console.log('Four branded QR codes generated in event-server/print.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => store.close());
}
module.exports = { generate, encodeQr };
