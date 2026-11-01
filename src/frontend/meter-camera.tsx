import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { analyzeMeterPixels, type MeterImageQuality } from '../shared/meter-image-quality.mjs';
import { cameraCounterRectangle, cameraLumaSample, cameraMotion, cameraReadiness, emptyCameraReadiness, type MeterCaptureRectangle } from './meter-capture-quality';
import { Field } from './ui';

export function MeterCamera({ onCapture, disabled = false }: { onCapture: (file: File, rectangle: MeterCaptureRectangle) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [opening, setOpening] = useState(false), [capturing, setCapturing] = useState(false), [error, setError] = useState(''), [quality, setQuality] = useState<MeterImageQuality | null>(null), [ready, setReady] = useState(false), [rowCenter, setRowCenter] = useState(.5), [rowWidth, setRowWidth] = useState(.8), [guide, setGuide] = useState<MeterCaptureRectangle | null>(null), [size, setSize] = useState({ width: 0, height: 0 });
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0), hold = useRef(emptyCameraReadiness()), previous = useRef<number[] | null>(null), available = useRef(false), disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  function resetReadiness() { hold.current = emptyCameraReadiness(); previous.current = null; available.current = false; setReady(false); setQuality(null); }
  function stop() {
    generation.current++; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
    available.current = false; hold.current = emptyCameraReadiness(); previous.current = null;
  }
  function close() { stop(); setOpen(false); setOpening(false); setCapturing(false); setReady(false); setQuality(null); }
  useEffect(() => () => stop(), []);
  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => { resetReadiness(); }, [rowCenter, rowWidth]);
  useEffect(() => {
    if (!open || opening) return;
    const canvas = document.createElement('canvas');
    const check = () => {
      const current = video.current;
      if (!current || current.readyState < 2 || current.videoWidth < 1 || current.videoHeight < 1 || !stream.current?.active || document.visibilityState === 'hidden') { available.current = false; hold.current = emptyCameraReadiness(); previous.current = null; setReady(false); return; }
      const scale = Math.min(1, 960 / current.videoWidth, 960 / current.videoHeight);
      canvas.width = Math.max(1, Math.round(current.videoWidth * scale)); canvas.height = Math.max(1, Math.round(current.videoHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return;
      try {
        context.drawImage(current, 0, 0, canvas.width, canvas.height);
        const rect = cameraCounterRectangle(canvas.width, canvas.height, rowCenter, rowWidth), pixels = context.getImageData(rect.left, rect.top, rect.width, rect.height);
        const measured = analyzeMeterPixels({ data: pixels.data, width: rect.width, height: rect.height, channels: 4 }, { scope: 'counter' });
        const sample = cameraLumaSample(pixels.data), motion = cameraMotion(previous.current, sample); previous.current = sample;
        hold.current = cameraReadiness(hold.current, measured, motion, Date.now()); available.current = hold.current.ready;
        setQuality(measured); setReady(hold.current.ready); setGuide(rect); setSize({ width: canvas.width, height: canvas.height });
      } catch { resetReadiness(); setError('Chưa đo được chất lượng khung hình. Hãy thử mở lại camera hoặc chọn ảnh có sẵn.'); }
    };
    const interval = window.setInterval(check, 250);
    const hidden = () => { if (document.visibilityState === 'hidden') { close(); setError('Camera đã tắt khi bạn rời màn hình. Mở lại để chụp tiếp.'); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', hidden); };
  }, [open, opening, rowCenter, rowWidth]);

  async function start() {
    setError(''); resetReadiness();
    if (window.isSecureContext === false || !navigator.mediaDevices?.getUserMedia) { setError('Camera trong web cần HTTPS hoặc localhost và quyền truy cập camera. Bạn vẫn có thể chọn ảnh có sẵn bên dưới.'); return; }
    stop(); const request = generation.current; setOpen(true); setOpening(true);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (request !== generation.current || disabledRef.current) { next.getTracks().forEach(track => track.stop()); return; }
      stream.current = next;
      next.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (stream.current === next) { close(); setError('Camera đã ngắt kết nối. Bạn có thể mở lại hoặc chọn ảnh có sẵn.'); } }, { once: true }));
      if (video.current) { video.current.srcObject = next; await video.current.play().catch(() => {}); }
    } catch (reason) {
      if (request === generation.current) { stop(); setOpen(false); setOpening(false); setError((reason as Error).name === 'NotAllowedError' ? 'Chưa được cấp quyền camera. Hãy cấp quyền trong trình duyệt hoặc chọn ảnh có sẵn.' : 'Không mở được camera. Kiểm tra thiết bị hoặc chọn ảnh có sẵn.'); }
    } finally { if (request === generation.current) setOpening(false); }
  }

  async function capture() {
    const current = video.current;
    if (!available.current || disabledRef.current || capturing || !current || !stream.current?.active) return;
    const request = generation.current; setCapturing(true); available.current = false; setReady(false);
    try {
      const scale = Math.min(1, 1920 / current.videoWidth, 1920 / current.videoHeight), canvas = document.createElement('canvas');
      canvas.width = Math.round(current.videoWidth * scale); canvas.height = Math.round(current.videoHeight * scale);
      const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw Error('Thiết bị chưa hỗ trợ chụp ảnh.');
      context.drawImage(current, 0, 0, canvas.width, canvas.height);
      const rectangle = cameraCounterRectangle(canvas.width, canvas.height, rowCenter, rowWidth), pixels = context.getImageData(rectangle.left, rectangle.top, rectangle.width, rectangle.height);
      const measured = analyzeMeterPixels({ data: pixels.data, width: rectangle.width, height: rectangle.height, channels: 4 }, { scope: 'counter' });
      if (measured.status !== 'pass') { setQuality(measured); throw Error('Khung hình vừa thay đổi hoặc chưa đủ rõ. Giữ máy ổn định rồi chụp lại.'); }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('Không tạo được ảnh chụp.')), 'image/jpeg', .94));
      if (request !== generation.current || disabledRef.current) return;
      if (blob.size > 5 * 1024 * 1024) throw Error('Ảnh chụp vượt quá 5 MB. Hãy giảm độ phân giải camera.');
      onCapture(new File([blob], `cong-to-${Date.now()}.jpg`, { type: 'image/jpeg' }), rectangle); setError('');
    } catch (reason) { if (request === generation.current) setError((reason as Error).message); }
    finally { if (request === generation.current) { setCapturing(false); resetReadiness(); } }
  }

  return <section className="meter-camera" aria-label="Chụp ảnh công tơ có kiểm tra độ nét">
    {!open ? <button type="button" className="btn" disabled={disabled} onClick={start}><Camera size={17} />Mở camera để chụp</button> : <>
      <div className="toolbar"><b>Đặt cả hàng số và trọng số vào khung</b><button type="button" className="icon-button" aria-label="Tắt camera" onClick={close}><X size={18} /></button></div>
      <div className="meter-camera-stage"><video ref={video} autoPlay muted playsInline aria-label="Camera công tơ trực tiếp" />{guide && size.width > 0 && <svg viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect x={guide.left} y={guide.top} width={guide.width} height={guide.height} className={ready ? 'ready' : ''} /></svg>}</div>
      <div className="form-grid"><Field label="Vị trí khung số" type="range" min={.15} max={.85} step={.01} value={rowCenter} onChange={event => setRowCenter(Number(event.target.value))} /><Field label="Chiều rộng khung số" type="range" min={.45} max={.95} step={.01} value={rowWidth} onChange={event => setRowWidth(Number(event.target.value))} /></div>
      <div role="status" className={`meter-camera-status ${ready ? 'ready' : ''}`}>{opening ? <><LoaderCircle size={16} className="spin" />Đang mở camera…</> : ready ? <><CheckCircle2 size={16} />Đủ nét và ổn định để chụp</> : quality?.status === 'retake' ? quality.reasons.join(' ') : 'Giữ yên máy khoảng một giây để kiểm tra độ nét.'}</div>
      <button type="button" className="btn btn-primary" disabled={disabled || opening || capturing || !ready} onClick={capture}><Camera size={17} />{capturing ? 'Đang chụp…' : 'Chụp ảnh đủ nét'}</button>
      <p className="form-note">Kiểm tra trực tiếp đo độ nét, ánh sáng và độ ổn định. Chủ nhà sẽ đối chiếu ảnh gốc để xác minh chỉ số; kiểm tra độ nét không đọc các chữ số.</p>
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
