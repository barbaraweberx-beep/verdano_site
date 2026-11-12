const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomInt, createHash } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const hash = value => createHash('sha256').update(value).digest('hex');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
class EventStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS checkpoints (id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 4), token TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS passwords (hash TEXT PRIMARY KEY, checkpoint INTEGER NOT NULL REFERENCES checkpoints(id), issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, used_at TEXT);
      CREATE TABLE IF NOT EXISTS redemptions (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (let i = 1; i <= 4; i++) this.db.prepare('INSERT OR IGNORE INTO checkpoints(id, token) VALUES (?,?)').run(i, randomBytes(24).toString('hex'));
      this.db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('stand_key', randomBytes(32).toString('hex'));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  checkpoints() { return this.db.prepare('SELECT id,token FROM checkpoints ORDER BY id').all(); }
  standKey() { return this.db.prepare("SELECT value FROM settings WHERE key='stand_key'").get().value; }
  issue(token) {
    const checkpoint = this.db.prepare('SELECT id FROM checkpoints WHERE token=?').get(token);
    if (!checkpoint) return null;
    for (let attempt = 0; attempt < 20; attempt++) {
      const password = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('');
      const result = this.db.prepare('INSERT OR IGNORE INTO passwords(hash,checkpoint) VALUES (?,?)').run(hash(password), checkpoint.id);
      if (result.changes) return { checkpoint: checkpoint.id, password };
    }
    throw Error('Password generation failed');
  }
  redeem(id, passwords) {
    const fingerprint = hash(JSON.stringify(passwords));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db.prepare('SELECT fingerprint FROM redemptions WHERE id=?').get(id);
      let response;
      if (previous) {
        response = previous.fingerprint === fingerprint
          ? { status: 200, body: { success: true, redemptionId: id } }
          : { status: 409, body: { success: false, code: 'IDEMPOTENCY_CONFLICT' } };
      } else {
        const rows = passwords.map(password => this.db.prepare('SELECT checkpoint,used_at FROM passwords WHERE hash=?').get(hash(password)));
        const errors = [];
        const seen = new Set();
        rows.forEach((row, index) => {
          let code;
          if (!row) code = 'INVALID_PASSWORD';
          else if (row.used_at) code = 'ALREADY_USED';
          else if (seen.has(row.checkpoint)) code = 'DUPLICATE_CHECKPOINT';
          if (row) seen.add(row.checkpoint);
          if (code) errors.push({ position: index + 1, code });
        });
        if (errors.length) response = { status: 422, body: { success: false, errors } };
        else {
          for (const password of passwords) this.db.prepare('UPDATE passwords SET used_at=CURRENT_TIMESTAMP WHERE hash=? AND used_at IS NULL').run(hash(password));
          this.db.prepare('INSERT INTO redemptions(id,fingerprint) VALUES (?,?)').run(id, fingerprint);
          response = { status: 200, body: { success: true, redemptionId: id } };
        }
      }
      this.db.exec('COMMIT');
      return response;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
module.exports = { EventStore };
