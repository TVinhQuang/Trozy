import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { api } from './api';
import { Field } from './ui';
import type { RecordData } from './types';
import './meter-reader.css';

export type MeterCorners = [number, number][];
export type MeterReaderEngine = 'paddleocr' | 'visionstate';
export type MeterReaderProposal = {
  id: string; fileId: string; submissionVersion: number; status: 'ready' | 'needs_review' | 'retake';
  reading: null | { digits: string; displayText: string; integerDigits: string; fractionalDigits: string; integerValue: number; unit: 'kWh' | 'm3' };
  confidence: number; warnings: string[]; expiresAt: string;
  config: { digits: number; decimals: number; corners: MeterCorners };
  profileSource?: 'confirmed'; profileVersion?: number | null; configNeedsConfirmation?: boolean;
  engine?: MeterReaderEngine; model?: string;
  ocrEvidence?: { scope?: 'automatic' | 'owner-region'; observations: { text: string; confidence: number; corners: MeterCorners; pass: 'full' | 'region' | 'crop' }[]; selectedObservationIndices: number[]; agreement: boolean };
};
type ReaderStatus = { available: boolean; readerAvailable?: boolean; locateAvailable?: boolean; locatorAvailable?: boolean; engine?: MeterReaderEngine; message: string };
type Candidate = { corners: MeterCorners; confidence: number };
const initialCorners = (): MeterCorners => [[.15, .35], [.85, .35], [.85, .65], [.15, .65]];
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const meterReaderEngine = (utility: string): MeterReaderEngine => utility === 'electric' ? 'paddleocr' : 'visionstate';
export function meterProposalMatchesUtility(proposal: MeterReaderProposal, utility: string): boolean {
  return proposal.engine === meterReaderEngine(utility) && proposal.model === (utility === 'electric' ? 'paddleocr-ppocrv6' : 'wheels-v2') && (!proposal.reading || proposal.reading.unit === (utility === 'electric' ? 'kWh' : 'm3'));
}

/** OCR text is one observation of a region, not a probability for each wheel. */
export function MeterOCREvidence({ proposal }: { proposal: MeterReaderProposal }) {
  const evidence = proposal.engine === 'paddleocr' ? proposal.ocrEvidence : null;
  if (!Array.isArray(evidence?.observations) || !evidence.observations.length || !Array.isArray(evidence.selectedObservationIndices)) return null;
  const selected = evidence.selectedObservationIndices.map(index => evidence.observations[index]).filter(observation => observation && typeof observation.text === 'string');
  if (!selected.length) return null;
  return <details className="meter-ocr-evidence"><summary>Văn bản đã nhận dạng</summary><ul>{selected.map((observation, index) => <li key={index}>{observation.pass === 'full' ? 'Ảnh toàn cảnh' : observation.pass === 'region' ? 'Vùng đã chọn' : 'Vùng chỉ số'}: {observation.text}</li>)}</ul><p>Đây là kết quả OCR của vùng chữ số. Hãy đối chiếu từng ô số, đơn vị và phần lẻ trên ảnh gốc.</p></details>;
}

