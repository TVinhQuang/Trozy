import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { api, date, today } from './api';
import { useApp } from './context';
import { Badge, Field, Modal } from './ui';
import { MeterEvidenceCapture, type MeterCapturedEvidence } from './meter-evidence-capture';
import { MeterReaderPanel, meterProposalMatchesUtility, type MeterReaderProposal } from './meter-reader-panel';
import { MeterAutomaticPanel } from './meter-automatic-panel';
import type { RecordData } from './types';

const label = (utility: string) => utility === 'electric' ? 'điện' : 'nước';
const unit = (utility: string) => utility === 'electric' ? 'kWh' : 'm³';
const statusLabels: Record<string, string> = { processing: 'Chờ chủ nhà xác minh', pending: 'Chờ chủ nhà xác minh', approved: 'Đã xác minh', rejected: 'Cần chụp lại' };
const waiting = (row: RecordData) => ['processing', 'pending'].includes(row.status);
function nextPeriod(period: string) { const [year, month] = period.split('-').map(Number); return `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`; }

/** Captures are submitted evidence; an owner review is the only write to readings. */
export function MeterSubmissionsPanel() {
  const { data, user, propertyId, refresh, notify } = useApp(), landlord = user.role === 'landlord';
  const tenant = data.tenants.find(row => row.id === user.tenantId || row.userId === user.id), room = data.rooms.find(row => row.id === tenant?.roomId);
  const last = data.readings.filter(row => row.roomId === room?.id && row.confirmed).sort((a, b) => b.period.localeCompare(a.period))[0];
  const defaultPeriod = last?.period >= today().slice(0, 7) ? nextPeriod(last.period) : today().slice(0, 7);
  const [capture, setCapture] = useState<'electric' | 'water' | null>(null), [period, setPeriod] = useState(defaultPeriod), [photos, setPhotos] = useState<MeterCapturedEvidence[]>([]), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState<RecordData | null>(null), [filter, setFilter] = useState('pending');
  const [ownerCapture, setOwnerCapture] = useState(false);
  const rows = (data.meterSubmissions || []).filter(row => !propertyId || row.propertyId === propertyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const eligible = photos.filter(photo => photo.fileId && !photo.pending), uploading = photos.some(photo => photo.pending);
  useEffect(() => { setCapture(null); setOwnerCapture(false); setSelected(null); setPhotos([]); setError(''); }, [user.id, propertyId, room?.id]);
  async function send(event: FormEvent) {
    event.preventDefault(); if (!room || !capture || !eligible.length || !period || uploading) return; setBusy(true); setError('');
    try {
      await api('/meter/submissions', { method: 'POST', body: JSON.stringify({ roomId: room.id, period, utility: capture, photos: eligible.map(photo => ({ fileId: photo.fileId })), note }) });
      await refresh(); setCapture(null); setPhotos([]); notify('Đã gửi ảnh cho chủ nhà để xem và xác minh chỉ số.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <section className="card meter-submissions"><div className="card-header"><div><h2>{landlord ? 'Ảnh công tơ cần xác minh' : 'Chụp và gửi ảnh công tơ'}</h2><p>{landlord ? 'Mở ảnh người thuê gửi hoặc thêm ảnh của bạn để nhận đề xuất và xác minh.' : 'Chụp rõ công tơ và gửi ảnh để chủ nhà xem và xác minh chỉ số.'}</p></div><div className="inline">{landlord ? <><button className="btn btn-assistant btn-sm" onClick={() => setOwnerCapture(true)}><Camera size={16} />Đọc ảnh công tơ</button><button className="btn btn-warning btn-sm" onClick={() => void refresh().catch(reason => notify(reason.message, 'error'))}><RefreshCw size={15} />Tải lại</button></> : room && tenant?.status === 'active' ? (['electric', 'water'] as const).map(utility => <button key={utility} className="btn btn-sm" onClick={() => { setPeriod(defaultPeriod); setCapture(utility); setPhotos([]); setNote(''); setError(''); }}><Camera size={16} />Chụp {label(utility)}</button>) : <span className="muted">Cần liên kết phòng đang thuê để gửi ảnh.</span>}</div></div>
    <div className="card-body stack"><div className="tabs">{[['pending', 'Chờ xác minh'], ['all', 'Tất cả']].map(([value, text]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{text}{value === 'pending' ? ` (${rows.filter(waiting).length})` : ''}</button>)}</div>
      {rows.filter(row => filter === 'all' || waiting(row)).slice(0, 30).map(row => <div className="meter-submission-row" key={row.id}><div><strong>Phòng {data.rooms.find(item => item.id === row.roomId)?.code || '—'} · {label(row.utility)} · {row.period}</strong><small className="muted block">{landlord ? `${row.submittedByName || 'Người thuê'} · ` : ''}{date(row.createdAt)} · {row.photos.length} ảnh</small><Badge value={row.status === 'approved' ? 'confirmed' : row.status === 'rejected' ? 'overdue' : 'draft'} label={statusLabels[row.status]} />{landlord && row.reviewNote && <p>{row.reviewNote}</p>}</div><button className="btn btn-sm" onClick={() => setSelected(row)}>{landlord && waiting(row) ? 'Xem ảnh & xác minh' : landlord ? 'Xem ảnh' : 'Xem ảnh đã gửi'}</button></div>)}
      {!rows.some(row => filter === 'all' || waiting(row)) && <p className="muted">{filter === 'pending' ? 'Chưa có bộ ảnh chờ xác minh.' : 'Chưa có ảnh công tơ được gửi.'}</p>}
      <small className="muted">Mỗi công tơ gửi tối đa 3 ảnh. Chủ nhà xem ảnh gốc và xác minh trước khi lưu chỉ số.</small>
    </div>
    {capture && room && <Modal title={`Chụp công tơ ${label(capture)} · phòng ${room.code}`} wide onClose={() => { if (!busy) setCapture(null); }}><form className="stack" onSubmit={send}>
      <Field label="Kỳ gửi ảnh" type="month" required value={period} disabled={busy} onChange={event => { setPeriod(event.target.value); setPhotos([]); setError(''); }} />
      <MeterEvidenceCapture key={`${room.id}-${period}-${capture}`} roomId={room.id} period={period} utility={capture} onChange={setPhotos} disabled={busy} />
      <Field label="Ghi chú cho chủ nhà (không bắt buộc)" type="textarea" value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="btn" disabled={busy} onClick={() => setCapture(null)}>Hủy</button><button className="btn btn-primary" disabled={busy || uploading || !eligible.length || !period}>{busy ? 'Đang gửi…' : `Gửi ${eligible.length || ''} ảnh cho chủ nhà`}</button></div>
    </form></Modal>}
    {landlord && ownerCapture && <OwnerMeterEvidenceEntry onClose={() => setOwnerCapture(false)} onCreated={async row => { setOwnerCapture(false); setSelected(row); await refresh().catch(reason => notify(reason.message, 'error')); }} />}
    {selected && <MeterSubmissionReview submission={rows.find(row => row.id === selected.id) || selected} onClose={() => setSelected(null)} onSaved={async () => { await refresh(); setSelected(null); }} />}
  </section>;
}

/** Owner uploads follow the same reviewed-evidence flow; creation cannot set a reading. */
export function OwnerMeterEvidenceEntry({ onClose, onCreated }: { onClose: () => void; onCreated: (submission: RecordData) => Promise<void> }) {
  const { data, propertyId } = useApp();
  const rooms = data.rooms.filter(row => (!propertyId || row.propertyId === propertyId) && !data.properties.find(item => item.id === row.propertyId)?.archived);
  function suggestedPeriod(roomId: string) { const latest = data.readings.filter(row => row.roomId === roomId && row.confirmed).sort((a, b) => b.period.localeCompare(a.period))[0]; return latest?.period >= today().slice(0, 7) ? nextPeriod(latest.period) : today().slice(0, 7); }
  const [roomId, setRoomId] = useState(rooms[0]?.id || ''), [period, setPeriod] = useState(suggestedPeriod(rooms[0]?.id || '')), [utility, setUtility] = useState<'electric' | 'water'>('electric'), [photos, setPhotos] = useState<MeterCapturedEvidence[]>([]), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true), request = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const uploading = photos.some(photo => photo.pending), eligible = photos.filter(photo => photo.fileId && !photo.pending);
  async function create(event: FormEvent) {
    event.preventDefault(); if (!roomId || !period || uploading || !eligible.length || busy) return;
    setBusy(true); setError(''); const controller = new AbortController(); request.current = controller;
    try {
      const row = await api<RecordData>('/meter/owner-evidence', { method: 'POST', signal: controller.signal, body: JSON.stringify({ roomId, period, utility, photos: eligible.map(photo => ({ fileId: photo.fileId })), note }) });
      if (mounted.current && !controller.signal.aborted) await onCreated(row);
    } catch (reason) { if (mounted.current && !controller.signal.aborted) setError((reason as Error).message); } finally { if (mounted.current) setBusy(false); request.current = null; }
  }
  return <Modal title="Đọc ảnh công tơ của chủ nhà" wide onClose={() => { if (!busy) onClose(); }}><form className="stack" onSubmit={create}>
    <p className="form-note">Tạo bộ ảnh cho đúng phòng và kỳ. Hệ thống tự tìm vùng số và đề xuất chỉ số với thiết lập công tơ đã xác nhận; bạn đối chiếu ảnh trước khi lưu.</p>
    <div className="form-grid"><Field label="Phòng của ảnh công tơ" type="select" value={roomId} required disabled={busy} onChange={event => { setRoomId(event.target.value); setPeriod(suggestedPeriod(event.target.value)); setPhotos([]); setError(''); }}><option value="">Chọn phòng</option>{rooms.map(room => <option value={room.id} key={room.id}>Phòng {room.code} · {data.properties.find(row => row.id === room.propertyId)?.name}</option>)}</Field><Field label="Kỳ của ảnh công tơ" type="month" value={period} required disabled={busy} onChange={event => { setPeriod(event.target.value); setPhotos([]); setError(''); }} /><Field label="Loại công tơ trong ảnh" type="select" value={utility} disabled={busy} onChange={event => { setUtility(event.target.value as 'electric' | 'water'); setPhotos([]); setError(''); }} options={[{ value: 'electric', label: 'Điện · kWh' }, { value: 'water', label: 'Nước · m³' }]} /></div>
    {roomId ? <MeterEvidenceCapture key={`${roomId}-${period}-${utility}`} roomId={roomId} period={period} utility={utility} owner onChange={setPhotos} disabled={busy} /> : <p className="muted">Chọn một phòng đang quản lý để thêm ảnh.</p>}
    <Field label="Ghi chú bộ ảnh (không bắt buộc)" type="textarea" value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} />
    {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Hủy</button><button className="btn btn-assistant" disabled={busy || !roomId || !period || uploading || !eligible.length}>{busy ? 'Đang tạo bộ ảnh…' : 'Tạo bộ ảnh & đọc tự động'}</button></div>
  </form></Modal>;
}

export function MeterSubmissionReview({ submission, onClose, onSaved }: { submission: RecordData; onClose: () => void; onSaved: () => Promise<void> }) {
  const { user } = useApp();
  return user.role === 'landlord' ? <OwnerMeterSubmissionReview submission={submission} onClose={onClose} onSaved={onSaved} /> : <TenantMeterReceipt submission={submission} onClose={onClose} />;
}

function TenantMeterReceipt({ submission, onClose }: { submission: RecordData; onClose: () => void }) {
  return <Modal title={`Ảnh công tơ ${label(submission.utility)} đã gửi · ${submission.period}`} wide onClose={onClose}><div className="stack">
    <p>{statusLabels[submission.status] || 'Đã gửi ảnh'}. {submission.status === 'rejected' ? 'Vui lòng chụp rõ lại công tơ và gửi ảnh mới.' : 'Chủ nhà sẽ xem xét ảnh và xác minh chỉ số.'}</p>
    {submission.photos.map((photo: any, index: number) => <a key={photo.fileId || index} href={`/api/files/${encodeURIComponent(photo.fileId)}?inline=1`} target="_blank" rel="noreferrer"><img className="meter-review-original" src={`/api/files/${encodeURIComponent(photo.fileId)}?inline=1`} alt={`Ảnh công tơ ${label(submission.utility)} đã gửi ${index + 1}`} /></a>)}
  </div></Modal>;
}

function OwnerMeterSubmissionReview({ submission, onClose, onSaved }: { submission: RecordData; onClose: () => void; onSaved: () => Promise<void> }) {
  const { data, notify, user, propertyId } = useApp();
  const [fileId, setFileId] = useState(submission.selectedFileId || submission.photos[0]?.fileId || ''), [value, setValue] = useState(''), [note, setNote] = useState(''), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [readerOpen, setReaderOpen] = useState(false), [applied, setApplied] = useState<MeterReaderProposal | null>(null), [fractionalChecked, setFractionalChecked] = useState(false);
  const appliedRef = useRef(applied); appliedRef.current = applied;
  const photo = submission.photos.find((item: any) => item.fileId === fileId) || submission.photos[0];
  useEffect(() => { setValue(''); setChecked(false); setNote(''); setError(''); setApplied(null); setFractionalChecked(false); setReaderOpen(false); }, [fileId, submission.id, submission.version, user.id, propertyId]);
  useEffect(() => { setFileId(submission.selectedFileId || submission.photos[0]?.fileId || ''); }, [submission.id, submission.version]);
  const invalidateProposal = useCallback(() => { if (appliedRef.current) setValue(''); setApplied(null); setFractionalChecked(false); setChecked(false); }, []);
  useEffect(() => {
    if (!applied) return;
    const remaining = Date.parse(applied.expiresAt) - Date.now(), timeout = setTimeout(invalidateProposal, Math.max(0, Math.min(remaining, 2147483647)));
    return () => clearTimeout(timeout);
  }, [applied, invalidateProposal]);
  function applyProposal(proposal: MeterReaderProposal) {
    if (proposal.status !== 'ready' || !proposal.reading || !meterProposalMatchesUtility(proposal, submission.utility) || proposal.fileId !== photo?.fileId || proposal.submissionVersion !== submission.version || Date.parse(proposal.expiresAt) <= Date.now()) return;
    setApplied(proposal); setValue(String(proposal.reading.integerValue)); setChecked(false); setFractionalChecked(false); setError('');
  }
  const current = data.readings.find(row => row.roomId === submission.roomId && row.period === submission.period), noteLength = note.trim().length;
  async function review(decision: 'approve' | 'reject') {
    setBusy(true); setError('');
    try {
      if (decision === 'approve' && applied && (Date.parse(applied.expiresAt) <= Date.now() || applied.fileId !== photo?.fileId || applied.submissionVersion !== submission.version)) { invalidateProposal(); throw new Error('Đề xuất đã hết hạn hoặc ảnh đã thay đổi. Hãy đọc lại hoặc nhập chỉ số thủ công.'); }
      const body = decision === 'reject' ? { decision, version: submission.version, note } : { decision, version: submission.version, value: Number(value), note, imageChecked: checked, selectedFileId: photo?.fileId, readingUpdatedAt: current?.updatedAt || null, ...(applied ? { proposalId: applied.id, fractionalChecked } : {}) };
      await api(`/meter/submissions/${encodeURIComponent(submission.id)}/review`, { method: 'POST', body: JSON.stringify(body) }); await onSaved(); notify(decision === 'reject' ? 'Đã yêu cầu người thuê chụp lại.' : 'Đã xác minh công tơ. Kỳ chỉ số được chốt sau khi cả điện và nước được kiểm tra.');
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={`Minh chứng ${label(submission.utility)} · ${submission.period}`} wide onClose={() => { if (!busy) onClose(); }}><div className="stack">
    <div className="inline">{submission.photos.map((item: any, index: number) => <button className={`btn btn-sm ${fileId === item.fileId ? 'btn-primary' : ''}`} key={item.fileId || index} disabled={busy} onClick={() => setFileId(item.fileId)}>Ảnh {index + 1}</button>)}</div>
    {photo && <a href={`/api/files/${encodeURIComponent(photo.fileId)}?inline=1`} target="_blank" rel="noreferrer"><img className="meter-review-original" src={`/api/files/${encodeURIComponent(photo.fileId)}?inline=1`} alt={`Ảnh gốc công tơ ${label(submission.utility)} ${submission.source === 'owner' ? 'của chủ nhà' : 'do người thuê gửi'}`} /></a>}
    <small className="muted">Nhấn ảnh để mở bản gốc. Đối chiếu đủ từng ô số, đơn vị và vị trí phần lẻ.</small>
    {submission.note && <p><b>{submission.source === 'owner' ? 'Ghi chú bộ ảnh:' : 'Người thuê ghi chú:'}</b> {submission.note}</p>}
    {waiting(submission) ? <>
      {photo && <>
        <MeterAutomaticPanel key={`automatic-${user.id}-${propertyId}-${submission.id}-${submission.version}-${photo.fileId}`} submission={submission} fileId={photo.fileId} disabled={busy} onApply={applyProposal} onInvalidate={invalidateProposal} />
        <div className="meter-manual-fallback"><button type="button" className="btn btn-warning btn-sm" aria-expanded={readerOpen} disabled={busy} onClick={() => { invalidateProposal(); setReaderOpen(open => !open); }}>Chỉnh vùng / đọc thủ công</button>{readerOpen && <MeterReaderPanel key={`${user.id}-${propertyId}-${submission.id}-${submission.version}-${photo.fileId}`} submission={submission} fileId={photo.fileId} disabled={busy} onApply={applyProposal} onInvalidate={invalidateProposal} />}</div>
      </>}
      <Field label={`Chỉ số ${label(submission.utility)} xác minh (${unit(submission.utility)}, phần nguyên)`} type="number" min={0} max={999999999} step={1} value={value} disabled={busy} onChange={event => { setValue(event.target.value); setChecked(false); setApplied(null); setFractionalChecked(false); }} />
      {applied?.reading && <div className="meter-reader-applied">Đang dùng phần nguyên từ đề xuất <b>{applied.reading.displayText} {unit(submission.utility)}</b>. Chỉnh sửa chỉ số sẽ chuyển sang xác minh thủ công.{applied.reading.fractionalDigits !== '' && <label className="inline"><input type="checkbox" checked={fractionalChecked} disabled={busy} onChange={event => setFractionalChecked(event.target.checked)} />Tôi đã kiểm tra phần lẻ và chỉ dùng phần nguyên để ghi chỉ số</label>}</div>}
      <label className="inline"><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} />Tôi đã đối chiếu từng ô số, đơn vị và cách chia phần nguyên/phần lẻ trên ảnh gốc</label>
      <Field label="Ghi chú xác minh hoặc lý do yêu cầu chụp lại (ít nhất 10 ký tự)" type="textarea" value={note} maxLength={1000} disabled={busy} placeholder="Ví dụ: Đã đối chiếu đầy đủ dãy số và đơn vị trên ảnh gốc." hint={noteLength < 10 ? `Cần thêm ${10 - noteLength} ký tự trong ghi chú (hiện có ${noteLength}/10, không tính khoảng trắng ở đầu/cuối). Khi yêu cầu chụp lại, không cần nhập chỉ số hoặc tích ô xác minh.` : undefined} onChange={event => setNote(event.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="btn btn-warning" disabled={busy || noteLength < 10} onClick={() => void review('reject')}>Yêu cầu chụp lại</button><button className="btn btn-success" disabled={busy || !photo || !checked || !!(applied?.reading?.fractionalDigits && !fractionalChecked) || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 999999999 || noteLength < 10} onClick={() => void review('approve')}>{busy ? 'Đang lưu…' : 'Xác minh chỉ số này'}</button></div>
    </> : <p className="muted">{statusLabels[submission.status]}{submission.verifiedValue !== undefined ? ` · ${submission.verifiedValue} ${unit(submission.utility)}` : ''}{submission.reviewNote ? ` · ${submission.reviewNote}` : ''}</p>}
  </div></Modal>;
}
