const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const jwt = expires => `e30.${Buffer.from(JSON.stringify({ exp: expires })).toString('base64url')}.signature`;
const response = (status, data) => ({ status, ok: status < 400, json: async () => data });

function client(app, fetch) {
  const prefix = app === 'user-web' ? 'user' : 'admin';
  const store = new Map([[`moneygame_${prefix}_token`, jwt(1)], [`moneygame_${prefix}_refresh_token`, 'refresh-old']]);
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, `../../${app}/src/services/api.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, {
    exports, fetch, Date, atob: value => Buffer.from(value, 'base64').toString('binary'),
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    window: { location: { reload() {} } },
  });
  return { api: exports[prefix + 'Api'], store, prefix };
}
for (const app of ['user-web', 'admin-web']) {
  test(`${app}: concurrent requests share one refresh and use the new token`, async () => {
    let refreshes = 0; let requests = 0;
    const fresh = jwt(Date.now() / 1000 + 900);
    const { api } = client(app, async (url, options) => {
      if (url.endsWith('/refresh-token')) {
        refreshes++; await new Promise(resolve => setTimeout(resolve, 10));
        return response(200, { accessToken: fresh, refreshToken: 'refresh-new' });
      }
      requests++; assert.equal(options.headers.Authorization, `Bearer ${fresh}`);
      return response(200, { user: { id: 'u' }, admin: { id: 'a' } });
    });
    await Promise.all([api.getMe(), api.getMe(), api.getMe()]);
    assert.equal(refreshes, 1); assert.equal(requests, 3);
  });
  test(`${app}: an expired-token response refreshes and retries once`, async () => {
    let requests = 0; let refreshes = 0;
    const fresh = jwt(Date.now() / 1000 + 1800);
    const { api } = client(app, async url => {
      if (url.endsWith('/refresh-token')) { refreshes++; return response(200, { accessToken: fresh, refreshToken: 'refresh-new' }); }
      requests++;
      return requests === 1 ? response(401, { code: 'TOKEN_EXPIRED' }) : response(200, { user: {}, admin: {} });
    });
    api.setToken(jwt(Date.now() / 1000 + 900));
    await api.getMe(); assert.equal(requests, 2); assert.equal(refreshes, 1);
  });
  test(`${app}: rejected refresh clears the session`, async () => {
    const { api, store, prefix } = client(app, async () => response(401, { error: 'Refresh token revoked' }));
    await assert.rejects(api.getMe(), /revoked/);
    assert.equal(store.has(`moneygame_${prefix}_token`), false);
    assert.equal(store.has(`moneygame_${prefix}_refresh_token`), false);
  });
  test(`${app}: login is available even when an old session has expired`, async () => {
    let refreshes = 0;
    const { api } = client(app, async url => {
      if (url.endsWith('/refresh-token')) { refreshes++; return response(401, { error: 'Revoked' }); }
      return response(200, { user: { id: 'new-user' }, tokens: { accessToken: jwt(Date.now() / 1000 + 900), refreshToken: 'new-login' } });
    });
    await api.login('new-user', 'new-password');
    assert.equal(refreshes, 0); assert(api.getToken());
  });
  test(`${app}: a pending refresh cannot undo logout`, async () => {
    let release;
    const { api } = client(app, async () => { await new Promise(resolve => release = resolve); return response(200, { accessToken: jwt(Date.now() / 1000 + 900), refreshToken: 'refresh-new' }); });
    const pending = api.getValidToken();
    api.setToken(null); release();
    assert.equal(await pending, null); assert.equal(api.getToken(), null);
  });
}
