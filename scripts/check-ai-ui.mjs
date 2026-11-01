// React interaction checks in an in-memory DOM. This does not start/control a browser.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer as createVite } from 'vite';
import { openStore, safeUser } from '../src/backend/db.mjs';
import { seedDemo } from '../src/backend/seed.mjs';
import { dataFor } from '../src/backend/domain.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:5173/', pretendToBeVisual: true });
const previous = new Map();
function install(name, value) { previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); }
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'MouseEvent', 'File', 'FileReader', 'FormData', 'MutationObserver']) install(name, name === 'window' ? dom.window : name === 'document' ? dom.window.document : dom.window[name]);
install('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
install('requestAnimationFrame', callback => setTimeout(() => callback(Date.now()), 0));
install('cancelAnimationFrame', clearTimeout);
install('IS_REACT_ACT_ENVIRONMENT', true);
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
URL.createObjectURL = () => 'blob:trozy-in-memory-meter'; URL.revokeObjectURL = () => {};
const nativeFetch = globalThis.fetch;
const store = openStore(':memory:'); seedDemo(store);
const rawUser = store.db.prepare('SELECT * FROM users WHERE email=?').get('chu@trozy.vn');
const user = safeUser(rawUser), data = dataFor(store, rawUser);
const vite = await createVite({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { createElement: h } = await import('react');
const { render, screen, fireEvent, waitFor, cleanup, act, within, configure } = await import('@testing-library/react');
// FileReader and Vite share the machine with local model checks; allow actual async work to settle.
configure({ asyncUtilTimeout: 5000 });
const { AppContext } = await vite.ssrLoadModule('/src/frontend/context.tsx');
const { AIStatusPanel } = await vite.ssrLoadModule('/src/frontend/ai-ui.tsx');
const { MeterCamera } = await vite.ssrLoadModule('/src/frontend/meter-camera.tsx');
const { MeterEvidenceCapture } = await vite.ssrLoadModule('/src/frontend/meter-evidence-capture.tsx');
const { MeterSubmissionReview, MeterSubmissionsPanel, OwnerMeterEvidenceEntry } = await vite.ssrLoadModule('/src/frontend/meter-submissions-panel.tsx');
const { MeterReaderPanel } = await vite.ssrLoadModule('/src/frontend/meter-reader-panel.tsx');
const { MeterAutomaticPanel } = await vite.ssrLoadModule('/src/frontend/meter-automatic-panel.tsx');
const { cameraReadiness, cameraMotion, cameraCounterRectangle, emptyCameraReadiness } = await vite.ssrLoadModule('/src/frontend/meter-capture-quality.ts');
const { useMeterOwnerUpdates } = await vite.ssrLoadModule('/src/frontend/meter-owner-updates.ts');
const { AssistantPage } = await vite.ssrLoadModule('/src/frontend/pages/Assistant.tsx');
const { OperationsPages } = await vite.ssrLoadModule('/src/frontend/pages/Operations.tsx');
let checks = 0;
function pass(message) { checks++; console.log(`PASS ${message}`); }
function context(page = 'assistant') {
  const mutations = [], actions = [], notifications = [], navigation = [];
  const value = { user, data, bootstrap: { user, data, capabilities: { B01: true, B02: true, B03: false, B04: true, B05: false } }, propertyId: 'property_01', page, setPropertyId() {}, navigate(value) { navigation.push(value); }, refresh: async () => {}, notify(...args) { notifications.push(args); }, mutate: async (...args) => { mutations.push(args); return { id: 'in-memory-record', ...args[1] }; }, action: async (...args) => { actions.push(args); return {}; }, remove: async () => {} };
  return { value, mutations, actions, notifications, navigation };
}
function mount(Component, props, fixture) { return render(h(AppContext.Provider, { value: fixture.value }, h(Component, props))); }
function mockAPI(handler) {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url), body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ path, method: options.method || 'GET', body });
    const result = await handler(path, body, options);
    if (result === undefined) throw Error(`Unexpected mocked request: ${path}`);
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return requests;
}
const status = { provider: 'ollama', available: false, model: 'qwen3:4b-instruct', modelInstalled: false, models: [], message: 'Ollama chưa chạy; tra cứu cục bộ vẫn dùng được.' };
const localResult = answer => ({ feature: 'B01', engine: 'local', answer, sources: [], suggestions: [], warnings: [] });
const technicalQuality = { version: 1, status: 'pass', canSubmit: true, scope: 'counter', checks: { resolution: true, exposure: true, contrast: true, sharpness: true, glare: true }, reasons: [], metrics: { width: 500, height: 100, meanLuma: 130, contrast: 60, edgeEnergy: 100, clippedDark: 0, clippedLight: 0, glareFraction: 0 } };
const readerStatus = { available: true, readerAvailable: true, locatorAvailable: true, engine: 'paddleocr', model: 'paddleocr-ppocrv6', message: 'Bộ đọc OCR công tơ điện cục bộ sẵn sàng.' };
const readerSubmission = () => ({ id: 'guided-review', version: 3, propertyId: 'property_01', roomId: 'room_101', utility: 'electric', period: '2026-11', status: 'pending', selectedFileId: 'guided-photo-1', photos: [{ fileId: 'guided-photo-1' }, { fileId: 'guided-photo-2' }] });
function readyReaderProposal(input = {}, changes = {}) {
  const corners = input.corners || [[.1, .2], [.8, .2], [.8, .4], [.1, .4]];
  return { id: 'reader-proposal-1', fileId: input.fileId || 'guided-photo-1', submissionVersion: input.version || 3, status: 'ready', engine: 'paddleocr', model: 'paddleocr-ppocrv6', reading: { digits: '007664', displayText: '00766.4', integerDigits: '00766', fractionalDigits: '4', integerValue: 766, unit: 'kWh' }, confidence: .95, cells: [], ocrEvidence: { scope: 'owner-region', observations: [{ text: '00766.4', confidence: .96, corners, pass: 'region' }, { text: '00766.4', confidence: .95, corners, pass: 'crop' }], selectedObservationIndices: [0, 1], agreement: true }, warnings: [], expiresAt: new Date(Date.now() + 600000).toISOString(), config: { digits: input.digits || 6, decimals: input.decimals ?? 1, corners }, ...changes };
}
const confirmedProfile = { id: 'meter-profile-ui', roomId: 'room_101', utility: 'electric', digits: 6, decimals: 1, meterType: 'mechanical', confirmed: true, reader: 'meter-reader-v3', engine: 'paddleocr', version: 2 };
function automaticResult(submission = readerSubmission(), changes = {}) {
  const fileId = submission.selectedFileId || submission.photos[0].fileId;
  return { status: 'unavailable', proposal: null, reason: 'Tạm dùng xác minh thủ công.', profile: { ...confirmedProfile, utility: submission.utility, engine: submission.utility === 'electric' ? 'paddleocr' : 'visionstate' }, fileId, submissionVersion: submission.version, ...changes };
}
function automaticReady(submission = readerSubmission(), changes = {}) {
  const result = automaticResult(submission);
  const proposal = readyReaderProposal({ fileId: result.fileId, version: result.submissionVersion }, { profileSource: 'confirmed', profileVersion: confirmedProfile.version, configNeedsConfirmation: false });
  proposal.ocrEvidence.scope = 'automatic'; proposal.ocrEvidence.observations[0].pass = 'full';
  if (submission.utility === 'water') {
    proposal.engine = 'visionstate'; proposal.model = 'wheels-v2'; proposal.reading = { ...proposal.reading, unit: 'm3' }; delete proposal.ocrEvidence;
    proposal.cells = Array.from({ length: proposal.config.digits }, (_, index) => ({ index, position: Number(proposal.reading.digits[index]), confidence: .95, alternatives: [] }));
  }
  return { ...result, status: 'ready', reason: '', proposal, ...changes };
}
async function loadReaderPreview() {
  const image = await waitFor(() => { const image = [...document.querySelectorAll('img')].find(item => item.getAttribute('src')?.includes('/image/')); assert(image, 'The reader must show the server-normalized preview'); return image; });
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: 1000 }, naturalHeight: { configurable: true, value: 700 } });
  fireEvent.load(image);
  return image;
}
async function configureReader() {
  await screen.findByLabelText('Số ô số trên hàng chỉ số'); await loadReaderPreview();
  fireEvent.change(screen.getByLabelText('Số ô số trên hàng chỉ số'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('Số chữ số phần lẻ'), { target: { value: '1' } });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Góc 1 của vùng số; dùng phím mũi tên để di chuyển' }), { key: 'ArrowRight' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đã chọn đúng toàn bộ hàng số theo thứ tự đọc' }));
  const read = screen.getByRole('button', { name: 'Đọc vùng đã chọn' }); assert.equal(read.disabled, false); return read;
}
function automaticClock() {
  const savedTimeout = globalThis.setTimeout, savedClear = globalThis.clearTimeout, timers = new Map(); let next = 100000;
  globalThis.setTimeout = (callback, delay, ...args) => { if (delay !== 2500 && delay !== 15000) return savedTimeout(callback, delay, ...args); const id = ++next; timers.set(id, { delay, callback: () => callback(...args) }); return id; };
  globalThis.clearTimeout = id => { if (timers.has(id)) timers.delete(id); else savedClear(id); };
  return { timers, async tick(delay) { await act(async () => { const selected = [...timers].filter(([, timer]) => delay === undefined || timer.delay === delay); selected.forEach(([id]) => timers.delete(id)); selected.forEach(([, timer]) => timer.callback()); await new Promise(resolve => savedTimeout(resolve, 0)); }); }, restore() { globalThis.setTimeout = savedTimeout; globalThis.clearTimeout = savedClear; } };
}