export function validMeterCorners(corners: MeterCorners): boolean {
  if (corners.length !== 4 || corners.some(point => point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 1))) return false;
  const crosses = corners.map((a, index) => { const b = corners[(index + 1) % 4], c = corners[(index + 2) % 4]; return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); });
  const area = Math.abs(corners.reduce((sum, a, index) => { const b = corners[(index + 1) % 4]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
  return area > .00001 && crosses.every(value => value > .0000001);
}

/** Numbered corners retain the reading direction, including vertical counters. */
export function MeterRegionEditor({ imageUrl, corners, onChange, disabled, onImageReady }: { imageUrl: string; corners: MeterCorners; onChange: (corners: MeterCorners) => void; disabled: boolean; onImageReady: (ready: boolean) => void }) {
  const stage = useRef<SVGSVGElement>(null), drag = useRef<{ index: number; pointerId: number } | null>(null);
  const latest = useRef(corners); latest.current = corners;
  function move(index: number, x: number, y: number) { onChange(latest.current.map((point, i) => i === index ? [clamp(x), clamp(y)] : point) as MeterCorners); }
  function point(event: PointerEvent<SVGCircleElement>, index: number) {
    const bounds = stage.current?.getBoundingClientRect();
    if (bounds && bounds.width > 0 && bounds.height > 0) move(index, (event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height);
  }
  function keyboard(event: KeyboardEvent<SVGCircleElement>, index: number) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, direction = directions[event.key];
    if (!direction || disabled) return; event.preventDefault();
    const step = event.shiftKey ? .02 : .005; move(index, corners[index][0] + direction[0] * step, corners[index][1] + direction[1] * step);
  }
  return <div className="meter-region-editor">
    <div className="meter-reader-stage"><img src={imageUrl} alt="Ảnh công tơ đã chuẩn hóa để chọn vùng số" onLoad={() => onImageReady(true)} onError={() => onImageReady(false)} draggable={false} />
      <svg ref={stage} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Vùng hàng số với bốn góc theo thứ tự đọc">
        <polygon points={corners.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} className={validMeterCorners(corners) ? '' : 'invalid'} />
        <line x1={corners[0][0] * 1000} y1={corners[0][1] * 1000} x2={corners[1][0] * 1000} y2={corners[1][1] * 1000} />
        {corners.map(([x, y], index) => <g key={index}><circle className="meter-reader-handle-hit" cx={x * 1000} cy={y * 1000} r="60" role="button" tabIndex={disabled ? -1 : 0} aria-label={`Góc ${index + 1} của vùng số; dùng phím mũi tên để di chuyển`} aria-disabled={disabled}
          onKeyDown={event => keyboard(event, index)} onPointerDown={event => { if (disabled) return; event.preventDefault(); drag.current = { index, pointerId: event.pointerId }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
          onPointerMove={event => { if (disabled || drag.current?.index !== index || drag.current.pointerId !== event.pointerId) return; event.preventDefault(); point(event, index); }}
          onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) { event.currentTarget.releasePointerCapture?.(event.pointerId); drag.current = null; } }} onPointerCancel={() => { drag.current = null; }} />
          <circle className="meter-reader-handle" cx={x * 1000} cy={y * 1000} r="17" aria-hidden="true" /><text x={x * 1000} y={y * 1000} dy="5" textAnchor="middle">{index + 1}</text></g>)}
      </svg>
    </div>
    <p className="form-note">Kéo 4 góc ôm trọn hàng chỉ số, giữ đủ ô cuối. Cạnh 1 → 2 là chiều đọc; 3 và 4 là hai góc phía dưới hàng số. Có thể dùng phím mũi tên hoặc nhập tọa độ bên dưới.</p>
    <div className="inline meter-reader-directions"><button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onChange([corners[3], corners[0], corners[1], corners[2]])}>Đổi chiều đọc 90°</button><button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onChange([corners[2], corners[3], corners[0], corners[1]])}>Đổi chiều đọc 180°</button></div>
    <details><summary>Nhập vị trí bốn góc</summary><div className="meter-reader-coordinates">{corners.map(([x, y], index) => <div className="inline" key={index}><b>Góc {index + 1}</b><Field label={`Góc ${index + 1} · ngang (%)`} type="number" min={0} max={100} step={.1} value={Number((x * 100).toFixed(2))} disabled={disabled} onChange={event => move(index, Number(event.target.value) / 100, y)} /><Field label={`Góc ${index + 1} · dọc (%)`} type="number" min={0} max={100} step={.1} value={Number((y * 100).toFixed(2))} disabled={disabled} onChange={event => move(index, x, Number(event.target.value) / 100)} /></div>)}</div></details>
  </div>;
}

