const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const serverDir = path.resolve(__dirname, '..');
const cases = {
  auth: 'auth.test.ts', admin: 'admin_user_control.test.ts',
  payment: 'payment_system.test.ts', security: 'security_regression.test.ts',
  game: 'teen_patti.test.ts',
};
const generated = spawnSync(process.execPath, [require.resolve('prisma'), 'generate', '--schema', 'prisma/schema.prisma'], { cwd: serverDir, stdio: 'inherit' });
if (generated.status !== 0) throw new Error('Prisma client generation failed');
const selected = process.argv.slice(2);
for (const name of selected.length ? selected : Object.keys(cases)) {
  if (!cases[name]) throw new Error(`Unknown suite: ${name}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moneygame-test-'));
  const db = path.join(dir, 'test.db');
  fs.writeFileSync(db, '');
  fs.writeFileSync(path.join(dir, '.moneygame-test'), 'isolated');
  const env = {
    ...process.env, NODE_ENV: 'test', DATABASE_URL: `file:${db}`, MONEYGAME_TEST_DIR: dir,
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex'),
    ADMIN_INITIAL_EMAIL: 'admin@example.test', ADMIN_INITIAL_PHONE: '9999999999',
    ADMIN_INITIAL_PASSWORD: crypto.randomBytes(24).toString('hex'),
    SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', PLATFORM_COMMISSION_PERCENT: '10',
  };
  try {
    const prisma = require.resolve('prisma');
    const setup = spawnSync(process.execPath, [prisma, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { cwd: serverDir, env, stdio: 'inherit' });
    if (setup.status !== 0) throw new Error('Test database migration failed');
    const test = spawnSync(process.execPath, ['-r', 'ts-node/register', path.join('tests', cases[name])], { cwd: serverDir, env, stdio: 'inherit' });
    if (test.status !== 0) { process.exitCode = 1; break; }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