try {
  // Owner polling refreshes once initially, then only on visible revision changes.
  {
    const savedInterval = dom.window.setInterval, savedClear = dom.window.clearInterval, visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    const timers = new Map(); let nextTimer = 0, revision = 'a'.repeat(64), refreshes = 0, hidden = false, pendingResolve, pendingSignal;
    function Probe({ identity }) { useMeterOwnerUpdates(identity, async signal => { assert.equal(signal.aborted, false); refreshes++; }); return null; }
    const requests = mockAPI((path, body, options) => {
      assert.equal(path, '/api/meter/updates'); assert.equal(body, undefined);
      if (pendingResolve === 'defer') { pendingSignal = options.signal; return new Promise(resolve => { pendingResolve = resolve; }); }
      return { revision };
    });
    try {
      dom.window.setInterval = callback => { const id = ++nextTimer; timers.set(id, callback); return id; };
      dom.window.clearInterval = id => { timers.delete(id); };
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
      const fixture = context(), view = mount(Probe, { identity: { id: 'tenant-probe', role: 'tenant' } }, fixture);
      assert.equal(requests.length, 0); assert.equal(timers.size, 0);
      view.rerender(h(AppContext.Provider, { value: fixture.value }, h(Probe, { identity: { id: 'owner-probe', role: 'landlord' } })));
      await waitFor(() => assert.equal(refreshes, 1)); assert.equal(timers.size, 1);
      async function tick() { await act(async () => { for (const callback of [...timers.values()]) callback(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
      await tick(); assert.equal(refreshes, 1);
      revision = 'b'.repeat(64); await tick(); assert.equal(refreshes, 2);
      hidden = true; fireEvent(document, new Event('visibilitychange')); assert.equal(timers.size, 0); const before = requests.length;
      await tick(); assert.equal(requests.length, before);
      revision = 'c'.repeat(64); hidden = false; fireEvent(document, new Event('visibilitychange')); await waitFor(() => assert.equal(refreshes, 3));
      pendingResolve = 'defer'; await tick(); assert.equal(typeof pendingResolve, 'function');
      view.rerender(h(AppContext.Provider, { value: fixture.value }, h(Probe, { identity: { id: 'other-tenant', role: 'tenant' } })));
      assert.equal(pendingSignal.aborted, true); assert.equal(timers.size, 0);
      await act(async () => { pendingResolve({ revision: 'd'.repeat(64) }); await Promise.resolve(); }); assert.equal(refreshes, 3);
      let expiredRequests = 0; const normalFetch = globalThis.fetch;
      globalThis.fetch = async () => { expiredRequests++; return new Response(JSON.stringify({ error: 'Phiên đăng nhập đã hết hạn.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }); };
      view.rerender(h(AppContext.Provider, { value: fixture.value }, h(Probe, { identity: { id: 'expired-owner', role: 'landlord' } })));
      await waitFor(() => { assert.equal(expiredRequests, 1); assert.equal(timers.size, 0); }); assert.equal(refreshes, 3); globalThis.fetch = normalFetch;
      view.unmount();
      pass('Only a visible owner polls revisions; unchanged results avoid refresh, account changes abort pending work, expired sessions stop, and tenants never poll');
    } finally { cleanup(); dom.window.setInterval = savedInterval; dom.window.clearInterval = savedClear; if (visibility) Object.defineProperty(document, 'visibilityState', visibility); else delete document.visibilityState; }
  }

  {
    const fixture = context('notifications'), notice = { id: 'meter-ready-notice', propertyId: 'property_01', recipientUserId: user.id, meterSubmissionId: 'meter-submission-ready', title: 'Ảnh công tơ đã được đọc', body: 'Mở ảnh để xem xét và xác minh.', readBy: [], createdAt: '2026-10-28T10:00:00Z' };
    fixture.value = { ...fixture.value, data: { ...data, notifications: [notice] } };
    const requests = mockAPI(() => assert.fail('Navigation must not read AI or mutate notifications implicitly'));
    mount(OperationsPages, { page: 'notifications' }, fixture);
    fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh công tơ' })); assert.deepEqual(fixture.navigation, ['readings']); assert.equal(fixture.actions.length, 0); assert.equal(requests.length, 0);
    const article = screen.getByText(notice.title).closest('article'); fireEvent.click(within(article).getByRole('button', { name: 'Đánh dấu đã đọc' }));
    await waitFor(() => assert.equal(fixture.actions.length, 1)); assert.deepEqual(fixture.actions[0], ['notification-read', { id: notice.id }]); cleanup();
    const tenantRaw = store.db.prepare('SELECT * FROM users WHERE email=?').get('thue@trozy.vn'), tenantFixture = context('notifications');
    tenantFixture.value = { ...tenantFixture.value, user: safeUser(tenantRaw), data: { ...dataFor(store, tenantRaw), notifications: [notice] } };
    mount(OperationsPages, { page: 'notifications' }, tenantFixture);
    assert.equal(screen.queryByText(notice.title), null); assert.equal(screen.queryByRole('button', { name: 'Xem ảnh công tơ' }), null);
    pass('An owner meter notification opens the readings page without implicit marking, while explicit marking and recipient filtering stay separate'); cleanup();
  }

  // The live gate requires both technical quality and consecutive steady frames.
  {
    let state = emptyCameraReadiness();
    for (const time of [1000, 1250, 1500]) state = cameraReadiness(state, technicalQuality, 0, time);
    assert.equal(state.ready, false); state = cameraReadiness(state, technicalQuality, 0, 1750); assert.equal(state.ready, true);
    assert.equal(cameraReadiness(state, technicalQuality, 20, 2000).ready, false);
    assert.equal(cameraReadiness(state, { ...technicalQuality, status: 'retake' }, 0, 2000).ready, false);
    assert.equal(cameraMotion(null, [1, 2]), Infinity); assert.equal(cameraMotion([5, 10], [6, 13]), 2);
    const rect = cameraCounterRectangle(1080, 1920, .85, .95); assert(rect.left >= 0 && rect.top >= 0 && rect.left + rect.width <= 1080 && rect.top + rect.height <= 1920);
    pass('Camera readiness resets on motion or bad quality and requires four steady passing frames over 750 ms');
  }

  // Camera access is explicit; denied/unsupported access keeps the gallery available.
  {
    const originalMedia = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    try {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
      mount(MeterCamera, { onCapture() { assert.fail('Unsupported camera cannot capture'); } }, context('readings'));
      fireEvent.click(screen.getByRole('button', { name: 'Mở camera để chụp' }));
      await screen.findByText(/Camera trong web cần HTTPS hoặc localhost/);
      pass('Camera explains HTTPS or permission requirements without opening or uploading a photo'); cleanup();
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw Object.assign(Error('denied'), { name: 'NotAllowedError' }); } } });
      mount(MeterCamera, { onCapture() { assert.fail('Denied camera cannot capture'); } }, context('readings'));
      fireEvent.click(screen.getByRole('button', { name: 'Mở camera để chụp' }));
      await screen.findByText(/Chưa được cấp quyền camera/);
      pass('Denied camera access returns an actionable error and does not leave a capture control enabled'); cleanup();
      let resolvePermission, stops = 0;
      const track = { stop() { stops++; }, addEventListener() {} }, stream = { active: true, getTracks: () => [track], getVideoTracks: () => [track] };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise(resolve => { resolvePermission = resolve; }) } });
      const view = mount(MeterCamera, { onCapture() { assert.fail('Closed camera cannot capture'); } }, context('readings'));
      fireEvent.click(screen.getByRole('button', { name: 'Mở camera để chụp' })); view.unmount();
      await act(async () => { resolvePermission(stream); await Promise.resolve(); }); assert.equal(stops, 1);
      pass('A permission request resolving after unmount immediately stops every camera track'); cleanup();
    } finally { if (originalMedia) Object.defineProperty(navigator, 'mediaDevices', originalMedia); else delete navigator.mediaDevices; }
  }

  // Mock camera frames exercise the shutter gate and release lifecycle, without real hardware.
  {
    const saved = [], remember = (object, key, value) => { saved.push([object, key, Object.getOwnPropertyDescriptor(object, key)]); Object.defineProperty(object, key, { configurable: true, writable: true, value }); };
    let blurry = true, stops = 0;
    const captures = [], track = { stop() { stops++; }, addEventListener() {} }, stream = { active: true, getTracks: () => [track], getVideoTracks: () => [track] };
    try {
      remember(navigator, 'mediaDevices', { getUserMedia: async () => stream });
      remember(document, 'visibilityState', 'visible');
      remember(dom.window.HTMLMediaElement.prototype, 'play', async () => {});
      remember(dom.window.HTMLMediaElement.prototype, 'readyState', 2);
      remember(dom.window.HTMLVideoElement.prototype, 'videoWidth', 960);
      remember(dom.window.HTMLVideoElement.prototype, 'videoHeight', 540);
      remember(dom.window.HTMLCanvasElement.prototype, 'getContext', () => ({ drawImage() {}, getImageData(x, y, width, height) { const data = new Uint8ClampedArray(width * height * 4); for (let i = 0; i < width * height; i++) { const value = blurry ? 128 : ((Math.floor(i / width / 8) + Math.floor(i % width / 8)) % 2 ? 65 : 190); data.set([value, value, value, 255], i * 4); } return { data, width, height }; } }));
      remember(dom.window.HTMLCanvasElement.prototype, 'toBlob', callback => callback(new dom.window.Blob([new Uint8Array([255, 216, 255, 224, 1])], { type: 'image/jpeg' })));
      mount(MeterCamera, { onCapture: (...args) => captures.push(args) }, context('readings'));
      fireEvent.click(screen.getByRole('button', { name: 'Mở camera để chụp' }));
      await screen.findByText(/Các nét số chưa tách rõ khỏi nền/);
      const shutter = screen.getByRole('button', { name: 'Chụp ảnh đủ nét' }); assert.equal(shutter.disabled, true); fireEvent.click(shutter); assert.equal(captures.length, 0);
      blurry = false;
      await waitFor(() => assert.equal(shutter.disabled, false), { timeout: 4000 }); fireEvent.click(shutter);
      await waitFor(() => assert.equal(captures.length, 1)); assert.equal(captures[0][0].type, 'image/jpeg');
      assert.deepEqual(captures[0][1], cameraCounterRectangle(960, 540, .5, .8));
      blurry = true;
      await screen.findByText(/Các nét số chưa tách rõ khỏi nền/); assert.equal(shutter.disabled, true); fireEvent.click(shutter); assert.equal(captures.length, 1);
      fireEvent.click(screen.getByRole('button', { name: 'Tắt camera' })); assert.equal(stops, 1);
      pass('The live shutter rejects unclear frames, enables after stable sharp frames, rechecks capture pixels and releases camera tracks'); cleanup();
    } finally { cleanup(); for (const [object, key, descriptor] of saved.reverse()) { if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key]; } }
  }

﻿  {
    const fixture = context('assistant');
    const requests = mockAPI(path => path === '/api/ai/status' ? status : undefined);
    mount(AIStatusPanel, {}, fixture);
    await screen.findByText('Tra cứu cục bộ sẵn sàng');
    assert.equal(requests.length, 1); assert(screen.getByText(status.model));
    assert.equal(screen.queryByText(/OCR|Vision|PaddleOCR/), null);
    pass('Assistant status reports text assistance independently of the guided meter reader'); cleanup();
  }

  {
    const fixture = context('readings'), updates = []; let uploads = 0;
    const requests = mockAPI((path, body) => {
      assert.equal(path, '/api/files'); assert.equal(body.roomId, 'room_101'); assert.equal(body.propertyId, 'property_01');
      return { id: `capture-file-${++uploads}` };
    });
    mount(MeterEvidenceCapture, { roomId: 'room_101', period: '2026-11', utility: 'electric', onChange: photos => updates.push(photos) }, fixture);
    fireEvent.change(screen.getByLabelText('Ảnh công tơ để gửi chủ nhà'), { target: { files: [1, 2, 3].map(index => new File([new Uint8Array([137, 80, 78, 71, index])], `capture-${index}.png`, { type: 'image/png' })) } });
    await waitFor(() => { assert.equal(uploads, 3); assert(updates.at(-1).every(photo => !photo.pending)); });
    assert.deepEqual(updates.at(-1).map(photo => photo.fileId), ['capture-file-1', 'capture-file-2', 'capture-file-3']);
    assert(updates.at(-1).every(photo => Object.keys(photo).every(key => ['fileId', 'pending'].includes(key))));
    assert.equal(requests.length, 3); assert.equal(screen.queryByRole('spinbutton'), null); assert.equal(screen.queryByRole('radio'), null);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa ảnh 1' })); assert.equal(updates.at(-1).length, 2); assert.equal(updates.at(-1)[1].fileId, 'capture-file-3');
    pass('Tenant capture uploads only original photos and removes one without changing the others'); cleanup();
  }

  {
    let resolveUpload, pendingSignal; const updates = [], fixture = context('readings');
    mockAPI((path, body, options) => { assert.equal(path, '/api/files'); pendingSignal = options.signal; return new Promise(resolve => { resolveUpload = resolve; }); });
    const props = { roomId: 'room_101', period: '2026-11', utility: 'electric', onChange: photos => updates.push(photos) };
    const view = mount(MeterEvidenceCapture, props, fixture);
    fireEvent.change(screen.getByLabelText('Ảnh công tơ để gửi chủ nhà'), { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], 'old.png', { type: 'image/png' })] } });
    await waitFor(() => assert.equal(typeof resolveUpload, 'function'));
    view.rerender(h(AppContext.Provider, { value: fixture.value }, h(MeterEvidenceCapture, { ...props, period: '2026-12' })));
    assert.equal(pendingSignal.aborted, true);
    await act(async () => { resolveUpload({ id: 'old-photo' }); await Promise.resolve(); });
    assert.deepEqual(updates.at(-1), []); assert.equal(screen.queryByLabelText('Ảnh công tơ 1'), null);
    pass('Changing the period cancels old uploads and clears the previous photo selection'); cleanup();
  }

  // A confirmed profile is saved once; later photos enter background recognition directly.
  {
    const fixture = context('readings'), submission = readerSubmission(), applied = []; let profileSaved = false, resolveProfile;
    const requests = mockAPI((path, body, options) => {
      if (path.startsWith('/api/meter/submissions/guided-review/automatic?')) {
        const fileId = new URL(path, dom.window.location.href).searchParams.get('fileId');
        return profileSaved ? automaticReady({ ...submission, selectedFileId: fileId }) : automaticResult(submission, { status: 'needs_setup', profile: null, reason: 'Cần cấu hình công tơ đã xác nhận.' });
      }
      if (path === '/api/meter/profile') {
        assert.equal(options.method, 'PUT'); assert.deepEqual(body, { roomId: 'room_101', utility: 'electric', digits: 6, decimals: 1, meterType: 'mechanical', confirmed: true });
        return new Promise(resolve => { resolveProfile = () => { profileSaved = true; resolve({ profile: confirmedProfile }); }; });
      }
      assert.equal(path, '/api/meter/submissions/guided-review/automatic/retry'); assert.equal(options.method, 'POST'); assert.equal(profileSaved, true); assert.deepEqual(body, { fileId: 'guided-photo-1', version: 3 }); return { queued: true };
    });
    const props = { submission, fileId: 'guided-photo-1', onApply: proposal => applied.push(proposal), onInvalidate() {} };
    const view = mount(MeterAutomaticPanel, props, fixture);
    await screen.findByText('Thiết lập công tơ một lần');
    const count = screen.getByLabelText('Số ô số trên hàng chỉ số (kể cả phần lẻ)'), fraction = screen.getByLabelText('Số chữ số phần lẻ theo kWh'), save = screen.getByRole('button', { name: 'Lưu thiết lập & đọc tự động' }), consent = screen.getByRole('checkbox', { name: 'Tôi đã kiểm tra số ô số và vị trí phần lẻ trên mặt công tơ' });
    assert.equal(count.value, ''); assert.equal(fraction.value, ''); assert.equal(consent.disabled, true); assert.equal(save.disabled, true); assert.equal(requests.length, 1);
    fireEvent.change(count, { target: { value: '6' } }); fireEvent.change(fraction, { target: { value: '1' } }); assert.equal(save.disabled, true);
    fireEvent.click(consent); assert.equal(save.disabled, false); fireEvent.change(fraction, { target: { value: '6' } }); assert.equal(consent.checked, false); assert.equal(consent.disabled, true); assert.equal(save.disabled, true);
    fireEvent.change(fraction, { target: { value: '1' } }); fireEvent.click(consent); fireEvent.click(save);
    await waitFor(() => assert.equal(typeof resolveProfile, 'function')); assert.equal(requests.length, 2); assert.equal(applied.length, 0);
    await act(async () => { resolveProfile(); await Promise.resolve(); }); await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' });
    assert.equal(screen.queryByLabelText('Số ô số trên hàng chỉ số (kể cả phần lẻ)'), null); assert.equal(applied.length, 0);
    assert.deepEqual(requests.map(request => request.method), ['GET', 'PUT', 'POST', 'GET']);
    view.rerender(h(AppContext.Provider, { value: fixture.value }, h(MeterAutomaticPanel, { ...props, fileId: 'guided-photo-2', submission: { ...submission, selectedFileId: 'guided-photo-2' } })));
    await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' });
    assert.equal(screen.queryByLabelText('Số ô số trên hàng chỉ số (kể cả phần lẻ)'), null); assert.equal(requests.filter(request => request.method === 'PUT').length, 1); assert.equal(requests.filter(request => /\/(locate|read)$/.test(request.path)).length, 0); assert.equal(applied.length, 0);
    pass('First-time setup requires explicit valid wheel/fraction counts and consent, saves before retry, then later photos reuse the profile without per-photo setup or crop/read clicks'); cleanup();
  }

  {
    const fixture = context('readings'), submission = readerSubmission(); let applied = 0, invalidated = 0;
    const requests = mockAPI((path, body) => {
      if (path.includes('/automatic?')) return automaticReady(submission);
      assert.equal(path, '/api/meter/submissions/guided-review/automatic/retry'); assert.deepEqual(body, { fileId: 'guided-photo-1', version: 3 });
      return new Response(JSON.stringify({ error: 'Runtime đang bận, hãy xác minh thủ công.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    });
    mount(MeterAutomaticPanel, { submission, fileId: 'guided-photo-1', onApply() { applied++; }, onInvalidate() { invalidated++; } }, fixture);
    await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' }); const before = invalidated;
    fireEvent.click(screen.getByRole('button', { name: 'Đọc tự động lại' })); await screen.findByRole('alert');
    assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); assert.equal(applied, 0); assert(invalidated > before); assert.equal(requests.length, 2);
    pass('Explicit retry invalidates the prior proposal immediately, and runtime failure preserves manual fallback without applying anything'); cleanup();
  }

  {
    const fixture = context('readings'), submission = readerSubmission(); let resolveProfile, signal, invalidated = 0, applied = 0;
    const requests = mockAPI((path, body, options) => {
      if (path.includes('/automatic?')) return automaticReady(submission);
      assert.equal(path, '/api/meter/profile'); assert.equal(body.version, confirmedProfile.version); signal = options.signal;
      return new Promise(resolve => { resolveProfile = resolve; });
    });
    const view = mount(MeterAutomaticPanel, { submission, fileId: 'guided-photo-1', onApply() { applied++; }, onInvalidate() { invalidated++; } }, fixture);
    await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi thiết lập công tơ' }));
    assert.equal(screen.getByRole('button', { name: 'Dùng chỉ số đề xuất' }).disabled, true); assert.equal(screen.getByLabelText('Số ô số trên hàng chỉ số (kể cả phần lẻ)').value, '6');
    fireEvent.change(screen.getByLabelText('Số chữ số phần lẻ theo kWh'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đã kiểm tra số ô số và vị trí phần lẻ trên mặt công tơ' })); const before = invalidated;
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thiết lập & đọc tự động' })); await waitFor(() => assert.equal(typeof resolveProfile, 'function'));
    assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); assert(invalidated > before);
    view.unmount(); assert.equal(signal.aborted, true); await act(async () => { resolveProfile({ profile: { ...confirmedProfile, decimals: 2, version: 3 } }); await Promise.resolve(); });
    assert.equal(requests.length, 2); assert.equal(applied, 0);
    pass('Changing a saved profile includes its version and invalidates proposals; closing during save aborts it and prevents a late retry'); cleanup();
  }

  {
    const fixture = context('readings'), submission = readerSubmission(), applied = [];
    for (const changes of [
      { fileId: 'another-photo' }, { submissionVersion: 2 },
      { proposal: readyReaderProposal({ fileId: 'another-photo' }) },
      { proposal: readyReaderProposal({}, { profileVersion: 1 }) },
      { profile: null }, { profile: { ...confirmedProfile, confirmed: false } },
      { profile: { ...confirmedProfile, roomId: 'another-room' } }, { profile: { ...confirmedProfile, utility: 'water' } },
      { profile: { ...confirmedProfile, reader: 'unknown-reader' } }, { profile: { ...confirmedProfile, engine: 'visionstate' } },
      { proposal: { ...automaticReady(submission).proposal, engine: 'visionstate', model: 'wheels-v2' } },
      { proposal: { ...automaticReady(submission).proposal, model: 'unknown-model' } },
      { proposal: { ...automaticReady(submission).proposal, ocrEvidence: readyReaderProposal().ocrEvidence } },
      { proposal: { ...automaticReady(submission).proposal, profileSource: 'observed' } },
      { proposal: { ...automaticReady(submission).proposal, configNeedsConfirmation: true } },
      { proposal: { ...automaticReady(submission).proposal, config: { ...automaticReady(submission).proposal.config, decimals: 2 } } },
    ]) {
      const requests = mockAPI(path => { assert(path.includes('/automatic?')); return automaticReady(submission, changes); });
      mount(MeterAutomaticPanel, { submission, fileId: 'guided-photo-1', onApply: proposal => applied.push(proposal), onInvalidate() {} }, fixture);
      await screen.findByRole('alert'); assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); assert.equal(requests.length, 1); cleanup();
    }
    assert.equal(applied.length, 0);
    pass('Automatic results must match the selected photo/version and an explicitly confirmed profile for the same room, utility and digit/fraction layout before Apply is offered');
    for (const result of [automaticReady(submission, { proposal: { ...automaticReady(submission).proposal, reading: null } }), automaticReady(submission, { proposal: { ...automaticReady(submission).proposal, expiresAt: new Date(Date.now() - 1000).toISOString() } }), automaticResult(submission, { status: 'needs_review' }), automaticResult(submission, { status: 'retake' }), automaticResult(submission, { status: 'unavailable' })]) {
      mockAPI(() => result); mount(MeterAutomaticPanel, { submission, fileId: 'guided-photo-1', onApply: proposal => applied.push(proposal), onInvalidate() {} }, fixture);
      await screen.findByRole('button', { name: 'Đọc tự động lại' }); assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); assert.equal(screen.queryByText(/^0(?:\s|$)/), null); assert.equal(screen.queryByRole('spinbutton'), null); cleanup();
    }
    assert.equal(applied.length, 0); pass('Empty, uncertain, expired, retake and unavailable automatic results offer fallback without a numeric zero or implicit Apply');
  }

  {
    const fixture = context('readings'), submission = readerSubmission(), applied = []; const clock = automaticClock();
    const visibility = Object.getOwnPropertyDescriptor(document, 'hidden'); let hidden = false, deferred = false; const pending = [];
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      const requests = mockAPI((path, body, options) => {
        assert(path.includes('/automatic?')); if (deferred) return new Promise(resolve => pending.push({ resolve, signal: options.signal }));
        return automaticResult(submission, { status: 'queued' });
      });
      const props = { submission, fileId: 'guided-photo-1', onApply: proposal => applied.push(proposal), onInvalidate() {} };
      const view = mount(MeterAutomaticPanel, props, fixture);
      await screen.findByText(/Ảnh đang chờ đọc tự động/); assert.equal(clock.timers.size, 1); assert.equal(requests.length, 1);
      deferred = true; await clock.tick(); assert.equal(pending.length, 1); hidden = true; fireEvent(document, new Event('visibilitychange')); assert.equal(pending[0].signal.aborted, true); assert.equal(clock.timers.size, 0);
      await act(async () => { pending[0].resolve(automaticReady(submission)); await Promise.resolve(); }); assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); await clock.tick(); assert.equal(requests.length, 2);
      hidden = false; fireEvent(document, new Event('visibilitychange')); await waitFor(() => assert.equal(pending.length, 2));
      view.rerender(h(AppContext.Provider, { value: fixture.value }, h(MeterAutomaticPanel, { ...props, fileId: 'guided-photo-2' })));
      assert.equal(pending[1].signal.aborted, true); await waitFor(() => assert.equal(pending.length, 3));
      await act(async () => { pending[1].resolve(automaticReady(submission)); await Promise.resolve(); }); assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null);
      const versionProps = { ...props, fileId: 'guided-photo-2', submission: { ...submission, version: 4, selectedFileId: 'guided-photo-2' } };
      view.rerender(h(AppContext.Provider, { value: fixture.value }, h(MeterAutomaticPanel, versionProps))); assert.equal(pending[2].signal.aborted, true); await waitFor(() => assert.equal(pending.length, 4));
      view.rerender(h(AppContext.Provider, { value: { ...fixture.value, user: { ...user, id: 'different-owner-ui' } } }, h(MeterAutomaticPanel, versionProps))); assert.equal(pending[3].signal.aborted, true); await waitFor(() => assert.equal(pending.length, 5));
      view.unmount(); assert.equal(pending[4].signal.aborted, true); assert.equal(clock.timers.size, 0);
      await act(async () => { pending.slice(2).forEach(item => item.resolve(automaticReady(submission))); await Promise.resolve(); }); assert.equal(applied.length, 0);
      pass('Automatic polling waits for visible owner context and aborts pending work on hidden tab, photo/version change, account switch or close, rejecting late results');
    } finally { cleanup(); clock.restore(); if (visibility) Object.defineProperty(document, 'hidden', visibility); else delete document.hidden; }
  }

  {
    const fixture = context('readings'), submission = readerSubmission(), clock = automaticClock();
    const visibility = Object.getOwnPropertyDescriptor(document, 'hidden'); let hidden = false, next = automaticReady(submission);
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      const requests = mockAPI(path => { assert(path.includes('/automatic?')); return next; });
      const view = mount(MeterSubmissionReview, { submission, onClose() {}, onSaved: async () => assert.fail('Polling cannot save a reading') }, fixture);
      fireEvent.click(await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' }));
      const value = screen.getByLabelText('Chỉ số điện xác minh (kWh, phần nguyên)'), imageConsent = screen.getByRole('checkbox', { name: 'Tôi đã đối chiếu từng ô số, đơn vị và cách chia phần nguyên/phần lẻ trên ảnh gốc' }), fractionConsent = screen.getByRole('checkbox', { name: 'Tôi đã kiểm tra phần lẻ và chỉ dùng phần nguyên để ghi chỉ số' }), approve = screen.getByRole('button', { name: 'Xác minh chỉ số này' });
      fireEvent.change(screen.getByLabelText(/Ghi chú xác minh hoặc lý do yêu cầu chụp lại/), { target: { value: 'Đã đối chiếu đầy đủ ảnh gốc và phần lẻ.' } }); fireEvent.click(imageConsent); fireEvent.click(fractionConsent);
      assert.equal(value.value, '766'); assert.equal(approve.disabled, false); assert.equal([...clock.timers.values()][0].delay, 15000);
      await clock.tick(15000); assert.equal(requests.length, 2); assert.equal(value.value, '766'); assert.equal(imageConsent.checked, true); assert.equal(fractionConsent.checked, true); assert.equal(approve.disabled, false);
      next = automaticReady(submission, { profile: { ...confirmedProfile, version: 3 }, proposal: { ...automaticReady(submission).proposal, profileVersion: 3 } });
      await clock.tick(15000);
      assert.equal(value.value, ''); assert.equal(imageConsent.checked, false); assert.equal(screen.queryByRole('checkbox', { name: 'Tôi đã kiểm tra phần lẻ và chỉ dùng phần nguyên để ghi chỉ số' }), null); assert.equal(approve.disabled, true); assert.equal([...clock.timers.values()][0].delay, 15000);
      fireEvent.click(screen.getByRole('button', { name: 'Dùng chỉ số đề xuất' })); assert.equal(value.value, '766');
      next = automaticResult(submission, { status: 'queued', profile: { ...confirmedProfile, version: 3 } });
      await clock.tick(15000); await screen.findByText(/Ảnh đang chờ đọc tự động/); assert.equal(value.value, ''); assert.equal([...clock.timers.values()][0].delay, 2500);
      next = automaticReady(submission, { profile: { ...confirmedProfile, version: 3 }, proposal: { ...automaticReady(submission).proposal, id: 'new-device-proposal', profileVersion: 3 } });
      await clock.tick(2500); await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' }); assert.equal(value.value, ''); assert.equal([...clock.timers.values()][0].delay, 15000);
      hidden = true; fireEvent(document, new Event('visibilitychange')); assert.equal(clock.timers.size, 0); const before = requests.length; await clock.tick(15000); assert.equal(requests.length, before);
      hidden = false; fireEvent(document, new Event('visibilitychange')); await waitFor(() => assert.equal(requests.length, before + 1)); assert.equal(clock.timers.size, 1);
      view.unmount(); assert.equal(clock.timers.size, 0); await clock.tick(15000); assert.equal(requests.length, before + 1); assert.equal(requests.every(request => request.method === 'GET'), true); assert.equal(fixture.mutations.length, 0); assert.equal(fixture.actions.length, 0);
      pass('Unchanged terminal polling retains the applied value and review consents; another device changing profile/job clears them, while hidden/closed reviews cancel the 15-second poll');
      next = automaticResult(submission, { status: 'needs_setup', profile: null });
      const setupView = mount(MeterAutomaticPanel, { submission, fileId: 'guided-photo-1', onApply() { assert.fail('External setup cannot apply a reading'); }, onInvalidate() {} }, fixture);
      await screen.findByText('Thiết lập công tơ một lần'); assert.equal([...clock.timers.values()][0].delay, 15000);
      next = automaticResult(submission, { status: 'queued' }); await clock.tick(15000); await screen.findByText(/Ảnh đang chờ đọc tự động/);
      assert.equal(screen.queryByLabelText('Số ô số trên hàng chỉ số (kể cả phần lẻ)'), null); assert.equal([...clock.timers.values()][0].delay, 2500); assert.equal(requests.every(request => request.method === 'GET'), true);
      setupView.unmount(); assert.equal(clock.timers.size, 0);
      pass('A waiting setup screen notices a profile saved on another device and resumes queued processing without local setup or retry writes');
    } finally { cleanup(); clock.restore(); if (visibility) Object.defineProperty(document, 'hidden', visibility); else delete document.hidden; }
  }

  {
    const fixture = context('readings'), submission = readerSubmission(), applied = [];
    const result = automaticReady(submission, { profile: { ...confirmedProfile, reader: 'visionstate-v2' } });
    assert.deepEqual(result.proposal.cells, []); assert.equal(result.proposal.ocrEvidence.observations.length, 2);
    const requests = mockAPI(path => { assert.equal(path, '/api/meter/submissions/guided-review/automatic?fileId=guided-photo-1'); return result; });
    mount(MeterAutomaticPanel, { submission, fileId: 'guided-photo-1', onApply: proposal => applied.push(proposal), onInvalidate() {} }, fixture);
    const apply = await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' });
    assert(screen.getByText(/Đọc dãy số điện bằng PaddleOCR/)); assert(screen.getByText('Ảnh toàn cảnh: 00766.4')); assert(screen.getByText('Vùng chỉ số: 00766.4'));
    assert.equal(screen.queryByText(/VisionState|xác suất bánh số|độ tin cậy từng bánh số/i), null); assert.equal(screen.queryByLabelText('Số ô số trên hàng chỉ số (kể cả phần lẻ)'), null);
    assert.equal(applied.length, 0); assert.equal(requests.length, 1); fireEvent.click(apply); assert.equal(applied.length, 1); assert.equal(applied[0].engine, 'paddleocr'); assert.deepEqual(applied[0].cells, []);
    assert.equal(fixture.mutations.length, 0); assert.equal(fixture.actions.length, 0);
    pass('Electric proposals use OCR text from full and crop observations without invented wheel confidences, retain a legacy confirmed layout and require explicit Apply'); cleanup();
  }

  {
    const fixture = context('readings'), submission = { ...readerSubmission(), utility: 'water' }, applied = [], result = automaticReady({ ...readerSubmission(), utility: 'water' });
    result.profile.reader = 'visionstate-v2'; assert.equal(result.proposal.cells.length, 6); assert.equal(result.proposal.ocrEvidence, undefined);
    const requests = mockAPI(() => result);
    mount(MeterAutomaticPanel, { submission, fileId: 'guided-photo-1', onApply: proposal => applied.push(proposal), onInvalidate() {} }, fixture);
    const apply = await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' });
    assert(screen.getByText(/Tìm vùng số nước bằng YOLO và đọc bánh số bằng VisionState/)); assert(screen.getByText('00766.4 m³'));
    assert.equal(screen.queryByText(/PaddleOCR/), null); assert.equal(screen.queryByText('Văn bản đã nhận dạng'), null); assert.equal(applied.length, 0); assert.equal(requests.length, 1);
    fireEvent.click(apply); assert.equal(applied[0].engine, 'visionstate'); assert.equal(applied[0].reading.unit, 'm3'); assert.equal(fixture.mutations.length, 0);
    pass('Water retains YOLO plus VisionState wheel evidence and confirmed layouts, uses m³ and never shows PaddleOCR observations'); cleanup();
  }

  {
    const fixture = context('readings'), submission = { ...readerSubmission(), utility: 'water' }, applied = [];
    const requests = mockAPI((path, body) => {
      if (path === '/api/meter/reader/status?utility=water') return { ...readerStatus, engine: 'visionstate', model: 'wheels-v2' };
      assert.equal(path, '/api/meter/submissions/guided-review/read'); assert.equal(body.digits, 6); assert.equal(body.decimals, 1); assert.equal(body.utility, undefined);
      return { proposal: { ...automaticReady(submission).proposal, config: { digits: body.digits, decimals: body.decimals, corners: body.corners } } };
    });
    mount(MeterReaderPanel, { submission, fileId: 'guided-photo-1', onApply: proposal => applied.push(proposal), onInvalidate() {} }, fixture);
    await screen.findByLabelText('Số bánh số'); await loadReaderPreview();
    assert.equal(screen.queryByLabelText('Số ô số trên hàng chỉ số'), null); assert.equal(screen.queryByText(/PaddleOCR/), null);
    fireEvent.change(screen.getByLabelText('Số bánh số'), { target: { value: '6' } }); fireEvent.change(screen.getByLabelText('Số chữ số phần lẻ'), { target: { value: '1' } });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Góc 1 của vùng số; dùng phím mũi tên để di chuyển' }), { key: 'ArrowRight' }); fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đã chọn đúng toàn bộ hàng số theo thứ tự đọc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đọc vùng đã chọn' })); const apply = await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' });
    assert.equal(requests.length, 2); assert.equal(requests[0].path, '/api/meter/reader/status?utility=water'); assert.equal(screen.queryByText('Văn bản đã nhận dạng'), null); assert.equal(applied.length, 0);
    fireEvent.click(apply); assert.equal(applied[0].engine, 'visionstate'); assert.equal(applied[0].reading.unit, 'm3');
    pass('Water manual fallback queries its own provider status and retains wheel-count, region and reading-direction confirmation before requesting VisionState'); cleanup();
  }

  {
    const fixture = context('readings'), submission = readerSubmission(), applied = []; let invalidated = 0;
    const requests = mockAPI((path, body) => {
      if (path === '/api/meter/reader/status?utility=electric') return readerStatus;
      assert.equal(path, '/api/meter/submissions/guided-review/read');
      assert.equal(body.fileId, 'guided-photo-1'); assert.equal(body.version, 3); assert.equal(body.digits, 6); assert.equal(body.decimals, 1); assert.equal(body.regionConfirmed, true);
      assert.equal(body.corners.length, 4); assert(body.corners.every(point => point.length === 2 && point.every(value => value >= 0 && value <= 1)));
      assert.equal(body.utility, undefined); assert.equal(body.previous, undefined);
      return { proposal: readyReaderProposal(body) };
    });
    mount(MeterReaderPanel, { submission, fileId: 'guided-photo-1', disabled: false, onApply: proposal => applied.push(proposal), onInvalidate: () => { invalidated++; } }, fixture);
    await screen.findByLabelText('Số ô số trên hàng chỉ số'); await loadReaderPreview();
    const read = screen.getByRole('button', { name: 'Đọc vùng đã chọn' }), confirm = screen.getByRole('checkbox', { name: 'Tôi đã chọn đúng toàn bộ hàng số theo thứ tự đọc' });
    assert.equal(read.disabled, true); assert.equal(screen.getByLabelText('Số ô số trên hàng chỉ số').value, ''); assert.equal(screen.getByLabelText('Số chữ số phần lẻ').value, '');
    fireEvent.change(screen.getByLabelText('Số ô số trên hàng chỉ số'), { target: { value: '6' } }); fireEvent.change(screen.getByLabelText('Số chữ số phần lẻ'), { target: { value: '1' } });
    assert.equal(confirm.disabled, true); assert.equal(requests.length, 1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Góc 1 của vùng số; dùng phím mũi tên để di chuyển' }), { key: 'ArrowRight' });
    assert.equal(confirm.disabled, false); assert.equal(read.disabled, true); fireEvent.click(confirm); assert.equal(read.disabled, false);
    assert.equal(requests.length, 1); fireEvent.click(read);
    const apply = await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' }); assert(screen.getByText('00766.4 kWh')); assert.equal(applied.length, 0); assert.equal(fixture.mutations.length, 0); assert.equal(fixture.actions.length, 0);
    assert(screen.getByText('Vùng đã chọn: 00766.4')); assert(screen.getByText('Vùng chỉ số: 00766.4')); assert.equal(screen.queryByText(/^Ảnh toàn cảnh:/), null);
    fireEvent.click(apply); assert.equal(applied.length, 1); assert.equal(applied[0].id, 'reader-proposal-1');
    assert.equal(applied[0].ocrEvidence.scope, 'owner-region'); assert.deepEqual(applied[0].ocrEvidence.observations.map(item => item.pass), ['region', 'crop']);
    pass('Manual electric OCR can use the chosen region and its crop without a full-photo observation; its labels preserve that scope and still require explicit Apply');
    const before = invalidated; fireEvent.change(screen.getByLabelText('Số ô số trên hàng chỉ số'), { target: { value: '7' } });
    assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); assert.equal(confirm.checked, false); assert(invalidated > before);
    pass('A guided reader needs explicit count, decimals, region editing and confirmation; a result never applies itself, and configuration edits invalidate it'); cleanup();
  }

  {
    const fixture = context('readings'), submission = readerSubmission(), applied = [], corners = [[.1, .2], [.8, .2], [.8, .4], [.1, .4]];
    const requests = mockAPI((path, body) => {
      if (path === '/api/meter/reader/status?utility=electric') return readerStatus;
      assert.equal(path, '/api/meter/submissions/guided-review/locate'); assert.deepEqual(body, { fileId: 'guided-photo-1', version: 3, digits: 6, decimals: 1 });
      return { width: 1000, height: 700, status: 'selected', candidates: [{ corners, confidence: .9 }], warnings: [] };
    });
    mount(MeterReaderPanel, { submission, fileId: 'guided-photo-1', disabled: false, onApply: proposal => applied.push(proposal), onInvalidate() {} }, fixture);
    await screen.findByLabelText('Số ô số trên hàng chỉ số'); await loadReaderPreview();
    fireEvent.change(screen.getByLabelText('Số ô số trên hàng chỉ số'), { target: { value: '6' } }); fireEvent.change(screen.getByLabelText('Số chữ số phần lẻ'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm vùng số' }));
    const choose = await screen.findByRole('button', { name: 'Chọn vùng gợi ý 1' });
    const confirm = screen.getByRole('checkbox', { name: 'Tôi đã chọn đúng toàn bộ hàng số theo thứ tự đọc' });
    assert.equal(confirm.disabled, true); assert.equal(confirm.checked, false); assert.equal(applied.length, 0); assert.equal(requests.length, 2);
    fireEvent.click(choose); assert.equal(confirm.disabled, false); assert.equal(confirm.checked, false); assert.equal(screen.getByRole('button', { name: 'Đọc vùng đã chọn' }).disabled, true);
    fireEvent.click(confirm); assert.equal(screen.getByRole('button', { name: 'Đọc vùng đã chọn' }).disabled, false); assert.equal(requests.length, 2);
    pass('An electric OCR region suggestion uses the explicit count hint and still requires an explicit choice and image-region confirmation before reading'); cleanup();
  }

  {
    const fixture = context('readings'), applied = [], submission = readerSubmission(); let resolveRead, pendingSignal;
    const requests = mockAPI((path, body, options) => {
      if (path === '/api/meter/reader/status?utility=electric') return readerStatus;
      assert.equal(path, '/api/meter/submissions/guided-review/read'); pendingSignal = options.signal;
      return new Promise(resolve => { resolveRead = resolve; });
    });
    const props = { submission, fileId: 'guided-photo-1', disabled: false, onApply: proposal => applied.push(proposal), onInvalidate() {} };
    const view = mount(MeterReaderPanel, props, fixture); fireEvent.click(await configureReader());
    await waitFor(() => assert.equal(typeof resolveRead, 'function'));
    const firstResolve = resolveRead;
    fireEvent.change(screen.getByLabelText('Số chữ số phần lẻ'), { target: { value: '2' } }); assert.equal(pendingSignal.aborted, true);
    await act(async () => { firstResolve({ proposal: readyReaderProposal() }); await Promise.resolve(); });
    assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null);
    fireEvent.click(await configureReader()); await waitFor(() => assert.notEqual(resolveRead, firstResolve)); const secondResolve = resolveRead;
    view.rerender(h(AppContext.Provider, { value: fixture.value }, h(MeterReaderPanel, { ...props, fileId: 'guided-photo-2', submission: { ...submission, version: 4 } })));
    assert.equal(pendingSignal.aborted, true); await screen.findByLabelText('Số ô số trên hàng chỉ số'); assert.equal(screen.getByLabelText('Số ô số trên hàng chỉ số').value, '');
    await act(async () => { secondResolve({ proposal: readyReaderProposal() }); await Promise.resolve(); });
    assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); assert.equal(applied.length, 0);
    fireEvent.click(await configureReader()); await waitFor(() => assert.notEqual(resolveRead, secondResolve)); const thirdResolve = resolveRead;
    view.unmount(); assert.equal(pendingSignal.aborted, true); await act(async () => { thirdResolve({ proposal: readyReaderProposal() }); await Promise.resolve(); }); assert.equal(applied.length, 0);
    assert.equal(requests.filter(request => request.path.endsWith('/read')).length, 3);
    pass('Changing geometry configuration, photo/version or closing the panel aborts requests and prevents late model results from being applied'); cleanup();
  }

  {
    const fixture = context('readings'), applied = [], submission = readerSubmission();
    mockAPI((path, body) => path === '/api/meter/reader/status?utility=electric' ? readerStatus : { proposal: readyReaderProposal(body, { status: 'needs_review', reading: null, confidence: .3, warnings: ['Một bánh số chưa rõ.'] }) });
    mount(MeterReaderPanel, { submission, fileId: 'guided-photo-1', disabled: false, onApply: proposal => applied.push(proposal), onInvalidate() {} }, fixture);
    fireEvent.click(await configureReader()); await screen.findByText('Chưa đủ rõ để đề xuất chỉ số');
    assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); assert.equal(applied.length, 0);
    pass('Unclear recognition has no apply action and never turns a missing reading into numeric zero'); cleanup();
    const requests = mockAPI(path => { assert.equal(path, '/api/meter/reader/status?utility=electric'); return { ...readerStatus, available: false, readerAvailable: false, locatorAvailable: false, message: 'Chưa có runtime đọc ảnh.' }; });
    mount(MeterReaderPanel, { submission, fileId: 'guided-photo-1', disabled: false, onApply: proposal => applied.push(proposal), onInvalidate() {} }, fixture);
    await screen.findByText(/Chưa có runtime đọc ảnh/); assert.equal(screen.queryByRole('button', { name: 'Đọc vùng đã chọn' }), null); assert.equal(screen.queryByRole('spinbutton'), null); assert.equal(requests.length, 1);
    pass('A missing local runtime reports manual fallback without a recognition action'); cleanup();
  }

  {
    const fixture = context('readings'), submission = readerSubmission(); let saved = 0;
    const requests = mockAPI((path, body) => {
      if (path.startsWith('/api/meter/submissions/guided-review/automatic?')) return automaticReady(submission);
      if (path === '/api/meter/reader/status?utility=electric') return readerStatus;
      if (path.endsWith('/read')) return { proposal: readyReaderProposal(body) };
      assert.equal(path, '/api/meter/submissions/guided-review/review');
      assert.equal(body.proposalId, 'reader-proposal-1'); assert.equal(body.fractionalChecked, true); assert.equal(body.imageChecked, true); assert.equal(body.value, 766); assert.equal(body.selectedFileId, 'guided-photo-1'); assert.equal(body.version, 3);
      return { submission: { status: 'approved' } };
    });
    mount(MeterSubmissionReview, { submission, onClose() {}, onSaved: async () => { saved++; } }, fixture);
    const value = screen.getByLabelText('Chỉ số điện xác minh (kWh, phần nguyên)'), approve = screen.getByRole('button', { name: 'Xác minh chỉ số này' });
    const apply = await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' });
    assert.equal(requests.length, 1); assert.equal(value.value, ''); assert.equal(screen.queryByLabelText('Số ô số trên hàng chỉ số'), null);
    assert.equal(value.value, ''); assert.equal(saved, 0); assert.equal(requests.some(request => request.path.endsWith('/review')), false);
    fireEvent.click(apply); assert.equal(value.value, '766'); assert.equal(approve.disabled, true);
    const imageConsent = screen.getByRole('checkbox', { name: 'Tôi đã đối chiếu từng ô số, đơn vị và cách chia phần nguyên/phần lẻ trên ảnh gốc' }), fractionConsent = screen.getByRole('checkbox', { name: 'Tôi đã kiểm tra phần lẻ và chỉ dùng phần nguyên để ghi chỉ số' });
    assert.equal(imageConsent.checked, false); assert.equal(fractionConsent.checked, false);
    fireEvent.change(screen.getByLabelText(/Ghi chú xác minh hoặc lý do yêu cầu chụp lại/), { target: { value: 'Đã đối chiếu dãy số và phần lẻ trên ảnh gốc.' } });
    fireEvent.click(imageConsent); assert.equal(approve.disabled, true); fireEvent.click(fractionConsent); assert.equal(approve.disabled, false); assert.equal(saved, 0);
    fireEvent.click(approve); await waitFor(() => assert.equal(saved, 1)); assert.equal(requests.filter(request => request.path.endsWith('/review')).length, 1);
    assert.equal(fixture.mutations.length, 0); assert.equal(fixture.actions.length, 0);
    assert.equal(requests.some(request => /\/(locate|read)$/.test(request.path)), false);
    pass('An automatic proposal starts without crop or read clicks, fills only after Apply, and requires separate image/fractional consent and a proposal-bound review note to save'); cleanup();
  }

  {
    const fixture = context('readings'), submission = readerSubmission(); let saved = 0;
    mockAPI((path, body) => {
      if (path.startsWith('/api/meter/submissions/guided-review/automatic?')) return automaticResult(submission);
      if (path === '/api/meter/reader/status?utility=electric') return readerStatus;
      if (path.endsWith('/read')) return { proposal: readyReaderProposal(body) };
      assert.equal(path, '/api/meter/submissions/guided-review/review'); assert.equal(body.value, 777); assert.equal(body.imageChecked, true); assert.equal(body.proposalId, undefined); assert.equal(body.fractionalChecked, undefined); return { submission: { status: 'approved' } };
    });
    mount(MeterSubmissionReview, { submission, onClose() {}, onSaved: async () => { saved++; } }, fixture);
    await screen.findByText('Tạm dùng xác minh thủ công.');
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh vùng / đọc thủ công' })); fireEvent.click(await configureReader()); fireEvent.click(await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' }));
    const value = screen.getByLabelText('Chỉ số điện xác minh (kWh, phần nguyên)'); assert.equal(value.value, '766');
    fireEvent.change(screen.getByLabelText('Số ô số trên hàng chỉ số'), { target: { value: '7' } }); assert.equal(value.value, ''); assert.equal(screen.queryByRole('checkbox', { name: 'Tôi đã kiểm tra phần lẻ và chỉ dùng phần nguyên để ghi chỉ số' }), null);
    fireEvent.click(await configureReader()); fireEvent.click(await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' })); assert.equal(value.value, '766');
    fireEvent.change(value, { target: { value: '777' } }); assert.equal(value.value, '777'); assert.equal(screen.queryByRole('checkbox', { name: 'Tôi đã kiểm tra phần lẻ và chỉ dùng phần nguyên để ghi chỉ số' }), null);
    const imageConsent = screen.getByRole('checkbox', { name: 'Tôi đã đối chiếu từng ô số, đơn vị và cách chia phần nguyên/phần lẻ trên ảnh gốc' }); assert.equal(imageConsent.checked, false);
    fireEvent.change(screen.getByLabelText(/Ghi chú xác minh hoặc lý do yêu cầu chụp lại/), { target: { value: 'Nhập thủ công sau khi kiểm tra lại ảnh gốc.' } }); fireEvent.click(imageConsent); fireEvent.click(screen.getByRole('button', { name: 'Xác minh chỉ số này' }));
    await waitFor(() => assert.equal(saved, 1));
    pass('Changing reader configuration clears an applied value; a manual override drops model provenance and requires fresh image confirmation'); cleanup();
  }

  {
    const fixture = context('readings'), submission = readerSubmission(); let saved = 0;
    const requests = mockAPI((path, body) => {
      if (path.startsWith('/api/meter/submissions/guided-review/automatic?')) return automaticResult(submission, { reason: 'Runtime đang thiếu.' });
      if (path === '/api/meter/reader/status?utility=electric') return { ...readerStatus, available: false, readerAvailable: false, locatorAvailable: false, message: 'Runtime đang thiếu.' };
      assert.equal(path, '/api/meter/submissions/guided-review/review'); assert.equal(body.value, 12001); assert.equal(body.proposalId, undefined); return { submission: { status: 'approved' } };
    });
    mount(MeterSubmissionReview, { submission, onClose() {}, onSaved: async () => { saved++; } }, fixture);
    await screen.findByText(/Runtime đang thiếu/);
    const value = screen.getByLabelText('Chỉ số điện xác minh (kWh, phần nguyên)'); assert.equal(value.value, '');
    fireEvent.change(value, { target: { value: '12001' } }); fireEvent.change(screen.getByLabelText(/Ghi chú xác minh hoặc lý do yêu cầu chụp lại/), { target: { value: 'Đã kiểm tra chỉ số trực tiếp trên ảnh gốc.' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đã đối chiếu từng ô số, đơn vị và cách chia phần nguyên/phần lẻ trên ảnh gốc' })); fireEvent.click(screen.getByRole('button', { name: 'Xác minh chỉ số này' }));
    await waitFor(() => assert.equal(saved, 1)); assert.equal(requests.length, 2); assert.equal(requests.some(request => /\/(locate|read)$/.test(request.path)), false);
    pass('Missing recognition runtime leaves manual image verification and saving fully usable'); cleanup();
  }

  {
    const fixture = context('readings'), submission = { id: 'manual-review', version: 2, roomId: 'room_101', utility: 'electric', period: '2026-11', status: 'pending', selectedFileId: 'original-photo', photos: [{ fileId: 'original-photo', result: { rawText: 'PRIVATE-MACHINE', suggestedValue: 77777 } }] };
    let saved = 0;
    const requests = mockAPI((path, body) => { if (path.startsWith('/api/meter/submissions/manual-review/automatic?')) return automaticResult(submission); assert.equal(path, '/api/meter/submissions/manual-review/review'); assert.equal(body.selectedFileId, 'original-photo'); assert.equal(body.value, 13001); assert.equal(body.imageChecked, true); assert.equal(body.version, 2); assert.equal(body.analysisId, undefined); return { submission: { status: 'approved' } }; });
    mount(MeterSubmissionReview, { submission, onClose() {}, onSaved: async () => { saved++; } }, fixture);
    await screen.findByText('Tạm dùng xác minh thủ công.');
    assert(screen.getByRole('img', { name: 'Ảnh gốc công tơ điện do người thuê gửi' }));
    const value = screen.getByRole('spinbutton'), approve = screen.getByRole('button', { name: 'Xác minh chỉ số này' });
    assert.equal(value.value, ''); assert.equal(approve.disabled, true); assert.equal(screen.queryByText('PRIVATE-MACHINE'), null);
    fireEvent.change(value, { target: { value: '13000' } }); fireEvent.click(screen.getByRole('checkbox')); fireEvent.change(value, { target: { value: '13001' } }); assert.equal(screen.getByRole('checkbox').checked, false);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Đã xem và đối chiếu ảnh gốc.' } }); assert.equal(approve.disabled, true);
    fireEvent.click(screen.getByRole('checkbox')); assert.equal(approve.disabled, false); assert.equal(requests.length, 1);
    fireEvent.click(approve); await waitFor(() => assert.equal(saved, 1)); assert.equal(requests.length, 2);
    pass('Owner review starts blank and saves a manual value only after image confirmation and a review note'); cleanup();
    const rawTenant = store.db.prepare('SELECT * FROM users WHERE email=?').get('thue@trozy.vn'), tenantFixture = context('readings');
    tenantFixture.value = { ...tenantFixture.value, user: safeUser(rawTenant), data: dataFor(store, rawTenant) };
    const requestsBeforeTenant = requests.length;
    mount(MeterSubmissionReview, { submission, onClose() {}, onSaved: async () => assert.fail('A tenant cannot approve') }, tenantFixture);
    assert(screen.getByRole('img', { name: 'Ảnh công tơ điện đã gửi 1' })); assert.equal(screen.queryByRole('spinbutton'), null); assert.equal(screen.queryByRole('checkbox'), null); assert.equal(screen.queryByText('PRIVATE-MACHINE'), null);
    assert.equal(requests.length, requestsBeforeTenant); assert.equal(screen.queryByRole('button', { name: 'Dùng chỉ số đề xuất' }), null); assert.equal(screen.queryByRole('button', { name: 'Chỉnh vùng / đọc thủ công' }), null);
    pass('Tenant receipts show photos and status without readings, recognition requests, proposals or owner review controls'); cleanup();
  }

  {
    const rawTenant = store.db.prepare('SELECT * FROM users WHERE email=?').get('thue@trozy.vn'), fixture = context('readings'); let uploads = 0, refreshes = 0;
    fixture.value = { ...fixture.value, user: safeUser(rawTenant), data: dataFor(store, rawTenant), refresh: async () => { refreshes++; } };
    const requests = mockAPI((path, body) => {
      if (path === '/api/files') return { id: `tenant-photo-${++uploads}` };
      assert.equal(path, '/api/meter/submissions'); assert.deepEqual(body.photos, [{ fileId: 'tenant-photo-1' }]); assert.equal(body.period, '2026-12'); assert.equal(body.utility, 'electric');
      assert.deepEqual(Object.keys(body).sort(), ['note', 'period', 'photos', 'roomId', 'utility']); return { id: 'photo-receipt', status: 'pending', photos: body.photos };
    });
    mount(MeterSubmissionsPanel, {}, fixture); fireEvent.click(screen.getByRole('button', { name: 'Chụp điện' }));
    fireEvent.change(screen.getByLabelText(/Kỳ gửi ảnh/), { target: { value: '2026-12' } });
    fireEvent.change(screen.getByLabelText('Ảnh công tơ để gửi chủ nhà'), { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], 'meter.png', { type: 'image/png' })] } });
    const send = await screen.findByRole('button', { name: 'Gửi 1 ảnh cho chủ nhà' }); await waitFor(() => assert.equal(send.disabled, false));
    assert.equal(requests.filter(request => request.path === '/api/meter/submissions').length, 0); assert.equal(screen.queryByRole('spinbutton'), null); assert.equal(screen.queryByRole('checkbox'), null);
    fireEvent.click(send); await waitFor(() => assert.equal(refreshes, 1)); await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
    assert.equal(requests.length, 2); assert.equal(fixture.mutations.length, 0);
    pass('Tenant explicitly sends photo IDs for owner review with no recognition or reading request'); cleanup();
  }

  {
    const fixture = context('readings'); let refreshes = 0;
    const originalRecords = JSON.stringify({ readings: data.readings, invoices: data.invoices });
    fixture.value = { ...fixture.value, data: { ...data, meterSubmissions: [], rooms: [...data.rooms, { id: 'other-property-room', propertyId: 'other-property-ui', code: 'UI-OTHER' }] }, refresh: async () => { refreshes++; throw Error('Tải lại danh sách tạm thời thất bại.'); } };
    const pendingRow = { ...readerSubmission(), id: 'owner-created-ui', source: 'owner', utility: 'water', period: '2026-12', version: 1, selectedFileId: 'owner-upload-ui', photos: [{ fileId: 'owner-upload-ui' }] };
    const requests = mockAPI((path, body) => {
      if (path === '/api/files') { assert.equal(body.roomId, 'room_101'); assert.equal(body.propertyId, 'property_01'); assert.equal(body.name, 'owner-meter.png'); assert.equal(body.type, 'image/png'); return { id: 'owner-upload-ui' }; }
      if (path === '/api/meter/owner-evidence') {
        assert.deepEqual(body, { roomId: 'room_101', period: '2026-12', utility: 'water', photos: [{ fileId: 'owner-upload-ui' }], note: '' }); return new Response(JSON.stringify(pendingRow), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      assert.equal(path, '/api/meter/submissions/owner-created-ui/automatic?fileId=owner-upload-ui');
      return automaticReady(pendingRow);
    });
    mount(MeterSubmissionsPanel, {}, fixture); assert.equal(requests.length, 0); fireEvent.click(screen.getByRole('button', { name: 'Đọc ảnh công tơ' }));
    assert(screen.getByRole('dialog', { name: 'Đọc ảnh công tơ của chủ nhà' })); assert.equal(screen.queryByRole('option', { name: /UI-OTHER/ }), null);
    fireEvent.change(screen.getByLabelText(/Phòng của ảnh công tơ/), { target: { value: 'room_101' } }); fireEvent.change(screen.getByLabelText(/Kỳ của ảnh công tơ/), { target: { value: '2026-12' } }); fireEvent.change(screen.getByLabelText('Loại công tơ trong ảnh'), { target: { value: 'water' } });
    const upload = screen.getByLabelText('Ảnh công tơ chủ nhà cần xác minh'), create = screen.getByRole('button', { name: 'Tạo bộ ảnh & đọc tự động' });
    fireEvent.change(upload, { target: { files: [new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'too-large.png', { type: 'image/png' })] } });
    await screen.findByText('Chọn JPG, PNG hoặc WebP có dữ liệu, tối đa 3 MB mỗi ảnh.'); assert.equal(requests.length, 0); assert.equal(create.disabled, true);
    fireEvent.change(upload, { target: { files: [new File([new Uint8Array([137, 80, 78, 71, 4])], 'owner-meter.png', { type: 'image/png' })] } });
    await waitFor(() => assert.equal(create.disabled, false)); assert.equal(requests.length, 1); assert.equal(requests[0].path, '/api/files'); assert.equal(fixture.mutations.length, 0);
    fireEvent.click(create); await screen.findByRole('dialog', { name: 'Minh chứng nước · 2026-12' }); await screen.findByRole('button', { name: 'Dùng chỉ số đề xuất' });
    assert.equal(screen.getByLabelText('Chỉ số nước xác minh (m³, phần nguyên)').value, ''); assert.equal(screen.getByRole('button', { name: 'Xác minh chỉ số này' }).disabled, true); assert.equal(screen.queryByLabelText('Số ô số trên hàng chỉ số'), null);
    assert.equal(refreshes, 1); assert.equal(requests.filter(request => request.path === '/api/meter/owner-evidence').length, 1); assert.equal(requests.filter(request => /\/(read|locate|review)$/.test(request.path)).length, 0);
    assert.equal(fixture.mutations.length, 0); assert.equal(fixture.actions.length, 0); assert.equal(JSON.stringify({ readings: data.readings, invoices: data.invoices }), originalRecords);
    assert.equal(requests.filter(request => request.path.includes('/automatic?')).length, 1);
    pass('Owner entry enforces size and room/property scope, creates pending evidence and automatically loads a proposal without crop/read clicks, preserving blank reviewed readings even if refresh fails'); cleanup();
  }

  {
    const fixture = context('readings'); let resolveUpload, uploadSignal, resolveCreate, createSignal, created = 0;
    const requests = mockAPI((path, body, options) => {
      if (path === '/api/files') { uploadSignal = options.signal; return new Promise(resolve => { resolveUpload = resolve; }); }
      assert.equal(path, '/api/meter/owner-evidence'); createSignal = options.signal; return new Promise(resolve => { resolveCreate = resolve; });
    });
    const view = mount(MeterSubmissionsPanel, {}, fixture); fireEvent.click(screen.getByRole('button', { name: 'Đọc ảnh công tơ' }));
    fireEvent.change(screen.getByLabelText('Ảnh công tơ chủ nhà cần xác minh'), { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], 'stale-owner.png', { type: 'image/png' })] } });
    await waitFor(() => assert.equal(typeof resolveUpload, 'function'));
    view.rerender(h(AppContext.Provider, { value: { ...fixture.value, propertyId: 'other-property-ui' } }, h(MeterSubmissionsPanel)));
    assert.equal(uploadSignal.aborted, true); await act(async () => { resolveUpload({ id: 'old-owner-photo' }); await Promise.resolve(); }); assert.equal(screen.queryByRole('dialog'), null); assert.equal(requests.length, 1); cleanup();
    const direct = mount(OwnerMeterEvidenceEntry, { onClose() {}, onCreated: async () => { created++; } }, fixture);
    fireEvent.change(screen.getByLabelText('Ảnh công tơ chủ nhà cần xác minh'), { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], 'closed-owner.png', { type: 'image/png' })] } });
    await waitFor(() => assert.equal(requests.length, 2)); await act(async () => { resolveUpload({ id: 'closed-owner-photo' }); await Promise.resolve(); });
    const create = screen.getByRole('button', { name: 'Tạo bộ ảnh & đọc tự động' }); await waitFor(() => assert.equal(create.disabled, false)); fireEvent.click(create);
    await waitFor(() => assert.equal(typeof resolveCreate, 'function')); direct.unmount(); assert.equal(createSignal.aborted, true);
    await act(async () => { resolveCreate({ ...readerSubmission(), source: 'owner', status: 'pending' }); await Promise.resolve(); }); assert.equal(created, 0); assert.equal(requests.filter(request => /\/(read|locate|review)$/.test(request.path)).length, 0);
    pass('Switching property aborts owner photo uploads, and closing owner creation rejects a late pending response instead of attaching it to another review'); cleanup();
  }

  // B04: a suggestion stays a suggestion until Apply, then normal form submission.
  {
    const fixture = context('issues');
    const requests = mockAPI((path, body) => {
      if (path === '/api/extensions/B04') { assert.equal(body.roomId, 'room_101'); assert.match(body.description, /Máy lạnh/); return { result: { feature: 'B04', engine: 'rules', category: 'Thiết bị', priority: 'urgent', confidence: 88, reasons: ['Mô tả có máy lạnh và rò nước.'], suggestedTitle: 'Kiểm tra máy lạnh', safetyAdvice: ['Tránh tiếp xúc vị trí nghi có điện.'], suggestedSteps: ['Báo chủ trọ kiểm tra.'], warnings: [], requiresConfirmation: true } }; }
    });
    mount(OperationsPages, { page: 'issues' }, fixture);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiếu sửa chữa' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Tiêu đề/), { target: { value: 'Máy lạnh phòng tôi bị hỏng' } });
    fireEvent.change(within(dialog).getByLabelText(/Mô tả sự cố/), { target: { value: 'Máy lạnh phòng 101 bị chảy nước và không mát.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gợi ý loại sự cố & mức ưu tiên' }));
    await within(dialog).findByText('Phân loại theo quy tắc');
    assert.equal(within(dialog).getByLabelText(/Loại sự cố/).value, 'Khác');
    assert.equal(fixture.mutations.length, 0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Áp dụng gợi ý vào phiếu' }));
    assert.equal(within(dialog).getByLabelText(/Loại sự cố/).value, 'Thiết bị');
    assert.equal(within(dialog).getByLabelText(/Mức ưu tiên/).value, 'urgent');
    assert.equal(within(dialog).getByLabelText(/Tiêu đề/).value, 'Máy lạnh phòng tôi bị hỏng');
    assert.equal(fixture.mutations.length, 0); assert.equal(fixture.actions.length, 0);
    pass('B04 previews truthful rule engine output and only Apply edits the form');
    fireEvent.change(within(dialog).getByLabelText(/Mức ưu tiên/), { target: { value: 'normal' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi yêu cầu', exact: true }));
    await waitFor(() => assert.equal(fixture.mutations.length, 1));
    assert.equal(fixture.mutations[0][0], 'issues');
    assert.equal(fixture.mutations[0][1].category, 'Thiết bị'); assert.equal(fixture.mutations[0][1].priority, 'normal');
    assert.equal(fixture.mutations[0][1].status, 'new'); assert.equal(fixture.actions.length, 0);
    assert.equal(requests.length, 1);
    pass('B04 remains editable and creates a new request only on normal explicit submission');
    cleanup();
  }

  // B01: persisted history, escaped model output, citations and explicit draft confirmation.
  {
    const fixture = context('assistant');
    const dangerousText = '<img src=x onerror="window.__aiInjected=true"> Nội dung AI cần đối chiếu.';
    const history = [
      { id: 'older', createdAt: '2026-10-26T08:00:00Z', input: { question: 'Câu hỏi cũ', propertyId: 'property_01' }, result: localResult('Kết quả cũ') },
      { id: 'newer', createdAt: '2026-10-27T08:00:00Z', input: { question: 'Câu hỏi mới', propertyId: 'property_01' }, result: localResult('Kết quả mới') },
    ];
    const requests = mockAPI((path, body) => {
      if (path === '/api/ai/history?feature=B01') return { entries: history };
      if (path === '/api/ai/status') return status;
      if (path === '/api/extensions/B01') { assert.equal(body.propertyId, 'property_01'); assert.equal(body.question, 'Soạn thông báo kiểm tra điện nước'); assert.equal(body.history.length, 4); return { result: { ...localResult(dangerousText), engine: 'ollama', model: 'qwen3:4b-instruct', sources: [{ collection: 'rooms', id: 'room_101', label: 'Nguồn phòng 101', page: 'rooms' }], draft: { title: 'Kiểm tra điện nước', body: 'Mời phòng 101 đối chiếu chỉ số.', kind: 'general', roomIds: ['room_101'] } } }; }
      if (path === '/api/ai/history/clear') return { ok: true };
    });
    mount(AssistantPage, {}, fixture);
    await screen.findByText('Kết quả mới');
    assert.deepEqual([...document.querySelectorAll('.ai-message.user p')].map(node => node.textContent), ['Câu hỏi cũ', 'Câu hỏi mới']);
    assert.equal(document.querySelectorAll('.ai-message .ai-engine').length, 2);
    assert([...document.querySelectorAll('.ai-message .ai-engine')].every(node => node.textContent.includes('Tra cứu dữ liệu cục bộ')));
    pass('B01 restores history chronologically and labels local answers truthfully');
    fireEvent.change(screen.getByLabelText('Câu hỏi cho trợ lý Trozy'), { target: { value: 'Soạn thông báo kiểm tra điện nước' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    await screen.findByText(dangerousText);
    assert.equal(document.querySelectorAll('.ai-answer img').length, 0);
    assert.equal(dom.window.__aiInjected, undefined);
    assert(screen.getByText('Ollama · qwen3:4b-instruct'));
    fireEvent.click(screen.getByRole('button', { name: 'Nguồn phòng 101' }));
    assert.deepEqual(fixture.navigation, ['rooms']); assert.equal(fixture.mutations.length, 0);
    pass('B01 escapes untrusted output, distinguishes Ollama and links allowed sources');
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước thông báo' }));
    const dialog = screen.getByRole('dialog');
    assert.equal(fixture.mutations.length, 0);
    assert.equal(within(dialog).getByRole('checkbox', { name: 'Phòng 101' }).checked, true);
    fireEvent.change(within(dialog).getByLabelText(/Nội dung thông báo/), { target: { value: 'Nội dung đã được chủ trọ kiểm tra.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận gửi thông báo' }));
    await waitFor(() => assert.equal(fixture.mutations.length, 1));
    assert.equal(fixture.mutations[0][0], 'notifications');
    assert.deepEqual(fixture.mutations[0][1].roomIds, ['room_101']);
    assert.equal(fixture.mutations[0][1].propertyId, 'property_01');
    assert.equal(fixture.mutations[0][1].body, 'Nội dung đã được chủ trọ kiểm tra.');
    pass('B01 draft preview never sends; explicit confirmation sends reviewed targeted content');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lịch sử của tôi' }));
    assert(!requests.some(request => request.path === '/api/ai/history/clear'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa lịch sử', exact: true }));
    await screen.findByText('Hôm nay bạn muốn biết điều gì?');
    assert.equal(requests.filter(request => request.path === '/api/ai/history/clear').length, 1);
    pass('B01 clearing history requires its own explicit confirmation');
    cleanup();
  }
  console.log(`PASS: ${checks} AI interaction checks in an isolated in-memory DOM. No real browser, Ollama, file persistence or messages were used.`);
} finally {
  await act(async () => { cleanup(); });
  globalThis.fetch = nativeFetch;
  await vite.close(); store.close();
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  dom.window.close();
  for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
}
