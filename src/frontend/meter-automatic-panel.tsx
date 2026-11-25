import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, number } from './api';
import { useApp } from './context';
import { Field } from './ui';
import { MeterOCREvidence, meterProposalMatchesUtility, meterReaderEngine, scheduleMeterProposalExpiry, type MeterReaderEngine, type MeterReaderProposal } from './meter-reader-panel';
import type { RecordData } from './types';
import './meter-reader.css';

export type MeterProfile = {
  id: string; roomId: string; utility: 'electric' | 'water'; digits: number; decimals: number;
  meterType: 'mechanical'; version: number; confirmed: true; reader: 'visionstate-v2' | 'meter-reader-v3'; engine: MeterReaderEngine;
};
export type MeterPipelineStep = {
  stage: string; label: string; engine: string | null; model: string | null;
  status: 'ok' | 'miss' | 'skipped' | 'error'; durationMs: number;
  reading: string | null; summary: string; details: string[];
};
export type MeterAutomaticResult = {
  status: string; proposal: MeterReaderProposal | null; reason?: string; profile: MeterProfile | null;
  fileId: string; submissionVersion: number; usage?: MeterUsagePreview | null;
  trace?: MeterPipelineStep[] | null;
};
export type MeterUsagePreview = {
  status: 'available' | 'missing_baseline' | 'decreased'; previousValue: number | null;
  proposedValue: number | null; consumption: number | null; unit: 'kWh' | 'm3';
  baselineSource: 'previous-reading' | 'handover' | null;
};
const pending = (status?: string) => status === 'queued' || status === 'processing';

/** Image-derived layouts can be reviewed without a separately configured meter. */
export function meterAutomaticResultMatches(result: MeterAutomaticResult, submission: RecordData, fileId: string) {
  const proposal = result.proposal;
  if (result.fileId !== fileId || result.submissionVersion !== submission.version || proposal && (proposal.fileId !== fileId || proposal.submissionVersion !== submission.version)) return false;
  if (result.status !== 'ready') return true;
  if (!proposal || !meterProposalMatchesUtility(proposal, submission.utility) || proposal.configNeedsConfirmation !== false) return false;
  if (proposal.engine === 'gemini-vision') {
    return proposal.visionEvidence?.provider === 'gemini' && proposal.profileSource === 'gemini-vision';
  }
  if (submission.utility === 'electric' && proposal.ocrEvidence?.scope !== 'automatic') return false;
  if (proposal.profileSource === 'image') {
    const evidence = proposal.layoutEvidence;
    const profile = result.profile, matchesProfile = profile ? profile.confirmed === true && ['visionstate-v2', 'meter-reader-v3'].includes(profile.reader) && profile.engine === meterReaderEngine(submission.utility) && profile.roomId === submission.roomId && profile.utility === submission.utility && profile.meterType === 'mechanical' && proposal.profileVersion === profile.version && proposal.config.digits === profile.digits && proposal.config.decimals === profile.decimals : proposal.profileVersion == null;
    return matchesProfile && evidence?.version === 1 && evidence.source === 'image' && evidence.complete === true && ['red-suffix', 'printed-decimal'].includes(evidence.method) && evidence.digits === proposal.config.digits && evidence.decimals === proposal.config.decimals;
  }
  const profile = result.profile;
  return proposal.profileSource === 'confirmed' && profile?.confirmed === true && ['visionstate-v2', 'meter-reader-v3'].includes(profile.reader) && profile.engine === meterReaderEngine(submission.utility) && profile.roomId === submission.roomId && profile.utility === submission.utility && profile.meterType === 'mechanical' && proposal.profileVersion === profile.version && proposal.config.digits === profile.digits && proposal.config.decimals === profile.decimals;
}

const TRACE_STATUS_LABEL: Record<MeterPipelineStep['status'], string> = {
  ok: 'Đạt',
  miss: 'Chưa rõ',
  skipped: 'Bỏ qua',
  error: 'Lỗi',
};

function formatTraceMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export function MeterPipelineTrace({ trace }: { trace?: MeterPipelineStep[] | null }) {
  if (!Array.isArray(trace) || !trace.length) return null;
  return <details className="meter-pipeline-trace" open>
    <summary>Quy trình đọc số từng bước ({trace.length} bước)</summary>
    <ol className="meter-trace-steps">
      {trace.map((step, index) => <li className="meter-trace-step" key={`${step.stage}-${index}`}>
        <div className="meter-trace-head">
          <div className="meter-trace-title">
            <span className={`meter-trace-pill ${step.status}`}>{TRACE_STATUS_LABEL[step.status] || step.status}</span>
            <strong>{step.label}</strong>
            {step.model && <span className="meter-trace-model">{step.model}</span>}
          </div>
          <span className="meter-trace-time">{formatTraceMs(step.durationMs)}</span>
        </div>
        <p className="meter-trace-summary">
          {step.summary}
          {step.reading ? <> · <span className="meter-trace-reading">{step.reading}</span></> : null}
        </p>
        {Array.isArray(step.details) && step.details.length > 0 && <ul className="meter-trace-details">
          {step.details.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}
        </ul>}
      </li>)}
    </ol>
  </details>;
}

