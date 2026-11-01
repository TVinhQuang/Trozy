import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename, sep } from 'node:path';
import { createApp } from '../src/backend/server.mjs';

// Isolated build-shaped fixtures let npm test run before npm run build.
// No browser process, live application DB or generated dist is needed here.
async function fixture(t) {
  const temporaryParent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(temporaryParent, 'trozy-static-'));
  const distPath = join(directory, 'dist');
  mkdirSync(join(distPath, 'assets'), { recursive: true });
  mkdirSync(join(directory, 'src', 'backend'), { recursive: true });
  writeFileSync(join(directory, 'src', 'backend', 'server.mjs'), 'PRIVATE_SERVER_SOURCE_MARKER');
  writeFileSync(join(directory, 'server-private.mjs'), 'PRIVATE_SERVER_SOURCE_MARKER');
  writeFileSync(join(directory, '.env'), 'PRIVATE_ENV_MARKER=not-a-real-secret');
  writeFileSync(join(distPath, 'index.html'), '<!doctype html><html lang="vi"><head><title>Trozy static fixture</title><link rel="stylesheet" href="/assets/app-123.css"></head><body><div id="root"></div><script type="module" src="/assets/app-123.js"></script></body></html>');
  writeFileSync(join(distPath, 'assets', 'app-123.js'), 'import { label } from "./chunk-123.js"; document.querySelector("#root").textContent = label;');
  writeFileSync(join(distPath, 'assets', 'chunk-123.js'), 'export const label = "Trozy";');
  writeFileSync(join(distPath, 'assets', 'app-123.css'), 'body { color: #172033; }');
  writeFileSync(join(distPath, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>');
  const app = createApp({ dbPath: ':memory:', seed: false, distPath });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  t.after(async () => {
    app.server.closeAllConnections();
    await app.close();
    const target = resolve(directory);
    // Verify the exact resolved target before any recursive cleanup on Windows.
    assert.equal(dirname(target), temporaryParent);
    assert(basename(target).startsWith('trozy-static-'));
    assert(target.startsWith(temporaryParent + sep));
    rmSync(target, { recursive: true, force: true });
  });
  const http = (path, method = 'GET') => new Promise((resolve, reject) => {
    // Raw request paths deliberately avoid fetch/URL normalizing traversal cases.
    const req = request({ hostname: '127.0.0.1', port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
  return { http };
}

test('production static handler serves SPA entry, CSS and reachable module chunks with proper MIME/cache', async t => {
  const { http } = await fixture(t);
  const index = await http('/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'], /^text\/html/);
  assert.equal(index.headers['cache-control'], 'no-cache');
  const modulePath = index.body.match(/<script type="module" src="([^"]+)"/)?.[1];
  const stylePath = index.body.match(/rel="stylesheet" href="([^"]+)"/)?.[1];
  assert(modulePath && stylePath, 'HTML must refer to a module entry and stylesheet.');
  const script = await http(modulePath);
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /^text\/javascript/);
  assert.match(script.headers['cache-control'], /max-age=31536000.*immutable/);
  const childModule = script.body.match(/from "\.\/([^"]+)"/)?.[1];
  assert(childModule);
  const chunk = await http(`/assets/${childModule}`);
  assert.equal(chunk.status, 200);
  assert.match(chunk.body, /export const label/);
  const stylesheet = await http(stylePath);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers['content-type'], /^text\/css/);
  assert.match(stylesheet.headers['cache-control'], /immutable/);
  const icon = await http('/favicon.svg');
  assert.equal(icon.status, 200);
  assert.equal(icon.headers['content-type'], 'image/svg+xml');
  const route = await http('/contracts/example?tab=history');
  assert.equal(route.status, 200);
  assert.equal(route.body, index.body, 'Client-side routes should receive the SPA entry.');
  const head = await http('/assets/app-123.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.match(head.headers['content-type'], /^text\/javascript/);
  assert.equal(head.body, '');
});

test('static and API responses keep security headers, private APIs require sessions and static writes are rejected', async t => {
  const { http } = await fixture(t);
  for (const path of ['/', '/assets/app-123.js', '/api/bootstrap']) {
    const response = await http(path);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.equal(response.headers['referrer-policy'], 'same-origin');
    assert.match(response.headers['content-security-policy'], /default-src 'self'/);
    assert.match(response.headers['content-security-policy'], /script-src 'self'/);
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  }
  const bootstrap = await http('/api/bootstrap');
  assert.equal(bootstrap.status, 401);
  assert.equal(bootstrap.headers['cache-control'], 'no-store');
  assert.match(bootstrap.headers['content-type'], /^application\/json/);
  assert(!bootstrap.body.includes('password_hash'));
  const write = await http('/assets/app-123.js', 'POST');
  assert.equal(write.status, 405);
  const unchanged = await http('/assets/app-123.js');
  assert.equal(unchanged.status, 200);
  assert.match(unchanged.body, /import \{ label \}/);
});

test('static paths cannot expose backend source, sibling files or traversal targets', async t => {
  const { http } = await fixture(t);
  for (const path of [
    '/src/backend/server.mjs',
    '/server-private.mjs',
    '/../server-private.mjs',
    '/%2e%2e%2fserver-private.mjs',
    '/%2e%2e%5cserver-private.mjs',
    '/assets/%2e%2e%2f%2e%2e%2fserver-private.mjs',
    '/assets/%252e%252e/%252e%252e/server-private.mjs',
    '/assets/missing.js',
  ]) {
    const response = await http(path);
    assert([403, 404].includes(response.status), `${path} unexpectedly returned ${response.status}.`);
    assert(!response.body.includes('PRIVATE_SERVER_SOURCE_MARKER'));
    assert(!response.body.includes('PRIVATE_ENV_MARKER'));
  }
  const environment = await http('/.env');
  assert(!environment.body.includes('PRIVATE_ENV_MARKER'), 'SPA fallback must never read the sibling .env file.');
});

test('malformed URL encoding is a client error rather than an internal server error', async t => {
  const { http } = await fixture(t);
  const response = await http('/assets/app%ZZ.js');
  assert.equal(response.status, 400);
  assert(!response.body.includes('URIError'));
  assert(!response.body.includes('server.mjs'));
});
