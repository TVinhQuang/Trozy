import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { useApp } from './context';
import { Field } from './ui';
import { MeterOCREvidence, meterProposalMatchesUtility, meterReaderEngine, type MeterReaderEngine, type MeterReaderProposal } from './meter-reader-panel';
import type { RecordData } from './types';
import './meter-reader.css';

export type MeterProfile = {
  id: string; roomId: string; utility: 'electric' | 'water'; digits: number; decimals: number;
  meterType: 'mechanical'; version: number; confirmed: true; reader: 'visionstate-v2' | 'meter-reader-v3'; engine: MeterReaderEngine;
};
export type MeterAutomaticResult = {
  status: string; proposal: MeterReaderProposal | null; reason?: string; profile: MeterProfile | null;
  fileId: string; submissionVersion: number;
};
const pending = (status?: string) => status === 'queued' || status === 'processing';

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
        if (next.fileId !== fileId || next.submissionVersion !== submission.version || next.proposal && (next.proposal.fileId !== fileId || next.proposal.submissionVersion !== submission.version)) throw new Error('Kết quả không còn khớp ảnh đang xem. Hãy tải lại bộ ảnh.');
        if (next.proposal && next.profile && next.proposal.profileVersion != null && next.proposal.profileVersion !== next.profile.version) throw new Error('Thiết lập công tơ đã thay đổi. Hãy đọc tự động lại.');
        if (next.status === 'ready' && (!next.profile?.confirmed || !['visionstate-v2', 'meter-reader-v3'].includes(next.profile.reader) || next.profile.engine !== meterReaderEngine(submission.utility) || next.profile.roomId !== submission.roomId || next.profile.utility !== submission.utility || next.profile.meterType !== 'mechanical' || next.proposal?.profileSource !== 'confirmed' || next.proposal.profileVersion !== next.profile.version || next.proposal.configNeedsConfirmation !== false || next.proposal.config.digits !== next.profile.digits || next.proposal.config.decimals !== next.profile.decimals || !meterProposalMatchesUtility(next.proposal, submission.utility) || electric && next.proposal.ocrEvidence?.scope !== 'automatic')) throw new Error('Đề xuất chưa khớp thiết lập hoặc bộ đọc của công tơ đang xem. Hãy kiểm tra thiết lập và đọc lại.');
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
    const expires = Date.parse(result.proposal.expiresAt);
    const timeout = setTimeout(() => {
      setResult(current => current ? { ...current, status: 'expired', proposal: null } : current);
      latestInvalidate.current();
    }, Number.isFinite(expires) ? Math.max(0, Math.min(expires - Date.now(), 2147483647)) : 0);
    return () => clearTimeout(timeout);
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
  const showSetup = needsSetup || setupOpen;
  const message = !result ? 'Đang kiểm tra kết quả đọc tự động…'
    : result.status === 'queued' ? 'Ảnh đang chờ đọc tự động. Bạn có thể tiếp tục xác minh thủ công bên dưới.'
      : result.status === 'processing' ? 'Đang tự tìm vùng số và đọc ảnh công tơ…'
        : needsSetup ? 'Xác nhận cấu tạo công tơ một lần cho phòng này. Những ảnh sau sẽ được đọc tự động với thiết lập đã lưu.'
          : result.status === 'expired' ? 'Đề xuất đã hết hạn. Hãy đọc tự động lại hoặc xác minh thủ công.'
            : result.status === 'retake' ? 'Ảnh chưa đủ rõ. Bạn có thể chỉnh vùng, xác minh thủ công hoặc yêu cầu chụp lại.'
              : 'Chưa có đề xuất đủ rõ. Bạn vẫn có thể xác minh chỉ số thủ công.';
  return <section className="meter-reader-panel meter-automatic-panel stack" aria-label="Đọc công tơ tự động">
    <div><h3>Đọc công tơ tự động</h3><p className="form-note">{electric ? 'Đọc dãy số điện bằng PaddleOCR.' : 'Tìm vùng số nước bằng YOLO và đọc bánh số bằng VisionState.'} Bạn đối chiếu ảnh rồi xác minh trước khi lưu.</p></div>
    {!ready && !error && <p className="form-note" role="status">{message}</p>}
    {result?.profile && !showSetup && <div className="meter-profile-summary"><small>Thiết lập đã xác nhận: {result.profile.digits} {electric ? 'ô số' : 'bánh số'} · {result.profile.decimals} số lẻ · {unit}</small><button type="button" className="btn btn-warning btn-sm" disabled={disabled || busy} onClick={() => { setSetupOpen(true); setConfirmed(false); }}>Đổi thiết lập công tơ</button></div>}
    {showSetup && <form className="meter-profile-setup stack" onSubmit={event => void update('profile', event)}>
      <div><h4>Thiết lập công tơ một lần</h4><p className="form-note">Theo đơn vị {unit} trên mặt công tơ. Thiết lập chỉ lưu số {electric ? 'ô số' : 'bánh số'} và phần lẻ cho công tơ {electric ? 'điện' : 'nước'} của phòng này; vùng ảnh được tìm lại ở mỗi lần chụp.</p></div>
      <div className="form-grid"><Field label={electric ? 'Số ô số trên hàng chỉ số (kể cả phần lẻ)' : 'Số bánh số (kể cả bánh đỏ)'} type="number" min={1} max={12} step={1} value={digits} disabled={disabled || busy} onChange={event => { setDigits(event.target.value); setConfirmed(false); }} /><Field label={`Số chữ số phần lẻ theo ${unit}`} type="number" min={0} max={4} step={1} value={decimals} disabled={disabled || busy} onChange={event => { setDecimals(event.target.value); setConfirmed(false); }} /></div>
      <label className="inline"><input type="checkbox" checked={confirmed} disabled={disabled || busy || !configured} onChange={event => setConfirmed(event.target.checked)} />{electric ? 'Tôi đã kiểm tra số ô số và vị trí phần lẻ trên mặt công tơ' : 'Tôi đã kiểm tra số bánh số và vị trí phần lẻ trên mặt công tơ'}</label>
      <div className="inline"><button className="btn btn-assistant" disabled={disabled || busy || !configured || !confirmed}>{busy ? 'Đang lưu thiết lập…' : 'Lưu thiết lập & đọc tự động'}</button>{!needsSetup && <button type="button" className="btn" disabled={disabled || busy} onClick={() => setSetupOpen(false)}>Hủy thay đổi</button>}</div>
      <small className="muted">{electric ? 'Chỉ đếm dãy chỉ số kWh cần ghi, không đếm số sê-ri hoặc thông số khác.' : 'Với LCD/LED hoặc mặt kim, hãy dùng xác minh thủ công bên dưới.'}</small>
    </form>}
    {ready && proposal?.reading && <div className="meter-reader-proposal" role="status"><span>Chỉ số đề xuất</span><strong>{proposal.reading.displayText} {unit}</strong><p>Ghi sổ phần nguyên <b>{proposal.reading.integerDigits}</b>. Hãy đối chiếu từng ô số và phần lẻ trên ảnh gốc.</p><MeterOCREvidence proposal={proposal} />
      {!!proposal.warnings?.length && <ul>{proposal.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      <button type="button" className="btn btn-assistant" disabled={disabled || busy || showSetup} onClick={() => { if (Date.parse(proposal.expiresAt) > Date.now()) onApply(proposal); }}>Dùng chỉ số đề xuất</button><small>Đề xuất chưa được ghi vào chỉ số hoặc hóa đơn.</small>
    </div>}
    {!ready && result?.reason && !needsSetup && <p className="form-note">{result.reason}</p>}
    {error && <p className="form-error" role="alert">{error} Bạn vẫn có thể nhập và xác minh thủ công.</p>}
    {!pending(result?.status) && !needsSetup && !showSetup && <button type="button" className="btn btn-assistant btn-sm" disabled={disabled || busy} onClick={() => void update('retry')}>{busy ? 'Đang yêu cầu đọc…' : 'Đọc tự động lại'}</button>}
  </section>;
}
