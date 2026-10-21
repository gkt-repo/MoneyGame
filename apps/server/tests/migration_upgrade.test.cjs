const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const serverDir = path.resolve(__dirname, '..');
const prisma = require.resolve('prisma');
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: serverDir, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}
test('baseline adoption preserves existing wallets and history, and upgrades reservations and payouts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moneygame-migration-'));
  const db = path.join(dir, 'legacy.db');
  const env = { ...process.env, DATABASE_URL: `file:${db}` };
  try {
    run('python3', ['-c', `
import sqlite3, sys
connection = sqlite3.connect(sys.argv[1])
connection.executescript(open('prisma/migrations/20261019000000_baseline/migration.sql').read())
connection.executescript('''
INSERT INTO User(id,username) VALUES('user-1','legacy-user');
INSERT INTO Wallet(id,userId,balance,lockedBalance) VALUES('wallet-1','user-1',15.25,3);
INSERT INTO Deposit(id,userId,baseAmount,offsetPaise,totalAmount,receivingUpi,status,utr,expiresAt)
VALUES('dep-1','user-1',100,12,100.12,'test@bank','APPROVED',' old_utr_01 ','2020-01-01');
INSERT INTO Deposit(id,userId,baseAmount,offsetPaise,totalAmount,receivingUpi,status,expiresAt)
VALUES('dep-2','user-1',200,12,200.12,'test@bank','PENDING','2099-01-01');
INSERT INTO Room(id,roomCode,entryFee,status,winnerId) VALUES('room-1','OLD-ROOM',10,'COMPLETED','user-1');
INSERT INTO "Transaction"(id,userId,amount,type,referenceId) VALUES('tx-1','user-1',18,'ROOM_WIN','room-1');
''')
connection.commit()
`, db], env);
    run(process.execPath, [prisma, 'migrate', 'resolve', '--applied', '20261019000000_baseline', '--schema', 'prisma/schema.prisma'], env);
    run(process.execPath, [prisma, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], env);
    const data = JSON.parse(run('python3', ['-c', `
import sqlite3, sys, json
c = sqlite3.connect(sys.argv[1])
print(json.dumps({
 'wallet': c.execute('SELECT balance,lockedBalance FROM Wallet').fetchone(),
 'deposits': c.execute('SELECT id,utr,activeAmountKey FROM Deposit ORDER BY id').fetchall(),
 'prize': c.execute('SELECT winnerPrize FROM Room').fetchone()[0],
 'transactions': c.execute('SELECT COUNT(*) FROM "Transaction"').fetchone()[0]
}))
`, db], env));
    assert.deepEqual(data.wallet, [15.25, 3]);
    assert.deepEqual(data.deposits, [['dep-1', 'OLD_UTR_01', null], ['dep-2', null, 20012]]);
    assert.equal(data.prize, 18); assert.equal(data.transactions, 1);
    // Re-running deployment must not reset data or reapply the upgrade.
    run(process.execPath, [prisma, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], env);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fresh SQLite startup creates its database and never truncates an existing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moneygame-fresh-'));
  const db = path.join(dir, 'data', 'new.db');
  const env = { ...process.env, DATABASE_URL: `file:${db}` };
  try {
    run(process.execPath, ['scripts/ensure-sqlite.cjs'], env);
    run(process.execPath, [prisma, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], env);
    const before = fs.readFileSync(db);
    assert(before.length > 0);
    run(process.execPath, ['scripts/ensure-sqlite.cjs'], env);
    assert.deepEqual(fs.readFileSync(db), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('production rejects default secrets and accepts deployment-specific secrets', () => {
  const env = { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'moneygame-super-secret-jwt-key', WEBHOOK_SECRET: 'moneygame-secret-key-1234' };
  const rejected = spawnSync(process.execPath, ['-r', 'ts-node/register', '-e', "require('./src/config')"], { cwd: serverDir, env, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /JWT_SECRET|WEBHOOK_SECRET/);
  run(process.execPath, ['-r', 'ts-node/register', '-e', "require('./src/config')"], { ...env, JWT_SECRET: 'a'.repeat(64), WEBHOOK_SECRET: 'b'.repeat(64) });
});

test('moderator upgrade retains assigned UPIs and backfills IST daily reservations', () => {
  const output = run('python3', ['-c', `
import sqlite3, json
from pathlib import Path
c = sqlite3.connect(':memory:')
paths = sorted(Path('prisma/migrations').glob('*/migration.sql'))
for p in paths:
    if p.parent.name == '20261022010000_moderator_devices':
        c.executescript('''
INSERT INTO User(id,username,role) VALUES('mod','desk','MODERATOR'),('player','player','USER');
INSERT INTO UpiAccount(id,upiId,receiverName,assignedUserId) VALUES('upi','desk@bank','Desk','mod');
INSERT INTO Deposit(id,userId,baseAmount,offsetPaise,totalAmount,receivingUpi,status,expiresAt,createdAt)
VALUES('d1','player',100,1,100.01,'desk@bank','APPROVED','2026-10-21T20:00:00Z','2026-10-21T19:00:00Z');
INSERT INTO Deposit(id,userId,baseAmount,offsetPaise,totalAmount,receivingUpi,status,expiresAt,createdAt)
VALUES('d2','player',200,1,200.01,'desk@bank','EXPIRED','2026-10-21T20:00:00Z',1792609200000);
''')
    c.executescript(p.read_text())
print(json.dumps({
 'owner': c.execute('SELECT assignedUserId FROM UpiAccount').fetchone()[0],
 'usage': c.execute('SELECT day,issuedCount,receivedCount FROM UpiDailyUsage ORDER BY day').fetchall(),
 'deposits': c.execute('SELECT COUNT(*) FROM Deposit WHERE upiAccountId = ?', ('upi',)).fetchone()[0],
 'foreignKeys': c.execute('PRAGMA foreign_key_list(UpiAccount)').fetchall()
}))
`]);
  const data = JSON.parse(output);
  assert.equal(data.owner, 'mod');
  assert.equal(data.deposits, 2);
  assert.deepEqual(data.usage, [['2026-10-22', 2, 1]]);
  assert(data.foreignKeys.some(key => key[2] === 'User'));
});
