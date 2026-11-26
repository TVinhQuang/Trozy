import { useId, useState } from 'react';
import { Modal } from './ui';

const guideTitle = 'Thêm Trozy vào màn hình chính';

function InstallInstructions() {
  const group = useId();
  const [device, setDevice] = useState(() => /Android/i.test(navigator.userAgent) ? 'Android' : 'iPhone');
  return <div className="install-instructions">
    <fieldset className="install-device">
      <legend className="sr-only">Chọn điện thoại của bạn</legend>
      {['iPhone', 'Android'].map(name => <label key={name}>
        <input className="sr-only" type="radio" name={group} checked={device === name} onChange={() => setDevice(name)}/>
        <span>{name}</span>
      </label>)}
    </fieldset>
    {device === 'iPhone'
      ? <ol>
          <li>Mở Trozy bằng <strong>Safari</strong> trên iPhone.</li>
          <li>Nhấn <strong>Chia sẻ</strong>, rồi chọn <strong>Thêm vào Màn hình chính</strong>. Nếu chưa thấy nút Chia sẻ, hãy mở menu của trang.</li>
          <li>Bật <strong>Mở dưới dạng ứng dụng web</strong> nếu có, rồi nhấn <strong>Thêm</strong>.</li>
        </ol>
      : <ol>
          <li>Mở Trozy bằng <strong>Chrome</strong> trên điện thoại Android.</li>
          <li>Nhấn nút ba chấm <strong>⋮</strong>, rồi chọn <strong>Cài đặt và tạo lối tắt</strong> hoặc <strong>Thêm vào màn hình chính</strong>.</li>
          <li>Chọn <strong>Cài đặt</strong> hoặc <strong>Thêm</strong> khi Chrome hỏi xác nhận.</li>
        </ol>}
  </div>;
}

export function InstallHelp() {
  return <details className="install-help">
    <summary>Cách thêm Trozy vào màn hình chính</summary>
    <InstallInstructions/>
  </details>;
}

export function InstallWelcome({ userId }: { userId: string }) {
  const key = 'trozy.install-guide.' + userId;
  const [open, setOpen] = useState(() => {
    if (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone) return false;
    try { return localStorage.getItem(key) !== 'dismissed'; }
    catch { return true; }
  });
  function dismiss() {
    setOpen(false);
    try { localStorage.setItem(key, 'dismissed'); }
    catch { /* The guide can still be closed when browser storage is unavailable. */ }
  }
  if (!open) return null;
  return <Modal title={guideTitle} onClose={dismiss}>
    <div className="install-intro">
      <img src="/icons/apple-touch-icon.png?v=2" width="60" height="60" alt=""/>
      <p>Lần sau, bạn chỉ cần chạm vào biểu tượng Trozy trên điện thoại để mở ứng dụng.</p>
    </div>
    <InstallInstructions/>
    <div className="form-actions"><button className="btn btn-primary" onClick={dismiss}>Đã hiểu</button></div>
  </Modal>;
}