/** Owner-triggered assistance. No recognition or assignment happens on image load. */
export function MeterReaderPanel({ submission, fileId, disabled = false, onApply, onInvalidate }: { submission: RecordData; fileId: string; disabled?: boolean; onApply: (proposal: MeterReaderProposal) => void; onInvalidate: () => void }) {
  const electric = submission.utility === 'electric';
  const [status, setStatus] = useState<ReaderStatus | null>(null), [statusError, setStatusError] = useState(''), [imageReady, setImageReady] = useState(false);
  const [corners, setCorners] = useState<MeterCorners>(initialCorners), [regionChosen, setRegionChosen] = useState(false), [digits, setDigits] = useState(''), [decimals, setDecimals] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]), [proposal, setProposal] = useState<MeterReaderProposal | null>(null), [busy, setBusy] = useState<'locate' | 'read' | null>(null), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null), scope = useRef(0), latestInvalidate = useRef(onInvalidate); latestInvalidate.current = onInvalidate;
  const imageUrl = `/api/meter/submissions/${encodeURIComponent(submission.id)}/image/${encodeURIComponent(fileId)}?version=${encodeURIComponent(submission.version)}`;
  const count = Number(digits), fraction = Number(decimals), configured = digits !== '' && decimals !== '' && Number.isInteger(count) && count >= 1 && count <= 12 && Number.isInteger(fraction) && fraction >= 0 && fraction <= 4 && fraction < count && count - fraction <= 9;
  const available = status?.available === true, locatorAvailable = status?.locatorAvailable ?? status?.locateAvailable ?? false;
  const canRead = available && imageReady && configured && regionChosen && validMeterCorners(corners) && confirmed && !busy && !disabled;
  function invalidate(keepConfirmation = false) { scope.current++; active.current?.abort(); active.current = null; setBusy(null); setProposal(null); if (!keepConfirmation) setConfirmed(false); setError(''); latestInvalidate.current(); }
  function changeRegion(next: MeterCorners) { invalidate(); setCorners(next.map(([x, y]) => [x, y])); setRegionChosen(true); }
  useEffect(() => {
    const request = new AbortController(); let stopped = false;
    setStatus(null); setStatusError(''); setImageReady(false); setCorners(initialCorners()); setRegionChosen(false); setDigits(''); setDecimals(''); setConfirmed(false); setCandidates([]); setProposal(null); setError('');
    scope.current++; latestInvalidate.current();
    void api<ReaderStatus>(`/meter/reader/status?utility=${encodeURIComponent(submission.utility)}`, { signal: request.signal }).then(value => { if (!stopped) { if (value.engine && value.engine !== meterReaderEngine(submission.utility)) setStatusError('Bộ đọc chưa khớp loại công tơ đang xem. Hãy tải lại ứng dụng.'); else setStatus(value); } }).catch(reason => { if (!stopped && !request.signal.aborted) setStatusError((reason as Error).message); });
    return () => { stopped = true; scope.current++; request.abort(); active.current?.abort(); active.current = null; };
  }, [submission.id, submission.version, submission.utility, fileId]);
  useEffect(() => {
    if (!proposal) return;
    const remaining = new Date(proposal.expiresAt).getTime() - Date.now();
    const timeout = setTimeout(() => { setProposal(null); setError('Đề xuất đã hết hạn. Hãy đọc lại vùng ảnh trước khi dùng.'); latestInvalidate.current(); }, Math.max(0, Math.min(remaining, 2147483647)));
    return () => clearTimeout(timeout);
  }, [proposal]);
  async function request(mode: 'locate' | 'read') {
    if (disabled || busy || !imageReady || (mode === 'read' && !canRead)) return;
    invalidate(mode === 'read'); const currentScope = scope.current, controller = new AbortController(); active.current = controller; setBusy(mode);
    const valid = () => !controller.signal.aborted && scope.current === currentScope;
    try {
      const body = { fileId, version: submission.version, ...(mode === 'read' ? { corners, digits: count, decimals: fraction, regionConfirmed: true } : configured ? { digits: count, decimals: fraction } : {}) };
      if (mode === 'locate') {
        const result = await api<{ status: string; candidates: Candidate[]; warnings?: string[] }>(`/meter/submissions/${encodeURIComponent(submission.id)}/locate`, { method: 'POST', signal: controller.signal, body: JSON.stringify(body) });
        if (!valid()) return; const choices = (result.candidates || []).filter(candidate => validMeterCorners(candidate.corners)); setCandidates(choices);
        if (!choices.length) setError(result.warnings?.[0] || 'Chưa tìm được hàng số rõ. Bạn có thể chọn vùng bằng bốn góc trên ảnh.');
      } else {
        const result = await api<{ proposal: MeterReaderProposal }>(`/meter/submissions/${encodeURIComponent(submission.id)}/read`, { method: 'POST', signal: controller.signal, body: JSON.stringify(body) });
        if (!valid()) return;
        const next = result.proposal;
        if (next.fileId !== fileId || next.submissionVersion !== submission.version) throw new Error('Đề xuất không còn khớp ảnh đang xem. Hãy tải lại bộ ảnh.');
        if (!meterProposalMatchesUtility(next, submission.utility)) throw new Error('Đề xuất chưa khớp bộ đọc của công tơ đang xem. Hãy đọc lại ảnh.');
        if (electric && next.status === 'ready' && next.ocrEvidence?.scope !== 'owner-region') throw new Error('Đề xuất chưa khớp vùng chỉ số bạn đã chọn. Hãy đọc lại vùng ảnh.');
        setProposal(next);
      }
    } catch (reason) { if (valid()) setError((reason as Error).message); }
    finally { if (valid()) { setBusy(null); active.current = null; } }
  }
  const ready = proposal?.status === 'ready' && proposal.reading && Date.parse(proposal.expiresAt) > Date.now();
  return <section className="meter-reader-panel stack" aria-label="Đề xuất chỉ số từ vùng ảnh">
    <div><h3>{electric ? 'Đề xuất từ ảnh công tơ điện' : 'Đề xuất từ bánh số nước'}</h3><p className="form-note">Chọn đúng hàng số và cách chia phần lẻ. Bạn sẽ đối chiếu ảnh gốc trước khi dùng đề xuất.</p></div>
    {!status && !statusError && <p className="muted" role="status">Đang kiểm tra bộ đọc ảnh…</p>}
    {(statusError || status && !available) && <p className="form-note" role="status">{statusError || status?.message || 'Bộ đọc ảnh chưa sẵn sàng.'} Bạn vẫn có thể nhập và xác minh chỉ số thủ công bên dưới.</p>}
    {available && <>
      <div className="form-grid"><Field label={electric ? 'Số ô số trên hàng chỉ số' : 'Số bánh số'} type="number" min={1} max={12} step={1} value={digits} disabled={disabled} placeholder={electric ? 'Đếm cả phần lẻ' : 'Đếm cả bánh đỏ'} onChange={event => { invalidate(); setDigits(event.target.value); }} /><Field label="Số chữ số phần lẻ" type="number" min={0} max={4} step={1} value={decimals} disabled={disabled} placeholder="Theo đơn vị trên mặt công tơ" onChange={event => { invalidate(); setDecimals(event.target.value); }} /></div>
      <small className="muted">{electric ? 'Đọc dãy số kWh trên công tơ điện. Nếu ảnh không rõ hoặc có nhiều dãy số, hãy chọn đúng hàng chỉ số và đối chiếu ảnh gốc.' : 'Chỉ dùng cho bánh số cơ. Với LCD/LED hoặc mặt kim, hãy nhập và xác minh thủ công.'}</small>
      <MeterRegionEditor imageUrl={imageUrl} corners={corners} onChange={changeRegion} disabled={disabled} onImageReady={ready => { setImageReady(ready); if (!ready) { invalidate(); setError('Chưa mở được ảnh để chọn vùng. Hãy tải lại bộ ảnh hoặc tiếp tục xác minh thủ công.'); } }} />
      {locatorAvailable && <button type="button" className="btn btn-assistant btn-sm meter-reader-locate" disabled={disabled || busy !== null || !imageReady} onClick={() => void request('locate')}>{busy === 'locate' ? 'Đang tìm vùng…' : 'Tìm vùng số'}</button>}
      {candidates.length > 0 && <div className="stack"><p className="form-note">Chọn một vùng gợi ý rồi kiểm tra lại bốn góc và chiều đọc trên ảnh.</p><div className="inline">{candidates.map((candidate, index) => <button type="button" className="btn btn-sm" disabled={disabled} key={index} onClick={() => changeRegion(candidate.corners)}>Chọn vùng gợi ý {index + 1}</button>)}</div></div>}
      {!validMeterCorners(corners) && <p className="form-error" role="alert">Bốn góc cần tạo thành một vùng không chéo hoặc lật gương. Giữ thứ tự 1 → 2 → 3 → 4 quanh hàng số.</p>}
      <label className="inline"><input type="checkbox" checked={confirmed} disabled={disabled || !!busy || !imageReady || !configured || !regionChosen || !validMeterCorners(corners)} onChange={event => { setConfirmed(event.target.checked); setProposal(null); latestInvalidate.current(); }} />Tôi đã chọn đúng toàn bộ hàng số theo thứ tự đọc</label>
      <button type="button" className="btn btn-assistant" disabled={!canRead} onClick={() => void request('read')}>{busy === 'read' ? 'Đang đọc vùng ảnh…' : 'Đọc vùng đã chọn'}</button>
    </>}
    {proposal && <div className="meter-reader-proposal" role="status">
      {ready && proposal.reading ? <><span>Chỉ số đề xuất</span><strong>{proposal.reading.displayText} {proposal.reading.unit === 'm3' ? 'm³' : 'kWh'}</strong><p>Chỉ số ghi sổ dùng phần nguyên <b>{proposal.reading.integerDigits}</b>. Hãy kiểm tra từng ô số và phần lẻ trên ảnh gốc.</p><MeterOCREvidence proposal={proposal} /><button type="button" className="btn btn-assistant" disabled={disabled || busy !== null} onClick={() => { if (Date.parse(proposal.expiresAt) <= Date.now()) { setError('Đề xuất đã hết hạn. Hãy đọc lại vùng ảnh.'); return; } onApply(proposal); }}>Dùng chỉ số đề xuất</button></> : <><b>{proposal.status === 'retake' ? 'Cần chụp lại hoặc chọn vùng rõ hơn' : 'Chưa đủ rõ để đề xuất chỉ số'}</b><p>Kiểm tra vùng đã chọn, chỉnh lại ảnh hoặc nhập chỉ số thủ công.</p></>}
      {proposal.warnings?.length > 0 && <ul>{proposal.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      {ready && <small>Đây là đề xuất nhận dạng, cần được bạn xác minh trước khi lưu.</small>}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
