/** Native Gemini API transport with automatic free-model rotation and Vision fallback.
 *
 * Uses Node.js built-in fetch (no external SDK). API keys are sent strictly in the
 * x-goog-api-key request header and never logged or returned to clients.
 */

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const VERTEX_EXPRESS_API_BASE = 'https://aiplatform.googleapis.com/v1beta1/publishers/google';
export const GEMINI_VISION_DIGEST = 'gemini-vision-v1';
export const DEFAULT_GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
];

export function geminiEndpointUrl(model, apiMode = 'studio') {
  const base = apiMode === 'vertex' ? VERTEX_EXPRESS_API_BASE : GEMINI_API_BASE;
  return `${base}/models/${encodeURIComponent(model)}:generateContent`;
}

const MODEL_RE = /^[a-zA-Z0-9._-]{2,80}$/;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_JSON_REQUEST_BYTES = 128 * 1024;
const MAX_VISION_IMAGE_BYTES = 10 * 1024 * 1024;
const TRANSIENT_COOLDOWN_MS = 30_000;
const DAILY_COOLDOWN_MS = 15 * 60_000;
const MISSING_MODEL_COOLDOWN_MS = 30 * 60_000;
const AUTH_KEY_COOLDOWN_MS = 30 * 60_000;

export class GeminiError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
    this.status = status;
  }
}

function splitList(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

export function geminiKeys(env = process.env) {
  const seen = new Set();
  const keys = [];
  for (const raw of [env.GEMINI_API_KEY, env.GEMINI_API_KEYS]) {
    for (const token of splitList(raw)) {
      if (!seen.has(token)) {
        seen.add(token);
        keys.push(token);
      }
    }
  }
  return keys;
}

export function hasGeminiKeys(env = process.env) {
  return geminiKeys(env).length > 0;
}

export function geminiConfig(env = process.env) {
  const keys = geminiKeys(env);
  const rawModels = splitList(env.GEMINI_MODELS);
  const models = [];
  const seen = new Set();
  for (const name of rawModels.length ? rawModels : DEFAULT_GEMINI_MODELS) {
    const clean = name.replace(/^models\//i, '');
    if (!MODEL_RE.test(clean)) {
      throw new GeminiError('configuration', `Tên model Gemini không hợp lệ: ${clean}.`, 500);
    }
    if (!seen.has(clean)) {
      seen.add(clean);
      models.push(clean);
    }
  }
  if (!models.length) {
    throw new GeminiError('configuration', 'Danh sách GEMINI_MODELS không được để trống.', 500);
  }
  const timeoutRaw = Number(env.TROZY_GEMINI_TIMEOUT_MS || 45000);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.min(90000, Math.max(1000, timeoutRaw)) : 45000;
  const cooldownRaw = Number(env.TROZY_GEMINI_COOLDOWN_MS || 65000);
  const cooldownMs = Number.isFinite(cooldownRaw) ? Math.min(3600000, Math.max(1000, cooldownRaw)) : 65000;
  const modeRaw = String(env.TROZY_GEMINI_ROTATION_MODE || 'failover').trim().toLowerCase();
  const rotationMode = modeRaw === 'round_robin' ? 'round_robin' : 'failover';
  const apiModeRaw = String(env.TROZY_GEMINI_API_MODE || 'studio').trim().toLowerCase();
  const apiMode = apiModeRaw === 'vertex' ? 'vertex' : 'studio';
  return { keys, models, timeoutMs, cooldownMs, rotationMode, apiMode };
}

export function geminiVisionEnabled(env = process.env) {
  const flag = String(env.TROZY_METER_VISION_FALLBACK || 'auto').trim().toLowerCase();
  if (['off', 'false', '0', 'disabled'].includes(flag)) return false;
  if (flag !== 'gemini' && ['false', '0'].includes(String(env.TROZY_AI_ENABLED || '').trim().toLowerCase())) {
    return false;
  }
  return hasGeminiKeys(env);
}

/** Convert JSON Schema to the OpenAPI 3.0 subset accepted by Gemini responseSchema. */
export function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if ([
      'additionalProperties',
      'maxLength',
      'minLength',
      'maxItems',
      'minItems',
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'exclusiveMaximum',
      '$schema',
      'title',
      'default',
    ].includes(key)) {
      continue;
    }
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      result.properties = Object.fromEntries(
        Object.entries(value).map(([prop, propSchema]) => [prop, toGeminiSchema(propSchema)])
      );
    } else if (key === 'items') {
      result.items = toGeminiSchema(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function readBounded(response, limit = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    throw new GeminiError('response_size', 'Phản hồi Gemini vượt giới hạn.', 502);
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > limit) {
      throw new GeminiError('response_size', 'Phản hồi Gemini vượt giới hạn.', 502);
    }
    return text;
  }
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        throw new GeminiError('response_size', 'Phản hồi Gemini vượt giới hạn.', 502);
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseRetryDelayMs(response, bodyText, fallbackMs, nowMs) {
  const header = response.headers?.get?.('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(3600_000, Math.max(1000, Math.round(seconds * 1000)));
    }
    const timestamp = Date.parse(header);
    if (Number.isFinite(timestamp) && timestamp > nowMs) {
      return Math.min(3600_000, Math.max(1000, timestamp - nowMs));
    }
  }
  if (bodyText) {
    const retryMatch = bodyText.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
    if (retryMatch) {
      const ms = Math.round(Number(retryMatch[1]) * 1000);
      if (Number.isFinite(ms) && ms > 0) return Math.min(3600_000, Math.max(1000, ms));
    }
    if (/PerDay|GenerateRequestsPerDay|daily|RPD/i.test(bodyText)) {
      return Math.max(fallbackMs, DAILY_COOLDOWN_MS);
    }
  }
  return fallbackMs;
}

function parseJsonBody(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) throw new GeminiError('invalid_json', 'Gemini trả về phản hồi rỗng.', 502);
  let candidate = trimmed;
  if (candidate.startsWith('```')) {
    const match = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (match) candidate = match[1].trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(candidate.slice(start, end + 1));
      } catch {
        throw new GeminiError('invalid_json', 'Nội dung Gemini trả về chưa đúng định dạng JSON.', 502);
      }
    } else {
      throw new GeminiError('invalid_json', 'Nội dung Gemini trả về chưa đúng định dạng JSON.', 502);
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GeminiError('invalid_json', 'Nội dung Gemini trả về chưa đúng cấu trúc yêu cầu.', 502);
  }
  return parsed;
}

