import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/frontend/api.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { api, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const disconnected = 'Không kết nối được máy chủ Trozy. Vui lòng thử lại sau hoặc kiểm tra máy chủ ứng dụng.';

test('frontend API safely distinguishes gateway failures, server messages, invalid data and cancellation', async t => {
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  await t.test('empty Vite proxy 500 and HTML gateway failures explain the connection problem', async () => {
    for (const [status, body] of [[500, ''], [502, '<html>proxy internal path C:/private</html>'], [503, 'upstream unavailable'], [504, 'gateway timeout']]) {
      globalThis.fetch = async () => new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
      await assert.rejects(api('/meter/submissions/photo/automatic?fileId=image'), error => error instanceof ApiError && error.status === status && error.message === disconnected && !error.message.includes('private'));
    }
  });

  await t.test('JSON application errors keep their specific message and HTTP status', async () => {
    for (const status of [401, 409, 500]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Bộ ảnh đã thay đổi. Hãy tải lại dữ liệu.' }), { status, headers: { 'Content-Type': 'application/json' } });
      await assert.rejects(api('/meter/submissions/photo/automatic'), error => error instanceof ApiError && error.status === status && error.message === 'Bộ ảnh đã thay đổi. Hãy tải lại dữ liệu.');
    }
  });

  await t.test('missing routes and malformed error objects have safe status-specific fallbacks', async () => {
    globalThis.fetch = async () => new Response('<html>route missing</html>', { status: 404 });
    await assert.rejects(api('/missing'), error => error.status === 404 && error.message.includes('Không tìm thấy API') && !error.message.includes('<html>'));
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { internal: 'secret' } }), { status: 503 });
    await assert.rejects(api('/missing'), error => error.status === 503 && error.message === 'Máy chủ Trozy chưa xử lý được yêu cầu. Vui lòng thử lại.');
    globalThis.fetch = async () => new Response('null', { status: 401 });
    await assert.rejects(api('/missing'), error => error.status === 401 && error.message.includes('đăng nhập lại'));
  });

  await t.test('network failures use the same connection message without exposing diagnostics', async () => {
    globalThis.fetch = async () => { throw new TypeError('ECONNREFUSED private upstream'); };
    await assert.rejects(api('/meter/submissions/photo/automatic'), error => error instanceof ApiError && error.status === 0 && error.message === disconnected);
  });

  await t.test('malformed successful responses fail explicitly while valid JSON and request options are preserved', async () => {
    globalThis.fetch = async () => new Response('<html>frontend document</html>', { status: 200 });
    await assert.rejects(api('/meter/submissions/photo/automatic'), error => error instanceof ApiError && error.status === 200 && error.message.includes('dữ liệu không hợp lệ'));
    const signal = new AbortController().signal;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/meter/profile'); assert.equal(options.method, 'PUT'); assert.equal(options.signal, signal); assert.equal(options.credentials, 'same-origin');
      assert.equal(options.body, '{"confirmed":true}');
      return new Response('{"profile":null}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    assert.deepEqual(await api('/meter/profile', { method: 'PUT', signal, body: '{"confirmed":true}' }), { profile: null });
  });

  await t.test('abort errors during fetch or body parsing are returned unchanged', async () => {
    const controller = new AbortController(), abort = new DOMException('Cancelled', 'AbortError'); controller.abort();
    globalThis.fetch = async () => { throw abort; };
    await assert.rejects(api('/meter/profile', { signal: controller.signal }), error => error === abort);
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw abort; } });
    await assert.rejects(api('/meter/profile'), error => error === abort);
  });
});
