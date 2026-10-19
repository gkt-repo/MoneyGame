const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const url = process.env.DATABASE_URL || '';
if (url.startsWith('file:')) {
  if (!url.startsWith('file:/')) throw new Error('Docker SQLite requires an absolute database path');
  const file = fileURLToPath(url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    // Create a missing database without ever truncating an existing file.
    fs.closeSync(fs.openSync(file, 'ax'));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}