function extractCandidateText(payload) {
  const candidate = payload?.candidates?.[0];
  if (!candidate || typeof candidate !== 'object') {
    throw new GeminiError('incomplete', 'Gemini chưa trả về nội dung ứng viên.', 502);
  }
  const finishReason = candidate.finishReason;
  if (finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(finishReason)) {
    throw new GeminiError('incomplete', `Gemini dừng sớm (${finishReason}).`, 502);
  }
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts) || !parts.length) {
    throw new GeminiError('incomplete', 'Gemini không trả về văn bản kết quả.', 502);
  }
  // Skip thinking parts if a reasoning-capable Flash model emits them.
  const textParts = parts
    .filter(part => part && typeof part.text === 'string' && !part.thought)
    .map(part => part.text);
  const text = (textParts.length ? textParts : parts.map(part => part?.text || '')).join('').trim();
  if (!text || text.length > 32000) {
    throw new GeminiError('incomplete', 'Phản hồi Gemini trống hoặc vượt giới hạn.', 502);
  }
  return text;
}

const METER_VISION_SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    reading: { type: 'integer' },
    unit: { type: 'string', enum: ['kWh', 'm3', 'unknown'] },
    uncertain: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['readable', 'reading', 'unit', 'uncertain', 'reason'],
};