export function MeterUsageSummary({ usage, compact = false }: { usage: MeterUsagePreview | null | undefined; compact?: boolean }) {
  if (!usage) return null;
  const unit = usage.unit === 'kWh' ? 'kWh' : 'm³';
  if (usage.status === 'missing_baseline') return <p className="form-note">Chưa có chỉ số đầu kỳ đã xác minh để tính lượng dùng.</p>;
  if (usage.status === 'decreased') return <p className="form-error">Chỉ số đề xuất thấp hơn đầu kỳ {usage.previousValue == null ? '' : `${number(usage.previousValue)} ${unit}`}. Cần kiểm tra lại ảnh hoặc công tơ.</p>;
  if (usage.status !== 'available' || usage.previousValue == null || usage.proposedValue == null || usage.consumption == null || ![usage.previousValue, usage.proposedValue, usage.consumption].every(value => Number.isFinite(value) && value >= 0)) return null;
  if (compact) return <p className="meter-usage-compact"><b>Dự kiến dùng {number(usage.consumption)} {unit}</b><span>Đầu kỳ {number(usage.previousValue)} → đề xuất ghi {number(usage.proposedValue)}</span></p>;
  return <div className="meter-usage-preview"><dl><div><dt>Đầu kỳ đã xác minh</dt><dd>{number(usage.previousValue)} {unit}</dd></div><div><dt>Cuối kỳ đề xuất ghi</dt><dd>{number(usage.proposedValue)} {unit}</dd></div><div><dt>Lượng dùng dự kiến</dt><dd>{number(usage.consumption)} {unit}</dd></div></dl><small>Tính theo phần nguyên dùng để ghi sổ. Chờ bạn đối chiếu ảnh và xác minh.</small></div>;
}

