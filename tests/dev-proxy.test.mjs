import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { createLogger, createServer as createViteServer } from 'vite';
import ts from 'typescript';
import picomatch from 'picomatch';
import { devApiTarget } from '../scripts/dev-api.mjs';
import { projectDirectory, projectRoot, runtimeRoot } from '../src/shared/project-paths.mjs';

const source = readFileSync(new URL('../src/frontend/api.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { api, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const unavailable = 'Máy chủ API Trozy chưa sẵn sàng. Hãy kiểm tra cửa sổ đang chạy npm run dev rồi thử lại.';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server.address().port); });
  });
}
async function close(server) {
  if (!server?.listening) return;
  const completion = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  server.closeAllConnections();
  await completion;
}

test('real Vite proxy uses the configured API port, preserves JSON/auth and explains an unavailable upstream to the frontend', { timeout: 30000 }, async t => {
  const temporaryParent = projectDirectory(join(runtimeRoot, 'tmp'));
  assert(temporaryParent, 'The isolated fixture must stay inside the project');
  mkdirSync(temporaryParent, { recursive: true });
  const directory = mkdtempSync(join(temporaryParent, 'dev-proxy-'));
  const privateFixtures=['.runtime','.cache','data','tmp'].map(name=>({name,path:join(directory,name,'fixture-only.txt')}));
  for(const fixture of privateFixtures){mkdirSync(dirname(fixture.path),{recursive:true});writeFileSync(fixture.path,`private-${fixture.name}-fixture`);}
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Isolated Trozy proxy check</title>');
  const requests = [], health = { ok: true, database: 'sqlite', version: 'isolated-proxy-test' };
  const authenticated = { user: { id: 'isolated-owner', role: 'landlord' } };
  const denied = { error: 'Phiên đăng nhập kiểm thử đã hết hạn.' };
  const upstream = createHttpServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    requests.push({ path: request.url, method: request.method, cookie: request.headers.cookie, type: request.headers['content-type'], body });
    const send = (status, value, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); response.end(JSON.stringify(value)); };
    if (request.url === '/api/health' && request.method === 'GET') return send(200, health);
    if (request.url === '/api/auth/login' && request.method === 'POST') return send(200, authenticated, { 'Set-Cookie': 'trozy_session=isolated-cookie; HttpOnly; SameSite=Lax; Path=/' });
    if (request.url === '/api/auth/me' && request.method === 'GET') return send(401, denied);
    send(404, { error: 'Isolated fixture route missing.' });
  });
  let vite;
  const savedEnv = { HOST: process.env.HOST, PORT: process.env.PORT }, realFetch = globalThis.fetch;
  const restoreEnv = () => { for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
  t.after(async () => {
    globalThis.fetch = realFetch; restoreEnv();
    try { await vite?.close(); } finally {
      await close(upstream);
      // Check the exact task-created absolute path before recursive cleanup.
      const target = resolve(directory), parent = realpathSync(temporaryParent);
      assert.equal(realpathSync(dirname(target)), parent); assert(basename(target).startsWith('dev-proxy-'));
      assert(target.startsWith(resolve(temporaryParent) + sep)); assert.equal(projectDirectory(target), target);
      assert(!relative(projectRoot, target).startsWith('..' + sep));
      rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
  const port = await listen(upstream);
  process.env.HOST = '0.0.0.0'; process.env.PORT = String(port);
  const target = devApiTarget();
  assert.equal(target, `http://127.0.0.1:${port}`);
  try {
    vite = await createViteServer({
      configFile: join(projectRoot, 'vite.config.ts'), root: directory, cacheDir: join(directory, 'vite-cache'),
      customLogger: createLogger('silent'),
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, ws: false },
    });
  } finally { restoreEnv(); }
  assert.equal(vite.config.server.proxy['/api'].target, target, 'The actual config must follow HOST/PORT rather than a fixed API port');
  await vite.listen();
  const web = `http://127.0.0.1:${vite.httpServer.address().port}`;

  await t.test('private runtime, cache, business and temp trees are ignored before watching and denied over HTTP',async()=>{
    const ignored=picomatch(vite.config.server.watch.ignored,{dot:true,nocase:true});
    for(const name of ['.runtime','.cache','data','tmp']){
      const root=resolve(projectRoot,name).replaceAll('\\','/');assert.equal(ignored(root),true);assert.equal(ignored(`${root}/nested/THIRD-PARTY-NOTICES.md`),true);
      assert(vite.config.server.fs.deny.includes(`**/${name}`));assert(vite.config.server.fs.deny.includes(`**/${name}/**`));
    }
    assert.equal(ignored(resolve(projectRoot,'src/frontend/App.tsx').replaceAll('\\','/')),false);
    for(const defaultRule of ['.env','.env.*','*.{crt,pem}','**/.git/**'])assert(vite.config.server.fs.deny.includes(defaultRule),'Vite default deny rules must remain intact');
    for(const fixture of privateFixtures){
      const response=await realFetch(`${web}/${fixture.name}/fixture-only.txt`);assert.equal(response.status,403);assert.ok(!(await response.text()).includes(`private-${fixture.name}-fixture`));
      const absolute=fixture.path.replaceAll('\\','/'),direct=await realFetch(`${web}/@fs/${absolute}`);assert.equal(direct.status,403);assert.ok(!(await direct.text()).includes(`private-${fixture.name}-fixture`));
    }
    const publicPath=join(projectRoot,'src/frontend/api.ts').replaceAll('\\','/'),publicSource=await realFetch(`${web}/@fs/${publicPath}`);assert.equal(publicSource.status,200);assert.match(await publicSource.text(),/ApiError/);
  });

  await t.test('health and authenticated application responses retain status, JSON, request body and cookies', async () => {
    const healthy = await realFetch(`${web}/api/health`);
    assert.equal(healthy.status, 200); assert.match(healthy.headers.get('content-type'), /^application\/json/); assert.deepEqual(await healthy.json(), health);
    const body = JSON.stringify({ email: 'isolated@example.invalid', password: 'fixture-only' });
    const login = await realFetch(`${web}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'fixture_nonce=before-login' }, body });
    assert.equal(login.status, 200); assert.deepEqual(await login.json(), authenticated); assert.equal(login.headers.get('set-cookie'), 'trozy_session=isolated-cookie; HttpOnly; SameSite=Lax; Path=/');
    assert.deepEqual(requests[1], { path: '/api/auth/login', method: 'POST', cookie: 'fixture_nonce=before-login', type: 'application/json', body });
    const expired = await realFetch(`${web}/api/auth/me`, { headers: { Cookie: 'trozy_session=isolated-cookie' } });
    assert.equal(expired.status, 401); assert.deepEqual(await expired.json(), denied); assert.equal(requests[2].cookie, 'trozy_session=isolated-cookie');
  });

  await close(upstream);
  await t.test('a stopped upstream produces bounded JSON 503 instead of an empty Vite 500', async () => {
    const response = await realFetch(`${web}/api/health`);
    assert.equal(response.status, 503); assert.match(response.headers.get('content-type'), /^application\/json(?:;|$)/); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: unavailable }); assert.equal(requests.length, 3);
  });

  await t.test('the frontend API surfaces the proxy recovery message and HTTP status through a real request', async () => {
    globalThis.fetch = (url, options) => realFetch(new URL(url, web), options);
    try {
      await assert.rejects(api('/meter/submissions/isolated/automatic?fileId=fixture'), error => error instanceof ApiError && error.status === 503 && error.message === unavailable);
      assert.equal(requests.length, 3, 'An offline proxy must never send requests to another live backend');
    } finally { globalThis.fetch = realFetch; }
  });
});