function meterVisionPrompt(utility) {
  const isElectric = utility === 'electric';
  const expectedUnit = isElectric ? 'kWh' : 'm3';
  return [
    `Nhiệm vụ: Đọc thẳng chỉ số phần nguyên của công tơ ${isElectric ? 'ĐIỆN (số kWh / ký điện)' : 'NƯỚC (số m³ / khối nước)'} từ ảnh.`,
    'Quy tắc bắt buộc:',
    `1. Xác minh ảnh đúng là công tơ ${isElectric ? 'điện (kWh)' : 'nước (m3/m³)'}. Nếu sai loại công tơ, ảnh mờ/chói/che khuất hoặc không đọc chắc phần nguyên, đặt readable=false, uncertain=true, reading=0.`,
    '2. CHỈ đọc thẳng SỐ NGUYÊN của chỉ số tiêu thụ chính (các chữ số màu đen trước ô đỏ, hoặc phần nguyên trước dấu chấm thập phân trên màn hình điện tử/LCD).',
    '3. BỎ QUA hoàn toàn phần chữ số lẻ (ô nền đỏ/chữ đỏ ở cuối, các chữ số sau dấu chấm thập phân, kim đồng hồ nhỏ x0.1/x0.01/x0.001). Không làm tròn lên (ví dụ: 00766.4 kWh → 766; 00001.056 m³ → 1; 26762.8 → 26762).',
    '4. TUYỆT ĐỐI KHÔNG đọc số sê-ri, mã sản phẩm, năm sản xuất, điện áp/dòng điện (220V, 5(20)A, 10(40)A) hoặc thông số Q3/R160.',
    `5. Trả reading là số nguyên không âm (0..999999999), unit="${expectedUnit}" nếu đúng công tơ (ngược lại "unknown"), và reason ngắn gọn bằng tiếng Việt.`,
    'Chỉ trả về JSON hợp lệ theo schema.',
  ].join('\n');
}

