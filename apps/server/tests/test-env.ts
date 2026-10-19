import fs from 'fs';
import os from 'os';
import path from 'path';

// This must be imported before any application module. Direct test execution
// against a development/production DATABASE_URL is intentionally refused.
const dir = process.env.MONEYGAME_TEST_DIR || '';
if (process.env.NODE_ENV !== 'test' || path.dirname(dir) !== os.tmpdir()
    || !path.basename(dir).startsWith('moneygame-test-')
    || !fs.existsSync(path.join(dir, '.moneygame-test'))
    || process.env.DATABASE_URL !== `file:${path.join(dir, 'test.db')}`) {
  throw new Error('Run tests through npm test; an isolated temporary database is required');
}
const log = console.log;
console.log = (...args: any[]) => {
  if (args.some(arg => typeof arg === 'string' && arg.includes('❌ FAIL'))) throw new Error(args.join(' '));
  log(...args);
};
