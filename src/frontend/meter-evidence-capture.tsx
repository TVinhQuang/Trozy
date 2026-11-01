import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, RefreshCw, Trash2, Upload } from 'lucide-react';
import { api } from './api';
import { useApp } from './context';
import { MeterCamera } from './meter-camera';

export type MeterCapturedEvidence = { fileId: string; pending?: boolean };
type CapturePhoto = MeterCapturedEvidence & { localId: number; file: File; preview: string; status: 'queued' | 'uploading' | 'done' | 'error'; error?: string; revision: number };
let nextPhoto = 0;

async function uploadMeterImage(file: File, scope: Record<string, string>, signal: AbortSignal) {
  const contents = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Không đọc được ảnh đã chọn.')); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); });
  const result = await api<{ id: string }>('/files', { method: 'POST', signal, body: JSON.stringify({ ...scope, name: file.name, type: file.type, data: contents }) });
  return result.id;
}

/** Capture uploads photo evidence; readings require a separate owner review. */
export function MeterEvidenceCapture({ roomId, period, utility, onChange, disabled = false, owner = false }: { roomId: string; period: string; utility: 'electric' | 'water'; onChange: (photos: MeterCapturedEvidence[]) => void; disabled?: boolean; owner?: boolean }) {
  const { data } = useApp();
  const [photos, setPhotos] = useState<CapturePhoto[]>([]), [error, setError] = useState('');
  const current = useRef<CapturePhoto[]>([]), scope = useRef(0), callback = useRef(onChange), queue = useRef(Promise.resolve()), requests = useRef(new Set<AbortController>()), mounted = useRef(true);
  callback.current = onChange;
  function update(change: (old: CapturePhoto[]) => CapturePhoto[]) {
    if (!mounted.current) return;
    const next = change(current.current); current.current = next; setPhotos(next);
    callback.current(next.map(({ fileId, status }) => ({ fileId, pending: status === 'queued' || status === 'uploading' })));
  }
  function clear() {
    scope.current++; requests.current.forEach(controller => controller.abort()); requests.current.clear();
    current.current.forEach(photo => URL.revokeObjectURL(photo.preview)); current.current = []; queue.current = Promise.resolve();
  }
  useEffect(() => { mounted.current = true; clear(); setPhotos([]); setError(''); callback.current([]); return () => { clear(); mounted.current = false; }; }, [roomId, period, utility]);

  function enqueue(localId: number) {
    const requestScope = scope.current;
    queue.current = queue.current.then(async () => {
      if (!mounted.current || requestScope !== scope.current) return;
      const photo = current.current.find(item => item.localId === localId); if (!photo || photo.status !== 'queued') return;
      const revision = photo.revision, controller = new AbortController(); requests.current.add(controller);
      const valid = () => mounted.current && requestScope === scope.current && current.current.some(item => item.localId === localId && item.revision === revision);
      update(rows => rows.map(item => item.localId === localId ? { ...item, status: 'uploading', error: '' } : item));
      try {
        const room = data.rooms.find(item => item.id === roomId); if (!room) throw Error(owner ? 'Chọn đúng phòng đang quản lý để thêm ảnh.' : 'Chọn đúng phòng đang thuê để gửi ảnh.');
        const fileId = await uploadMeterImage(photo.file, { roomId, propertyId: room.propertyId }, controller.signal);
        if (valid()) update(rows => rows.map(item => item.localId === localId ? { ...item, fileId, status: 'done', error: '' } : item));
      } catch (reason) {
        if (valid() && !controller.signal.aborted) update(rows => rows.map(item => item.localId === localId ? { ...item, status: 'error', error: (reason as Error).message } : item));
      } finally { requests.current.delete(controller); }
    }).catch(() => {});
  }

  function add(file: File) {
    if (disabled) return;
    setError('');
    if (current.current.length >= 3) { setError('Mỗi lần gửi tối đa 3 ảnh. Xóa một ảnh để chụp lại.'); return; }
    const limit = owner ? 3 : 5;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > limit * 1024 * 1024) { setError(`Chọn JPG, PNG hoặc WebP có dữ liệu, tối đa ${limit} MB mỗi ảnh.`); return; }
    const localId = ++nextPhoto;
    update(rows => [...rows, { localId, file, preview: URL.createObjectURL(file), fileId: '', status: 'queued', revision: 0 }]);
    enqueue(localId);
  }

  return <section className="meter-evidence-capture stack" aria-label={`Chụp và gửi ảnh công tơ ${utility === 'electric' ? 'điện' : 'nước'}`}>
    <p className="form-note">{owner ? 'Chụp rõ cả hàng số và đơn vị. Sau khi tạo bộ ảnh, hệ thống tự đọc với thiết lập công tơ đã xác nhận; bạn đối chiếu ảnh và xác minh chỉ số.' : 'Chụp rõ cả hàng số và đơn vị trên công tơ. Bạn chỉ gửi ảnh; chủ nhà sẽ xem ảnh gốc và xác minh chỉ số.'}</p>
    <MeterCamera key={`${roomId}:${period}:${utility}`} disabled={disabled || photos.length >= 3} onCapture={add} />
    <label className="upload-box"><Upload size={20} /><strong>Chọn ảnh có sẵn</strong><span className="muted">Tối đa 3 ảnh · JPG, PNG, WebP · mỗi ảnh tối đa {owner ? 3 : 5} MB</span><input type="file" className="sr-only" aria-label={owner ? 'Ảnh công tơ chủ nhà cần xác minh' : 'Ảnh công tơ để gửi chủ nhà'} accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || photos.length >= 3} onChange={event => { Array.from(event.target.files || []).forEach(file => add(file)); event.target.value = ''; }} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="meter-capture-photos">{photos.map((photo, index) => <article key={photo.localId} className="meter-capture-photo" aria-label={`Ảnh công tơ ${index + 1}`}>
      <div className="toolbar"><b>Ảnh {index + 1}</b><button type="button" className="icon-button" aria-label={`Xóa ảnh ${index + 1}`} disabled={disabled} onClick={() => { URL.revokeObjectURL(photo.preview); update(rows => rows.filter(item => item.localId !== photo.localId)); }}><Trash2 size={17} /></button></div>
      <div className="meter-capture-preview"><img src={photo.preview} alt={`Ảnh chụp công tơ ${index + 1}`} /></div>
      {(photo.status === 'queued' || photo.status === 'uploading') && <p className="inline" role="status"><LoaderCircle size={16} className="spin" />{photo.status === 'queued' ? 'Đang chờ tải ảnh…' : 'Đang tải ảnh…'}</p>}
      {photo.status === 'done' && <p className="success-text" role="status"><CheckCircle2 size={16} />Ảnh sẵn sàng gửi</p>}
      {photo.error && <p className="form-error" role="alert">{photo.error}</p>}
      {photo.status === 'error' && <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => { update(rows => rows.map(item => item.localId === photo.localId ? { ...item, status: 'queued', revision: item.revision + 1 } : item)); enqueue(photo.localId); }}><RefreshCw size={15} />Tải lại ảnh {index + 1}</button>}
    </article>)}</div>
  </section>;
}