function normalizeVisionReading(data, { utility, width, height, model, attempts, rotatedFrom, attemptLog }) {
  const expectedUnit = utility === 'electric' ? 'kWh' : 'm3';
  const safeAttempts = Array.isArray(attemptLog) ? attemptLog.slice(0, 16) : undefined;
  const baseRefusal = (warning, reason) => ({
    width,
    height,
    status: 'needs_review',
    reading: null,
    confidence: 0,
    warnings: [warning],
    quality: null,
    cells: [],
    engine: 'gemini-vision',
    model,
    modelDigest: GEMINI_VISION_DIGEST,
    config: null,
    profileSource: null,
    configNeedsConfirmation: false,
    visionEvidence: {
      provider: 'gemini',
      model,
      reason: String(reason || data?.reason || '').slice(0, 300),
      attempts,
      ...(rotatedFrom?.length ? { rotatedFrom } : {}),
      ...(safeAttempts?.length ? { attemptLog: safeAttempts } : {}),
    },
  });

  if (!data || typeof data !== 'object' || data.readable !== true || data.uncertain === true) {
    return baseRefusal(
      'Gemini Vision chưa đủ chắc chắn để đọc ảnh này. Chủ nhà hãy đối chiếu ảnh gốc và nhập tay.',
      data?.reason || 'unreadable'
    );
  }
  if (data.unit !== expectedUnit) {
    return baseRefusal(
      `Ảnh chưa xác nhận đúng công tơ ${expectedUnit === 'kWh' ? 'điện (kWh)' : 'nước (m³)'}. Hãy kiểm tra ảnh gốc.`,
      `unit_mismatch:${data.unit}`
    );
  }
  const integerValue = data.reading;
  if (!Number.isSafeInteger(integerValue) || integerValue < 0 || integerValue > 999_999_999) {
    return baseRefusal('Chỉ số Gemini Vision đọc được không phải số nguyên hợp lệ (0–999.999.999).', 'invalid_integer_reading');
  }
  const text = String(integerValue);
  return {
    width,
    height,
    status: 'ready',
    reading: {
      digits: text,
      displayText: text,
      integerDigits: text,
      fractionalDigits: '',
      integerValue,
      unit: expectedUnit,
    },
    confidence: 0.85,
    warnings: ['Đây là chỉ số phần nguyên đề xuất trực tiếp từ Gemini Vision. Chủ nhà bắt buộc đối chiếu ảnh gốc trước khi lưu.'],
    quality: null,
    cells: [],
    engine: 'gemini-vision',
    model,
    modelDigest: GEMINI_VISION_DIGEST,
    config: { digits: text.length, decimals: 0, corners: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    profileSource: 'gemini-vision',
    configNeedsConfirmation: false,
    visionEvidence: {
      provider: 'gemini',
      model,
      reason: String(data.reason || '').slice(0, 300),
      attempts,
      ...(rotatedFrom?.length ? { rotatedFrom } : {}),
      ...(safeAttempts?.length ? { attemptLog: safeAttempts } : {}),
    },
  };
}

/** Factory enables deterministic rotation/cooldown unit tests without network calls. */
export function createGeminiClient({ fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(), env = () => process.env } = {}) {
  let cursor = 0;
  let lastPoolSignature = '';
  // Keyed by `${model}#${keyIndex}` -> { until: number, reason: string }
  const cooldowns = new Map();

  function buildSlots(config) {
    const slots = [];
    // Cycle keys for the strongest model first, then step through remaining free models.
    for (const model of config.models) {
      for (let keyIndex = 0; keyIndex < config.keys.length; keyIndex++) {
        slots.push({ id: `${model}#${keyIndex}`, model, keyIndex, key: config.keys[keyIndex] });
      }
    }
    const signature = `${config.models.join(',')}|${config.keys.length}`;
    if (signature !== lastPoolSignature) {
      cursor = 0;
      lastPoolSignature = signature;
      cooldowns.clear();
    }
    return slots;
  }

  function pruneExpired(currentTime) {
    for (const [slotId, entry] of cooldowns) {
      if (entry.until <= currentTime) cooldowns.delete(slotId);
    }
  }

  function markSlotCooldown(slotId, durationMs, reason, currentTime) {
    cooldowns.set(slotId, { until: currentTime + durationMs, reason });
  }

  function markKeyCooldown(slots, keyIndex, durationMs, reason, currentTime) {
    for (const slot of slots) {
      if (slot.keyIndex === keyIndex) markSlotCooldown(slot.id, durationMs, reason, currentTime);
    }
  }

  async function generateStructured({ contents, systemInstruction, schema, maxTokens = 900, timeoutMs, signal, maxRequestBytes = MAX_JSON_REQUEST_BYTES }) {
    const config = geminiConfig(env());
    if (!config.keys.length) {
      throw new GeminiError('configuration', 'Chưa cấu hình GEMINI_API_KEY cho nhà cung cấp Gemini.', 503);
    }
    if (signal?.aborted) {
      throw new GeminiError('aborted', 'Yêu cầu Gemini đã được hủy.', 499);
    }
    const slots = buildSlots(config);
    const totalTimeout = timeoutMs ?? config.timeoutMs;
    const deadline = now() + totalTimeout;
    const payload = {
      ...(systemInstruction ? { systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] } } : {}),
      contents,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: Math.min(4096, Math.max(512, maxTokens)),
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(schema),
      },
    };
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > maxRequestBytes) {
      throw new GeminiError('request_size', 'Ngữ cảnh hoặc ảnh gửi tới Gemini vượt giới hạn kích thước.', 413);
    }

    const rotatedFrom = [];
    const attemptLog = [];
    let attempts = 0;
    let lastError = null;
    const startCursor = cursor % slots.length;
    const failWithLog = err => Object.assign(err, { attemptLog: attemptLog.slice(0, 16) });

    for (let offset = 0; offset < slots.length; offset++) {
      const slotIndex = (startCursor + offset) % slots.length;
      const slot = slots[slotIndex];
      const currentTime = now();
      pruneExpired(currentTime);
      if (cooldowns.has(slot.id)) {
        const entry = cooldowns.get(slot.id);
        attemptLog.push({
          model: slot.model,
          keySlot: `#${slot.keyIndex + 1}`,
          outcome: 'cooldown',
          durationMs: 0,
          detail: `Đang nghỉ ${Math.max(1, Math.ceil((entry.until - currentTime) / 1000))}s (${entry.reason})`,
        });
        continue;
      }

      const remainingMs = deadline - currentTime;
      if (remainingMs <= 50) {
        throw failWithLog(new GeminiError('timeout', 'Gemini phản hồi quá lâu; đang dùng kết quả cục bộ.', 504));
      }
      if (signal?.aborted) {
        throw failWithLog(new GeminiError('aborted', 'Yêu cầu Gemini đã được hủy.', 499));
      }

      attempts++;
      const attemptStart = now();
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const perAttemptMs = Math.min(remainingMs, Math.max(8000, Math.floor(totalTimeout * 0.6)));
      const timer = setTimeout(() => controller.abort(), perAttemptMs);
      timer.unref?.();

      try {
        const url = geminiEndpointUrl(slot.model, config.apiMode);
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': slot.key,
          },
          body: serialized,
          redirect: 'error',
          signal: controller.signal,
        });
        const rawText = await readBounded(response, MAX_RESPONSE_BYTES);
        const finishedTime = now();
        const elapsedMs = Math.max(0, finishedTime - attemptStart);

        if (response.ok) {
          let body;
          try {
            body = JSON.parse(rawText);
          } catch {
            throw new GeminiError('invalid_json', 'Gemini trả về dữ liệu phản hồi không hợp lệ.', 502);
          }
          const candidateText = extractCandidateText(body);
          const data = parseJsonBody(candidateText);
          cursor = config.rotationMode === 'round_robin' ? (slotIndex + 1) % slots.length : slotIndex;
          attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: 'ok', durationMs: elapsedMs, detail: 'HTTP 200 OK' });
          return { data, model: slot.model, attempts, rotatedFrom, attemptLog };
        }

        if (response.status === 429) {
          const delayMs = parseRetryDelayMs(response, rawText, config.cooldownMs, finishedTime);
          markSlotCooldown(slot.id, delayMs, 'rate_limited', finishedTime);
          cursor = (slotIndex + 1) % slots.length;
          rotatedFrom.push(`${slot.model}:429`);
          attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: '429', durationMs: elapsedMs, detail: `Hết hạn mức token/RPM (nghỉ ${Math.ceil(delayMs / 1000)}s) → xoay model` });
          lastError = new GeminiError('rate_limited', 'Model Gemini hiện tại đã chạm hạn mức token/lượt gọi; đang xoay sang model miễn phí khác.', 429);
          continue;
        }
        if ([500, 502, 503, 504].includes(response.status)) {
          markSlotCooldown(slot.id, TRANSIENT_COOLDOWN_MS, `http_${response.status}`, finishedTime);
          cursor = (slotIndex + 1) % slots.length;
          rotatedFrom.push(`${slot.model}:${response.status}`);
          attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: String(response.status), durationMs: elapsedMs, detail: `HTTP ${response.status} quá tải tạm thời → xoay model` });
          lastError = new GeminiError('unavailable', 'Dịch vụ Gemini đang quá tải tạm thời; đã thử xoay model dự phòng.', 503);
          continue;
        }
        if (response.status === 404) {
          markSlotCooldown(slot.id, MISSING_MODEL_COOLDOWN_MS, 'model_missing', finishedTime);
          cursor = (slotIndex + 1) % slots.length;
          rotatedFrom.push(`${slot.model}:404`);
          attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: '404', durationMs: elapsedMs, detail: 'HTTP 404 model không khả dụng → xoay model' });
          lastError = new GeminiError('model_missing', `Model ${slot.model} không còn khả dụng; đã chuyển sang model dự phòng.`, 503);
          continue;
        }
        if ([401, 403].includes(response.status) || (response.status === 400 && /API_KEY_INVALID|API key not valid|API_KEY_SERVICE_BLOCKED|INVALID_ARGUMENT.*key/i.test(rawText))) {
          markKeyCooldown(slots, slot.keyIndex, AUTH_KEY_COOLDOWN_MS, `auth_${response.status}`, finishedTime);
          cursor = (slotIndex + 1) % slots.length;
          rotatedFrom.push(`${slot.model}:${response.status}`);
          attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: `auth_${response.status}`, durationMs: elapsedMs, detail: `HTTP ${response.status} lỗi khóa API → thử khóa khác` });
          lastError = new GeminiError('auth', 'Khóa API Gemini không hợp lệ hoặc không có quyền truy cập model.', 401);
          continue;
        }
        if (response.status === 400) {
          attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: '400', durationMs: elapsedMs, detail: 'HTTP 400 yêu cầu không hợp lệ' });
          throw failWithLog(new GeminiError('bad_request', 'Yêu cầu gửi tới Gemini chưa hợp lệ.', 400));
        }
        attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: String(response.status), durationMs: elapsedMs, detail: `HTTP ${response.status}` });
        throw failWithLog(new GeminiError('unavailable', `Gemini trả về lỗi HTTP ${response.status}.`, 502));
      } catch (error) {
        const elapsedMs = Math.max(0, now() - attemptStart);
        if (error instanceof GeminiError) {
          if (['bad_request', 'request_size', 'response_size', 'aborted'].includes(error.code)) throw failWithLog(error);
          // Incomplete / malformed JSON from one model can rotate once to a backup model.
          if (['invalid_json', 'incomplete'].includes(error.code)) {
            rotatedFrom.push(`${slot.model}:${error.code}`);
            attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: error.code, durationMs: elapsedMs, detail: `${error.message} → xoay model` });
            lastError = error;
            continue;
          }
          throw failWithLog(error);
        }
        if (signal?.aborted) {
          throw failWithLog(new GeminiError('aborted', 'Yêu cầu Gemini đã được hủy.', 499));
        }
        if (controller.signal.aborted) {
          markSlotCooldown(slot.id, TRANSIENT_COOLDOWN_MS, 'timeout', now());
          cursor = (slotIndex + 1) % slots.length;
          rotatedFrom.push(`${slot.model}:timeout`);
          attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: 'timeout', durationMs: elapsedMs, detail: 'Quá thời gian chờ → xoay model' });
          lastError = new GeminiError('timeout', 'Gemini phản hồi quá lâu; đang dùng kết quả cục bộ.', 504);
          continue;
        }
        markSlotCooldown(slot.id, TRANSIENT_COOLDOWN_MS, 'network', now());
        cursor = (slotIndex + 1) % slots.length;
        rotatedFrom.push(`${slot.model}:network`);
        attemptLog.push({ model: slot.model, keySlot: `#${slot.keyIndex + 1}`, outcome: 'network', durationMs: elapsedMs, detail: 'Lỗi kết nối mạng → thử model khác' });
        lastError = new GeminiError('unavailable', 'Chưa kết nối được tới Gemini API.', 503);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }

    if (lastError) {
      if (lastError.code === 'rate_limited') {
        throw failWithLog(new GeminiError('rate_limited', 'Tất cả model Gemini miễn phí đều đã tạm chạm hạn mức token. Đang dùng chế độ cục bộ và sẽ tự xoay lại khi hồi hạn mức.', 429));
      }
      throw failWithLog(lastError);
    }
    throw failWithLog(new GeminiError('rate_limited', 'Tất cả model Gemini miễn phí đang trong thời gian chờ hồi hạn mức token. Đang dùng chế độ cục bộ.', 429));
  }

  async function geminiJson({ system, prompt, schema, maxTokens = 900, timeoutMs, signal } = {}) {
    if (typeof system !== 'string' || typeof prompt !== 'string' || !schema || typeof schema !== 'object') {
      throw new GeminiError('request', 'Thiếu nội dung hoặc schema cho Gemini.', 400);
    }
    return generateStructured({
      systemInstruction: system,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      schema,
      maxTokens,
      timeoutMs,
      signal,
      maxRequestBytes: MAX_JSON_REQUEST_BYTES,
    });
  }

  async function geminiVisionMeter({ bytes, mime = 'image/png', width, height, utility, timeoutMs, signal } = {}) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_VISION_IMAGE_BYTES) {
      throw new GeminiError('request', 'Ảnh gửi tới Gemini Vision không hợp lệ hoặc vượt giới hạn 10 MB.', 400);
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      throw new GeminiError('request', 'Gemini Vision chỉ nhận ảnh PNG, JPEG hoặc WebP.', 415);
    }
    if (!['electric', 'water'].includes(utility)) {
      throw new GeminiError('request', 'Loại công tơ không hợp lệ.', 400);
    }
    const response = await generateStructured({
      systemInstruction: 'Bạn là bộ đề xuất đọc chỉ số công tơ điện/nước cho ứng dụng Trozy. Luôn trung thực, thận trọng: chỉ trả readable=true khi nhìn rõ phần nguyên chỉ số kWh hoặc m³ trên ảnh. Không cần đếm số ô hay số chữ số lẻ. Tuyệt đối không đoán mò. Chỉ trả JSON theo schema.',
      contents: [{
        role: 'user',
        parts: [
          { text: meterVisionPrompt(utility) },
          { inlineData: { mimeType: mime, data: bytes.toString('base64') } },
        ],
      }],
      schema: METER_VISION_SCHEMA,
      maxTokens: 1024,
      timeoutMs,
      signal,
      maxRequestBytes: 16 * 1024 * 1024,
    });
    return normalizeVisionReading(response.data, {
      utility,
      width,
      height,
      model: response.model,
      attempts: response.attempts,
      rotatedFrom: response.rotatedFrom,
      attemptLog: response.attemptLog,
    });
  }

  function getStatus() {
    let config;
    try {
      config = geminiConfig(env());
    } catch (error) {
      return {
        provider: 'gemini',
        available: false,
        model: DEFAULT_GEMINI_MODELS[0],
        modelInstalled: false,
        models: [],
        rotationPool: [],
        availableModels: 0,
        keyCount: 0,
        rotationMode: 'failover',
        message: error.message,
      };
    }
    if (!config.keys.length) {
      return {
        provider: 'gemini',
        available: false,
        model: config.models[0],
        modelInstalled: false,
        models: config.models,
        rotationPool: config.models,
        availableModels: 0,
        keyCount: 0,
        rotationMode: config.rotationMode,
        message: 'Chưa cấu hình GEMINI_API_KEY. Hãy thêm khóa miễn phí từ Google AI Studio vào tệp .env.',
      };
    }
    const slots = buildSlots(config);
    const currentTime = now();
    pruneExpired(currentTime);
    const activeSlot = (() => {
      for (let offset = 0; offset < slots.length; offset++) {
        const slot = slots[(cursor + offset) % slots.length];
        if (!cooldowns.has(slot.id)) return slot;
      }
      return slots[cursor % slots.length];
    })();
    const readySlots = slots.filter(slot => !cooldowns.has(slot.id));
    const readyModelCount = new Set(readySlots.map(slot => slot.model)).size;
    const cooling = [...cooldowns.entries()].map(([slotId, entry]) => ({
      model: slotId.split('#')[0],
      reason: entry.reason,
      retryInSeconds: Math.max(1, Math.ceil((entry.until - currentTime) / 1000)),
    }));
    const available = readySlots.length > 0;
    return {
      provider: 'gemini',
      available,
      model: activeSlot.model,
      modelInstalled: available,
      models: config.models,
      rotationPool: config.models,
      availableModels: readyModelCount,
      keyCount: config.keys.length,
      rotationMode: config.rotationMode,
      ...(cooling.length ? { cooling } : {}),
      message: available
        ? `Gemini API sẵn sàng (${activeSlot.model} · xoay vòng ${readyModelCount}/${config.models.length} model miễn phí).`
        : 'Các model Gemini miễn phí đang tạm chờ hồi hạn mức token; hệ thống tự dùng chế độ cục bộ và tự xoay lại sau ít giây.',
    };
  }

  function resetRotation() {
    cursor = 0;
    cooldowns.clear();
  }

  return { geminiJson, geminiVisionMeter, getStatus, resetRotation };
}

const defaultClient = createGeminiClient();
export const geminiJson = (...args) => defaultClient.geminiJson(...args);
export const geminiVisionMeter = (...args) => defaultClient.geminiVisionMeter(...args);
export const getGeminiStatus = () => defaultClient.getStatus();
export const resetGeminiRotation = () => defaultClient.resetRotation();
