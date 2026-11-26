import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { createApp } from '../src/backend/server.mjs';

test('the phone home-screen entry starts at the root and serves Android and Apple icons', async t => {
  const app = createApp({ dbPath: ':memory:', seed: false, distPath: 'public' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const { document } = new JSDOM(html, { url: origin + '/?action=activate&token=example' }).window;
  const manifestLink = document.querySelector('link[rel="manifest"]');
  assert.ok(manifestLink, 'the entry page must advertise the web app manifest');
  const response = await fetch(manifestLink.href);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/manifest\+json/);
  const manifest = await response.json();
  assert.equal(manifest.name, 'Trozy');
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');

  async function checkIcon(url, size) {
    const icon = await fetch(url);
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');
    const meta = await sharp(Buffer.from(await icon.arrayBuffer())).metadata();
    assert.deepEqual([meta.width, meta.height, meta.format], [size, size, 'png']);
  }
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === size + 'x' + size && (!icon.purpose || icon.purpose.split(' ').includes('any')));
    assert.ok(icon, 'missing launcher icon at size ' + size);
    await checkIcon(new URL(icon.src, response.url), size);
  }
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  assert.ok(appleIcon, 'Safari should use the Trozy home-screen icon');
  await checkIcon(appleIcon.href, 180);
});