/** Background recognition proposes a reading; applying and verifying it stay explicit. */
export function MeterAutomaticPanel({ submission, fileId, disabled = false, onApply, onInvalidate }: {
  submission: RecordData; fileId: string; disabled?: boolean;
  onApply: (proposal: MeterReaderProposal) => void; onInvalidate: () => void;
}) {
  const { user, propertyId } = useApp();
  const [result, setResult] = useState<MeterAutomaticResult | null>(null), [error, setError] = useState('');
  const [digits, setDigits] = useState(''), [decimals, setDecimals] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const latestInvalidate = useRef(onInvalidate); latestInvalidate.current = onInvalidate;
  const scope = useRef(0), activeGet = useRef<AbortController | null>(null), activeWrite = useRef<AbortController | null>(null), saving = useRef(false);
  const previous = useRef(''), previousProfile = useRef('');
  const count = Number(digits), fraction = Number(decimals), unit = submission.utility === 'electric' ? 'kWh' : 'm³';
  const electric = submission.utility === 'electric';
  const configured = digits !== '' && decimals !== '' && Number.isInteger(count) && count >= 1 && count <= 12 && Number.isInteger(fraction) && fraction >= 0 && fraction <= 4 && fraction < count && count - fraction <= 9;
  const base = `/meter/submissions/${encodeURIComponent(submission.id)}/automatic`;

  useEffect(() => {
    const currentScope = ++scope.current;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
    setResult(null); setError('');
    const visible = () => typeof document === 'undefined' || !document.hidden;
    function clearTimer() { if (timer) clearTimeout(timer); timer = undefined; }
    function later(delay = 2500) { clearTimer(); if (!stopped && visible()) timer = setTimeout(() => void load(), delay); }
    async function load() {
      if (stopped || !visible() || activeGet.current) return;
      if (saving.current) { later(); return; }
      const controller = new AbortController(); activeGet.current = controller;
      const valid = () => !stopped && !controller.signal.aborted && scope.current === currentScope && activeGet.current === controller;
      try {
        const next = await api<MeterAutomaticResult>(`${base}?fileId=${encodeURIComponent(fileId)}`, { signal: controller.signal });
        if (!valid()) return;
        if (!meterAutomaticResultMatches(next, submission, fileId)) throw new Error('Kết quả hoặc bằng chứng nhận dạng không còn khớp công tơ đang xem. Hãy đọc tự động lại.');
        const signature = `${next.status}:${next.proposal?.id || ''}:${next.profile?.version || ''}:${next.profile?.engine || ''}`;
        if (previous.current !== signature) { latestInvalidate.current(); previous.current = signature; }
        const profileSignature = next.profile ? `${next.profile.id}:${next.profile.version}` : '';
        if (previousProfile.current !== profileSignature) {
          setDigits(next.profile ? String(next.profile.digits) : ''); setDecimals(next.profile ? String(next.profile.decimals) : ''); setConfirmed(false); previousProfile.current = profileSignature;
        }
        setResult(next); setError('');
        later(pending(next.status) ? 2500 : 15000);
      } catch (reason) {
        if (valid()) { setResult(null); latestInvalidate.current(); setError((reason as Error).message); later(15000); }
      } finally { if (activeGet.current === controller) activeGet.current = null; }
    }
    function visibility() {
      clearTimer();
      if (!visible()) { activeGet.current?.abort(); activeGet.current = null; }
      else void load();
    }
    void load(); document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; clearTimer(); activeGet.current?.abort(); activeGet.current = null; activeWrite.current?.abort(); activeWrite.current = null; saving.current = false; document.removeEventListener('visibilitychange', visibility); };
  }, [submission.id, submission.version, submission.roomId, submission.utility, fileId, user.id, propertyId, refresh]);

  useEffect(() => {
    previous.current = ''; previousProfile.current = '';
    setDigits(''); setDecimals(''); setConfirmed(false); setSetupOpen(false); setBusy(false); latestInvalidate.current();
  }, [submission.id, submission.version, fileId, user.id, propertyId]);

  useEffect(() => {
    if (!result?.proposal) return;
    return scheduleMeterProposalExpiry(result.proposal.expiresAt, () => {
      setResult(current => current ? { ...current, status: 'expired', proposal: null } : current);
      latestInvalidate.current();
    });
  }, [result?.proposal]);

  async function update(mode: 'profile' | 'retry', event?: FormEvent) {
    event?.preventDefault();
    if (disabled || busy || mode === 'profile' && (!configured || !confirmed)) return;
    const currentScope = scope.current, controller = new AbortController();
    activeWrite.current?.abort(); activeWrite.current = controller; activeGet.current?.abort(); activeGet.current = null; saving.current = true;
    setBusy(true); setError(''); latestInvalidate.current(); setResult(current => current ? { ...current, proposal: null } : current);
    const valid = () => !controller.signal.aborted && scope.current === currentScope;
    let savedProfile: MeterProfile | null = null;
    try {
      if (mode === 'profile') {
        const saved = await api<{ profile: MeterProfile }>('/meter/profile', { method: 'PUT', signal: controller.signal, body: JSON.stringify({ roomId: submission.roomId, utility: submission.utility, digits: count, decimals: fraction, meterType: 'mechanical', confirmed: true, ...(result?.profile ? { version: result.profile.version } : {}) }) });
        if (!valid()) return;
        savedProfile = saved.profile;
        setResult({ status: 'queued', proposal: null, profile: saved.profile, fileId, submissionVersion: submission.version });
      }
      await api(`${base}/retry`, { method: 'POST', signal: controller.signal, body: JSON.stringify({ fileId, version: submission.version }) });
      if (!valid()) return;
      setSetupOpen(false); setConfirmed(false); setRefresh(value => value + 1);
    } catch (reason) { if (valid()) { setError((reason as Error).message); if (savedProfile) { setSetupOpen(false); setResult({ status: 'unavailable', proposal: null, profile: savedProfile, fileId, submissionVersion: submission.version }); } } }
    finally { if (valid()) { setBusy(false); saving.current = false; activeWrite.current = null; } }
  }
  const proposal = result?.proposal;
  const ready = result?.status === 'ready' && proposal?.status === 'ready' && !!proposal.reading && Date.parse(proposal.expiresAt) > Date.now();
  const needsSetup = result?.status === 'needs_setup';
  const showSetup = setupOpen;
  const message = !result ? 'Đang kiểm tra kết quả đọc tự động…'
    : result.status === 'queued' ? 'Ảnh đang chờ đọc tự động. Bạn có thể tiếp tục xác minh thủ công bên dưới.'
      : result.status === 'processing' ? 'Đang tự tìm vùng số và đọc ảnh công tơ…'
        : needsSetup ? 'Chưa xác định rõ cách chia phần nguyên và phần lẻ trên ảnh. Bạn có thể đọc lại, chỉnh vùng hoặc xác minh thủ công.'
          : result.status === 'expired' ? 'Đề xuất đã hết hạn. Hãy đọc tự động lại hoặc xác minh thủ công.'
            : result.status === 'retake' ? 'Ảnh chưa đủ rõ. Bạn có thể chỉnh vùng, xác minh thủ công hoặc yêu cầu chụp lại.'
              : 'Chưa có đề xuất đủ rõ. Bạn vẫn có thể xác minh chỉ số thủ công.';
  return <section className="meter-reader-panel meter-automatic-panel stack" aria-label="Đọc công tơ tự động">
    <div><h3>Kết quả đọc tự động</h3><p className="form-note">Ảnh được xử lý sau khi gửi. Bạn đối chiếu ảnh gốc và xác minh chỉ số trước khi lưu.</p></div>
    {!ready && !error && <p className="form-note" role="status">{message}</p>}
    {showSetup && <form className="meter-profile-setup stack" onSubmit={event => void update('profile', event)}>
      <div><h4>Bổ sung cách đọc công tơ</h4><p className="form-note">Chỉ cần bổ sung khi hệ thống chưa xác định được cấu tạo từ ảnh. Kiểm tra đơn vị {unit}, toàn bộ hàng số và vị trí phần lẻ trên mặt công tơ.</p></div>
      <div className="form-grid"><Field label={electric ? 'Số ô số trên hàng chỉ số (kể cả phần lẻ)' : 'Số bánh số (kể cả bánh đỏ)'} type="number" min={1} max={12} step={1} value={digits} disabled={disabled || busy} onChange={event => { setDigits(event.target.value); setConfirmed(false); }} /><Field label={`Số chữ số phần lẻ theo ${unit}`} type="number" min={0} max={4} step={1} value={decimals} disabled={disabled || busy} onChange={event => { setDecimals(event.target.value); setConfirmed(false); }} /></div>
      <label className="inline"><input type="checkbox" checked={confirmed} disabled={disabled || busy || !configured} onChange={event => setConfirmed(event.target.checked)} />{electric ? 'Tôi đã kiểm tra số ô số và vị trí phần lẻ trên mặt công tơ' : 'Tôi đã kiểm tra số bánh số và vị trí phần lẻ trên mặt công tơ'}</label>
      <div className="inline"><button className="btn btn-assistant" disabled={disabled || busy || !configured || !confirmed}>{busy ? 'Đang lưu thiết lập…' : 'Lưu thiết lập & đọc tự động'}</button><button type="button" className="btn" disabled={disabled || busy} onClick={() => setSetupOpen(false)}>Hủy thay đổi</button></div>
      <small className="muted">{electric ? 'Chỉ đếm dãy chỉ số kWh cần ghi, không đếm số sê-ri hoặc thông số khác.' : 'Với LCD/LED hoặc mặt kim, hãy dùng xác minh thủ công bên dưới.'}</small>
    </form>}
    {ready && proposal?.reading && <div className="meter-reader-proposal" role="status"><span>Chỉ số trên ảnh đề xuất</span><strong>{proposal.reading.displayText} {unit}</strong><MeterUsageSummary usage={result?.usage} /><p>Ghi sổ phần nguyên <b>{proposal.reading.integerDigits}</b>. Hãy đối chiếu từng ô số và phần lẻ trên ảnh gốc.</p><MeterOCREvidence proposal={proposal} />
      {!!proposal.warnings?.length && <ul>{proposal.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      <button type="button" className="btn btn-assistant" disabled={disabled || busy || showSetup} onClick={() => { if (Date.parse(proposal.expiresAt) > Date.now()) onApply(proposal); }}>Dùng chỉ số đề xuất</button><small>Đề xuất chưa được ghi vào chỉ số hoặc hóa đơn.</small>
    </div>}
    {!ready && result?.reason && !needsSetup && <p className="form-note">{result.reason}</p>}
    <MeterPipelineTrace trace={result?.trace} />
    {error && <p className="form-error" role="alert">{error} Bạn vẫn có thể nhập và xác minh thủ công.</p>}
    {!pending(result?.status) && !showSetup && <div className="inline meter-automatic-actions"><button type="button" className="btn btn-assistant btn-sm" disabled={disabled || busy} onClick={() => void update('retry')}>{busy ? 'Đang yêu cầu đọc…' : 'Đọc tự động lại'}</button><button type="button" className="btn btn-sm" disabled={disabled || busy} aria-expanded={showSetup} onClick={() => { setSetupOpen(true); setConfirmed(false); }}>{result?.profile ? 'Đổi thiết lập công tơ' : 'Bổ sung cách đọc công tơ'}</button></div>}
  </section>;
}
