/** Gemini API free-model rotation, B01/B04 integration, and B03 Vision Tier-2 fallback tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  createGeminiClient,
  GEMINI_VISION_DIGEST,
  geminiEndpointUrl,
  geminiVisionEnabled,
  resetGeminiRotation,
  toGeminiSchema,
} from '../src/ai/gemini.mjs';
import { getAiStatus } from '../src/ai/llm.mjs';
import { answerQuestion } from '../src/ai/copilot.mjs';
import { classifyMaintenance } from '../src/ai/maintenance.mjs';
import { openStore, id, now, safeUser } from '../src/backend/db.mjs';
import { seedDemo } from '../src/backend/seed.mjs';
import { dataFor } from '../src/backend/domain.mjs';
import { createMeterSubmissionService } from '../src/backend/meter-submissions.mjs';
import { createMeterReaderService } from '../src/backend/meter-reader-service.mjs';
import { createMeterAutomaticService } from '../src/backend/meter-automatic.mjs';
import { meterReaderModelDigests } from '../src/ai/meter-reader.mjs';

function withEnv(t, overrides) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetGeminiRotation();
  });
}

function geminiOk(data) {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function geminiHttpError(status, body = {}, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('toGeminiSchema strips unsupported JSON Schema constraints while preserving structure', () => {
  const sanitized = toGeminiSchema({
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string', maxLength: 350, minLength: 1 },
      score: { type: 'number', minimum: 0, maximum: 100 },
      items: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 50 } },
    },
    required: ['answer', 'score'],
  });
  assert.equal(sanitized.additionalProperties, undefined);
  assert.equal(sanitized.properties.answer.maxLength, undefined);
  assert.equal(sanitized.properties.score.minimum, undefined);
  assert.equal(sanitized.properties.score.maximum, undefined);
  assert.equal(sanitized.properties.items.maxItems, undefined);
  assert.deepEqual(sanitized.required, ['answer', 'score']);
  assert.equal(sanitized.properties.items.items.type, 'string');
});

test('Gemini client rotates automatically across free models on 429/503/404 and wraps around after cooldown', async () => {
  let clock = 1_000_000;
  const calls = [];
  const envState = {
    GEMINI_API_KEY: 'secret-free-key-1',
    GEMINI_MODELS: 'model-a,model-b,model-c',
    TROZY_GEMINI_COOLDOWN_MS: '60000',
    TROZY_GEMINI_TIMEOUT_MS: '5000',
  };
  let phase = 1;
  const client = createGeminiClient({
    now: () => clock,
    env: () => envState,
    fetchImpl: async (url, init) => {
      assert.ok(!String(url).includes('secret-free-key-1'), 'API key must never appear in URL');
      assert.equal(init.headers['x-goog-api-key'], 'secret-free-key-1');
      const model = decodeURIComponent(String(url).match(/\/models\/([^:]+):generateContent/)[1]);
      calls.push(model);
      if (phase === 1) {
        if (model === 'model-a') return geminiHttpError(429, { error: { message: 'Quota exceeded' } });
        return geminiOk({ ok: true, from: model });
      }
      if (phase === 2) {
        return geminiOk({ ok: true, from: model });
      }
      if (phase === 3) {
        if (model === 'model-b') return geminiHttpError(503, { error: { message: 'Overloaded' } });
        return geminiOk({ ok: true, from: model });
      }
      if (phase === 4) {
        if (model === 'model-c') return geminiHttpError(404, { error: { message: 'Model retired' } });
        return geminiOk({ ok: true, from: model });
      }
      return geminiHttpError(429, { error: { message: 'PerDay quota exhausted' } });
    },
  });

  // 1) model-a hits 429 -> immediately rotates to model-b in the same request.
  const r1 = await client.geminiJson({ system: 'sys', prompt: 'p', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } });
  assert.equal(r1.model, 'model-b');
  assert.deepEqual(r1.rotatedFrom, ['model-a:429']);
  assert.deepEqual(calls.slice(-2), ['model-a', 'model-b']);

  // 2) Next call stays sticky on healthy model-b without wasting a request on cooling model-a.
  phase = 2;
  const r2 = await client.geminiJson({ system: 'sys', prompt: 'p', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } });
  assert.equal(r2.model, 'model-b');
  assert.deepEqual(calls.slice(-1), ['model-b']);

  // 3) model-b hits 503 -> rotates to model-c.
  phase = 3;
  const r3 = await client.geminiJson({ system: 'sys', prompt: 'p', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } });
  assert.equal(r3.model, 'model-c');
  assert.deepEqual(r3.rotatedFrom, ['model-b:503']);

  // 4) Advance past model-a's 60s cooldown, then model-c returns 404 -> wraps cleanly back to model-a!
  clock += 65_000;
  phase = 4;
  const r4 = await client.geminiJson({ system: 'sys', prompt: 'p', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } });
  assert.equal(r4.model, 'model-a');
  assert.deepEqual(r4.rotatedFrom, ['model-c:404']);

  // Status never leaks the raw API key and reports active pool state.
  const status = client.getStatus();
  assert.equal(status.provider, 'gemini');
  assert.equal(status.available, true);
  assert.equal(status.model, 'model-a');
  assert.equal(status.keyCount, 1);
  assert.ok(!JSON.stringify(status).includes('secret-free-key-1'));

  // 5) When all remaining models hit 429, throws clean rate_limited error without looping.
  phase = 5;
  await assert.rejects(
    () => client.geminiJson({ system: 'sys', prompt: 'p', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } }),
    error => error.name === 'GeminiError' && error.code === 'rate_limited'
  );
  assert.equal(client.getStatus().available, false);
});

test('Gemini client supports multi-key auth failover and round_robin rotation mode', async () => {
  const seen = [];
  const client = createGeminiClient({
    now: () => 10_000,
    env: () => ({
      GEMINI_API_KEYS: 'bad-key,good-key',
      GEMINI_MODELS: 'm1,m2',
      TROZY_GEMINI_ROTATION_MODE: 'round_robin',
    }),
    fetchImpl: async (url, init) => {
      const model = decodeURIComponent(String(url).match(/\/models\/([^:]+):generateContent/)[1]);
      const key = init.headers['x-goog-api-key'];
      seen.push(`${model}:${key}`);
      if (key === 'bad-key') return geminiHttpError(403, { error: { message: 'API key invalid' } });
      return geminiOk({ ok: true });
    },
  });

  const first = await client.geminiJson({ system: 's', prompt: 'p', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } });
  assert.equal(first.model, 'm1');
  const second = await client.geminiJson({ system: 's', prompt: 'p', schema: { type: 'object', properties: { ok: { type: 'boolean' } } } });
  assert.equal(second.model, 'm2');
  // bad-key was cooled across all models after the single 403.
  assert.deepEqual(seen, ['m1:bad-key', 'm1:good-key', 'm2:good-key']);
});

test('Gemini is unavailable without a key and activates with B01/B04 safety guards', async t => {
  withEnv(t, { GEMINI_API_KEY: undefined, GEMINI_API_KEYS: undefined, TROZY_AI_PROVIDER: undefined });
  assert.equal((await getAiStatus()).available, false);
  assert.equal((await getAiStatus()).provider, 'gemini');

  const store = openStore(':memory:');
  seedDemo(store);
  t.after(() => store.close());
  const tenantRaw = store.db.prepare('SELECT * FROM users WHERE id=?').get('user_tenant');
  const tenant = safeUser(tenantRaw);
  const tenantData = dataFor(store, tenantRaw);

  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  withEnv(t, {
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODELS: 'free-model-1,free-model-2',
    TROZY_AI_PROVIDER: 'auto',
    TROZY_AI_ENABLED: 'true',
  });
  resetGeminiRotation();
  const status = await getAiStatus();
  assert.equal(status.provider, 'gemini');
  assert.equal(status.available, true);
  assert.equal(status.model, 'free-model-1');

  // First model hits 429; second model answers B01 and B04 cleanly.
  globalThis.fetch = async (url, init) => {
    const model = decodeURIComponent(String(url).match(/\/models\/([^:]+):generateContent/)[1]);
    if (model === 'free-model-1') return geminiHttpError(429, { error: { message: 'TPM limit' } });
    const body = JSON.parse(init.body);
    const promptText = body.contents[0].parts[0].text;
    assert.ok(!promptText.includes('thue@trozy.vn'));
    assert.ok(!promptText.includes('0912345678'));
    if (promptText.includes('allowedCategories')) {
      return geminiOk({
        category: 'Khác',
        priority: 'low',
        confidence: 72,
        reasons: ['Cần kiểm tra ổ cắm.'],
        suggestedTitle: 'Ổ cắm phát tia lửa',
        suggestedSteps: ['Tự tháo ổ cắm.'],
      });
    }
    const parsedPrompt = JSON.parse(promptText);
    return geminiOk({ intro: 'Đây là chi tiết hóa đơn mới nhất của bạn.', sourceIds: [parsedPrompt.sources[0].sourceId] });
  };

  const b01 = await answerQuestion({ user: tenant, data: tenantData, input: { question: 'Giải thích hóa đơn của tôi' } });
  assert.equal(b01.engine, 'gemini');
  assert.equal(b01.model, 'free-model-2');
  assert.ok(b01.answer.includes('Tổng hóa đơn:'));

  // B04 enforces deterministic safety floor (urgent + Điện) and strips model-generated repair steps.
  const b04 = await classifyMaintenance({
    user: tenant,
    data: tenantData,
    input: { roomId: 'room_101', description: 'Ổ cắm trong phòng có tia lửa điện và mùi khét.' },
  });
  assert.equal(b04.engine, 'gemini');
  assert.equal(b04.model, 'free-model-2');
  assert.equal(b04.category, 'Điện');
  assert.equal(b04.priority, 'urgent');
  assert.ok(!b04.suggestedSteps.includes('Tự tháo ổ cắm.'));
  assert.ok(b04.safetyAdvice.length > 0);
});

test('B03 Tier-2 Gemini Vision fallback runs only when local OCR is uncertain or disabled and preserves all review guards', async t => {
  const store = openStore(':memory:');
  seedDemo(store);
  t.after(() => store.close());
  const owner = store.db.prepare('SELECT * FROM users WHERE id=?').get('owner_demo');
  const tenant = store.db.prepare('SELECT * FROM users WHERE id=?').get('user_tenant');
  const bytes = await sharp({ create: { width: 240, height: 90, channels: 3, background: '#333' } }).png().toBuffer();

  async function until(check) {
    for (let i = 0; i < 400; i++) {
      const value = check();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('background automatic meter job timed out');
  }

  let localCalls = 0;
  let visionCalls = 0;
  let visionMode = 'ready';

  const geminiClient = createGeminiClient({
    now: () => 50_000,
    env: () => ({ GEMINI_API_KEY: 'vision-test-key', GEMINI_MODELS: 'v-free-1,v-free-2' }),
    fetchImpl: async url => {
      const model = decodeURIComponent(String(url).match(/\/models\/([^:]+):generateContent/)[1]);
      if (model === 'v-free-1') return geminiHttpError(429, { error: { message: 'RPM exhausted' } });
      if (visionMode === 'wrong_unit') {
        return geminiOk({ readable: true, reading: 123, unit: 'm3', uncertain: false, reason: 'Ảnh đồng hồ nước' });
      }
      return geminiOk({
        readable: true,
        reading: 13010,
        unit: 'kWh',
        uncertain: false,
        reason: 'Đọc thẳng phần nguyên 13010 kWh',
      });
    },
  });

  let auto;
  const submissions = createMeterSubmissionService(store, {
    onCreated: row => auto.enqueueCreated(row),
    onReviewed: (user, row, proposal) => auto.rememberVerifiedLayout(user, row, proposal),
  });
  const reader = createMeterReaderService(store, {
    run: async input => {
      localCalls++;
      return {
        width: 240,
        height: 90,
        status: 'needs_review',
        reading: null,
        confidence: 0,
        warnings: ['PaddleOCR chưa đọc chắc hàng số.'],
        quality: null,
        cells: [],
        engine: 'paddleocr',
        model: 'paddleocr-ppocrv6',
        modelDigest: meterReaderModelDigests('electric').modelDigest,
        ocrEvidence: { scope: 'automatic', observations: [], selectedObservationIndices: [], agreement: false },
        config: null,
        profileSource: input.profile ? 'confirmed' : null,
        configNeedsConfirmation: false,
      };
    },
    visionEnabled: () => true,
    visionFallback: async args => {
      visionCalls++;
      return geminiClient.geminiVisionMeter(args);
    },
  });
  auto = createMeterAutomaticService(store, reader, { retryMs: 5, maxAttempts: 1 });
  t.after(async () => { await auto.close(); });

  const beforeReadingsInvoices = JSON.stringify([store.list('readings'), store.list('invoices')]);
  const fileId = id('file');
  store.db.prepare(
    'INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,name,type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(fileId, owner.id, tenant.id, 'property_01', 'tenant_01', 'room_101', 'meter.png', 'image/png', bytes, now());

  const receipt = submissions.submitPhotos(tenant, {
    roomId: 'room_101',
    period: '2026-11',
    utility: 'electric',
    photos: [{ fileId }],
  });
  await until(() => store.db.prepare('SELECT status FROM meter_reader_jobs WHERE submission_id=?').get(receipt.id)?.status === 'ready');

  assert.equal(localCalls, 1);
  assert.equal(visionCalls, 1);

  const autoView = auto.get(owner, receipt.id, fileId);
  assert.equal(autoView.status, 'ready');
  assert.equal(autoView.proposal.engine, 'gemini-vision');
  assert.equal(autoView.proposal.model, 'v-free-2');
  assert.equal(autoView.proposal.modelDigest, GEMINI_VISION_DIGEST);
  assert.equal(autoView.proposal.profileSource, 'gemini-vision');
  assert.equal(autoView.proposal.reading.displayText, '13010');
  assert.equal(autoView.proposal.reading.integerValue, 13010);
  assert.equal(autoView.proposal.config.decimals, 0);
  assert.deepEqual(autoView.proposal.visionEvidence.rotatedFrom, ['v-free-1:429']);
  assert.ok(Array.isArray(autoView.trace) && autoView.trace.length === 4);
  assert.deepEqual(autoView.trace.map(step => step.stage), ['normalize', 'local_ocr', 'gemini_vision', 'final']);
  assert.equal(autoView.trace[1].status, 'miss');
  assert.equal(autoView.trace[2].status, 'ok');
  assert.equal(autoView.trace[2].model, 'v-free-2');
  assert.ok(autoView.trace[2].details.some(line => line.includes('v-free-1') && line.includes('xoay')));
  assert.ok(!JSON.stringify(autoView.trace).includes('vision-test-key'));

  // Tenant never sees any Gemini/OCR proposal data, and readings/invoices stay untouched before approval.
  const tenantPayload = JSON.stringify(dataFor(store, tenant));
  for (const secret of [autoView.proposal.id, 'gemini-vision', 'visionEvidence', '13010']) {
    assert.ok(!tenantPayload.includes(secret), `Tenant payload leaked ${secret}`);
  }
  assert.equal(JSON.stringify([store.list('readings'), store.list('invoices')]), beforeReadingsInvoices);

  // Approval still enforces imageChecked (no extra fractional checkbox needed when reading is direct integer).
  const approval = {
    decision: 'approve',
    version: 1,
    value: 13010,
    note: 'Đã đối chiếu ảnh gốc từ đề xuất Gemini Vision.',
    selectedFileId: fileId,
    proposalId: autoView.proposal.id,
    imageChecked: true,
  };
  assert.throws(() => submissions.review(owner, receipt.id, { ...approval, imageChecked: false }), err => err.status === 400);

  const approved = submissions.review(owner, receipt.id, approval);
  assert.equal(approved.submission.verificationSource, 'gemini-vision-and-human');
  assert.equal(approved.reading.electricNew, 13010);
  // Gemini Vision never silently creates a mechanical meterProfile without explicit owner setup.
  assert.equal(store.list('meterProfiles', owner.id).length, 0);

  // Wrong utility unit from Gemini Vision must be safely refused (needs_review).
  visionMode = 'wrong_unit';
  const wrongUnit = await geminiClient.geminiVisionMeter({
    bytes,
    mime: 'image/png',
    width: 240,
    height: 90,
    utility: 'electric',
  });
  assert.equal(wrongUnit.status, 'needs_review');
  assert.equal(wrongUnit.reading, null);

  // Check geminiVisionEnabled respects TROZY_METER_VISION_FALLBACK=off.
  assert.equal(geminiVisionEnabled({ GEMINI_API_KEY: 'k', TROZY_METER_VISION_FALLBACK: 'off' }), false);
  assert.equal(geminiVisionEnabled({ GEMINI_API_KEY: 'k', TROZY_METER_VISION_FALLBACK: 'auto', TROZY_AI_ENABLED: '0' }), false);
  assert.equal(geminiVisionEnabled({ GEMINI_API_KEY: 'k', TROZY_METER_VISION_FALLBACK: 'auto', TROZY_AI_ENABLED: 'true' }), true);
});

test('camera guideBox ROI hint validates cleanly, stays hidden from tenant receipt, and forwards to local OCR worker', async t => {
  const store = openStore(':memory:');
  seedDemo(store);
  t.after(() => store.close());
  const owner = store.db.prepare('SELECT * FROM users WHERE id=?').get('owner_demo');
  const tenant = store.db.prepare('SELECT * FROM users WHERE id=?').get('user_tenant');
  const bytes = await sharp({ create: { width: 240, height: 90, channels: 3, background: '#333' } }).png().toBuffer();

  const forwarded = [];
  let auto;
  const submissions = createMeterSubmissionService(store, {
    onCreated: row => auto.enqueueCreated(row),
  });
  const reader = createMeterReaderService(store, {
    run: async input => {
      forwarded.push(input);
      return {
        width: 240,
        height: 90,
        status: 'needs_review',
        reading: null,
        confidence: 0,
        warnings: ['Chưa đọc rõ.'],
        quality: null,
        cells: [],
        engine: 'paddleocr',
        model: 'paddleocr-ppocrv6',
        modelDigest: meterReaderModelDigests('electric').modelDigest,
        ocrEvidence: { scope: 'automatic', observations: [], selectedObservationIndices: [], agreement: false },
        config: null,
        profileSource: null,
        configNeedsConfirmation: false,
      };
    },
    visionEnabled: () => false,
  });
  auto = createMeterAutomaticService(store, reader, { retryMs: 5, maxAttempts: 1 });
  t.after(async () => { await auto.close(); });

  const fileId = id('file');
  store.db.prepare(
    'INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,name,type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).run(fileId, owner.id, tenant.id, 'property_01', 'tenant_01', 'room_101', 'camera.png', 'image/png', bytes, now());

  // Invalid guideBox is rejected at submission time.
  assert.throws(
    () => submissions.submitPhotos(tenant, { roomId: 'room_101', period: '2026-11', utility: 'electric', photos: [{ fileId, guideBox: { left: -0.2, top: 0.2, width: 0.5, height: 0.2 } }] }),
    err => err.status === 400
  );

  const guideBox = { left: 0.12345, top: 0.35, width: 0.75, height: 0.22 };
  const receipt = submissions.submitPhotos(tenant, {
    roomId: 'room_101',
    period: '2026-11',
    utility: 'electric',
    photos: [{ fileId, guideBox }],
  });
  // Tenant receipt never exposes internal guideBox metadata.
  assert.equal(receipt.photos[0].guideBox, undefined);

  for (let i = 0; i < 400; i++) {
    if (forwarded.length) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(forwarded.length, 1);
  assert.deepEqual(forwarded[0].guideBox, { left: 0.1235, top: 0.35, width: 0.75, height: 0.22 });
});

test('Gemini endpoint defaults to AI Studio (including AQ. keys), supports explicit vertex mode, and rotates on 400 API_KEY_INVALID', async () => {
  assert.equal(
    geminiEndpointUrl('gemini-3.1-flash-lite'),
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent'
  );
  assert.equal(
    geminiEndpointUrl('gemini-3.1-flash-lite', 'vertex'),
    'https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-3.1-flash-lite:generateContent'
  );

  const keysSeen = [];
  const client = createGeminiClient({
    now: () => 20_000,
    env: () => ({ GEMINI_API_KEYS: 'bad-key,AQ.ValidStudioKey', GEMINI_MODELS: 'gemini-3.1-flash-lite' }),
    fetchImpl: async (url, init) => {
      assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
      keysSeen.push(init.headers['x-goog-api-key']);
      if (init.headers['x-goog-api-key'] === 'bad-key') {
        return geminiHttpError(400, { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } });
      }
      return geminiOk({ ok: true });
    },
  });

  const result = await client.geminiJson({
    system: 'sys',
    prompt: 'hello',
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  });
  assert.equal(result.model, 'gemini-3.1-flash-lite');
  assert.deepEqual(keysSeen, ['bad-key', 'AQ.ValidStudioKey']);
});
