import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Archive, ArrowRight, Building2, DoorOpen, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from './context';
import type { RecordData } from './types';
import { Badge, EmptyState, Field, Modal } from './ui';
import './property-manager.css';

type PropertyManagerProps = { mode: 'list' | 'create'; onClose: () => void; onSelect?: (id: string) => void };
type View = { kind: 'list' } | { kind: 'editor'; id: string | null } | { kind: 'confirm'; id: string; action: 'delete' | 'archive' | 'restore' };
type PropertyForm = { name: string; address: string; contact: string; phone: string; floors: string; rules: string };
const blankForm = (): PropertyForm => ({ name: '', address: '', contact: '', phone: '', floors: '1', rules: '' });

/** Owner property controls; the same server rules apply from every entry point. */
export function PropertyManager(props: PropertyManagerProps) {
  const { user } = useApp();
  return user.role === 'landlord' ? <OwnerPropertyManager {...props}/> : null;
}

function OwnerPropertyManager({ mode, onClose, onSelect }: PropertyManagerProps) {
  const { data, user, propertyId, setPropertyId, mutate, remove, navigate, notify } = useApp();
  const [view, setView] = useState<View>(() => mode === 'create' ? { kind: 'editor', id: null } : { kind: 'list' });
  const [form, setForm] = useState<PropertyForm>(blankForm), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const content = useRef<HTMLDivElement>(null), errorRef = useRef<HTMLParagraphElement>(null), mounted = useRef(true), busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setView(mode === 'create' ? { kind: 'editor', id: null } : { kind: 'list' }); setForm(blankForm()); setError(''); }, [mode, user.id]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => content.current?.querySelector<HTMLElement>('[data-manager-focus], input:not(:disabled), textarea:not(:disabled)')?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [view]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const selected = view.kind === 'list' ? null : data.properties.find(property => property.id === view.id);
  const roomCount = (id: string) => data.rooms.filter(room => room.propertyId === id).length;
  const activeCount = data.properties.filter(property => !property.archived).length;
  const sorted = [...data.properties].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || String(a.name).localeCompare(String(b.name), 'vi', { numeric: true }));
  const title = view.kind === 'list' ? 'Danh sách cơ sở của bạn' : view.kind === 'editor' ? view.id ? 'Chỉnh sửa cơ sở' : 'Thêm cơ sở nhà trọ' : view.action === 'delete' ? 'Xóa cơ sở' : view.action === 'archive' ? 'Lưu trữ cơ sở' : 'Khôi phục cơ sở';
  const close = () => { if (!busyRef.current) onClose(); };
  function list() { setError(''); setView({ kind: 'list' }); }
  function edit(property: RecordData | null) {
    setError('');
    setForm(property ? { name: String(property.name || ''), address: String(property.address || ''), contact: String(property.contact || ''), phone: String(property.phone || ''), floors: String(property.floors ?? 1), rules: String(property.rules || '') } : blankForm());
    setView({ kind: 'editor', id: property?.id || null });
  }
  function confirm(property: RecordData, action: 'delete' | 'archive' | 'restore') { setError(''); setView({ kind: 'confirm', id: property.id, action }); }
  function choose(id: string) { (onSelect || setPropertyId)(id); onClose(); }
  function manageRooms(property: RecordData) {
    if (property.archived) return;
    setPropertyId(property.id); navigate('rooms'); onClose();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busyRef.current || view.kind !== 'editor') return;
    setError(''); setBusy(true); busyRef.current = true;
    try {
      if (view.id && !selected) throw new Error('Cơ sở không còn trong danh sách. Quay lại danh sách để kiểm tra.');
      const name = form.name.trim(), address = form.address.trim(), floors = Number(form.floors);
      if (name.length < 2 || name.length > 150) throw new Error('Nhập tên cơ sở từ 2 đến 150 ký tự.');
      if (address.length < 3 || address.length > 500) throw new Error('Nhập địa chỉ từ 3 đến 500 ký tự.');
      if (!Number.isSafeInteger(floors) || floors < 1) throw new Error('Số tầng phải là số nguyên từ 1 trở lên.');
      const created = await mutate('properties', { name, address, contact: form.contact.trim(), phone: form.phone.trim(), floors, rules: form.rules.trim(), ...(view.id ? {} : { archived: false }) }, view.id || undefined);
      if (!mounted.current) return;
      notify(view.id ? 'Đã cập nhật cơ sở.' : 'Đã tạo cơ sở.');
      if (view.id) list();
      else {
        if (typeof created?.id !== 'string' || !created.id) throw new Error('Cơ sở đã được tạo. Quay lại danh sách để mở cơ sở.');
        choose(created.id);
      }
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa lưu được cơ sở. Vui lòng thử lại.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function apply() {
    if (busyRef.current || view.kind !== 'confirm' || !selected) return;
    if (view.action === 'delete' && roomCount(selected.id) > 0) return;
    setError(''); setBusy(true); busyRef.current = true;
    try {
      if (view.action === 'delete') await remove('properties', selected.id);
      else await mutate('properties', { archived: view.action === 'archive' }, selected.id);
      if (!mounted.current) return;
      notify(view.action === 'delete' ? 'Đã xóa cơ sở.' : view.action === 'archive' ? 'Đã lưu trữ cơ sở.' : 'Đã khôi phục cơ sở.');
      list();
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa thực hiện được. Vui lòng thử lại.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  return <Modal title={title} wide onClose={close}>
    <div ref={content} className="property-manager stack" aria-busy={busy}>
      {view.kind === 'list' ? <>
        <div className="property-manager-toolbar"><p className="muted">{data.properties.length} cơ sở · {activeCount} đang hoạt động</p><button className="btn btn-primary" data-manager-focus disabled={busy} onClick={() => edit(null)}><Plus size={17}/>Thêm cơ sở</button></div>
        {sorted.length ? <div className="property-manager-list">{sorted.map(property => <article key={property.id} className={`property-manager-row ${property.id === propertyId ? 'is-selected' : ''}`}>
          <span className="property-manager-icon"><Building2 size={23}/></span>
          <div className="property-manager-information"><h3>{property.name}</h3><p>{property.address || 'Chưa có địa chỉ'}</p><div className="property-manager-meta"><Badge value={property.archived ? 'archived' : 'active'} label={property.archived ? 'Đã lưu trữ' : 'Hoạt động'}/><span>{roomCount(property.id)} phòng</span>{property.id === propertyId && <span>Đang quản lý</span>}</div></div>
          <div className="property-manager-actions">
            <button className="icon-button" aria-label={`Chỉnh sửa cơ sở ${property.name}`} title="Chỉnh sửa" disabled={busy} onClick={() => edit(property)}><Pencil size={17}/></button>
            <button className="icon-button" aria-label={`${property.archived ? 'Khôi phục' : 'Lưu trữ'} cơ sở ${property.name}`} title={property.archived ? 'Khôi phục' : 'Lưu trữ'} disabled={busy} onClick={() => confirm(property, property.archived ? 'restore' : 'archive')}>{property.archived ? <RotateCcw size={17}/> : <Archive size={17}/>}</button>
            <button className="icon-button danger-text" aria-label={`Xóa cơ sở ${property.name}`} title="Xóa" disabled={busy} onClick={() => confirm(property, 'delete')}><Trash2 size={17}/></button>
            {!property.archived && <button className="btn btn-sm" aria-label={`Mở cơ sở ${property.name}`} disabled={busy} onClick={() => choose(property.id)}>Mở<ArrowRight size={16}/></button>}
          </div>
        </article>)}</div> : <EmptyState title="Chưa có cơ sở nhà trọ" description="Thêm tên và địa chỉ cơ sở đầu tiên để bắt đầu quản lý."/>}
        <div className="form-actions"><button className="btn" disabled={busy} onClick={close}>Đóng</button></div>
      </> : view.kind === 'editor' ? <form className="stack" onSubmit={save}>
        <div className="form-grid">
          <Field label="Tên cơ sở" name="name" required minLength={2} maxLength={150} value={form.name} disabled={busy} onChange={event => setForm(old => ({ ...old, name: event.target.value }))}/>
          <Field label="Số tầng" name="floors" type="number" min={1} step={1} required value={form.floors} disabled={busy} onChange={event => setForm(old => ({ ...old, floors: event.target.value }))}/>
          <Field label="Địa chỉ" name="address" required minLength={3} maxLength={500} full value={form.address} disabled={busy} onChange={event => setForm(old => ({ ...old, address: event.target.value }))}/>
          <Field label="Người liên hệ" name="contact" maxLength={150} value={form.contact} disabled={busy} onChange={event => setForm(old => ({ ...old, contact: event.target.value }))}/>
          <Field label="Số điện thoại" name="phone" type="tel" maxLength={30} value={form.phone} disabled={busy} onChange={event => setForm(old => ({ ...old, phone: event.target.value }))}/>
          <Field label="Nội quy" name="rules" type="textarea" full value={form.rules} disabled={busy} onChange={event => setForm(old => ({ ...old, rules: event.target.value }))}/>
        </div>
        {!view.id && <p className="form-note">Sau khi tạo cơ sở, bạn có thể thêm phòng trong mục Phòng trọ.</p>}
        {error && <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>{error}</p>}
        <div className="form-actions"><button type="button" className="btn" disabled={busy} onClick={mode === 'create' && !view.id ? close : list}>{mode === 'create' && !view.id ? 'Hủy' : 'Quay lại danh sách'}</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : view.id ? 'Lưu thay đổi' : 'Tạo cơ sở'}</button></div>
      </form> : <>
        {selected ? <>
          <div className="property-manager-target"><Building2 size={23}/><div><strong>{selected.name}</strong><p className="muted">{selected.address || 'Chưa có địa chỉ'}</p></div></div>
          {view.action === 'delete' && roomCount(selected.id) > 0 ? <>
            <p>Cơ sở có {roomCount(selected.id)} phòng nên chưa thể xóa. Bạn có thể quản lý các phòng hoặc lưu trữ cơ sở để giữ lịch sử.</p>
            {selected.archived && <p className="form-note">Khôi phục cơ sở trước khi mở danh sách phòng.</p>}
            <div className="property-manager-alternatives"><button className="btn" disabled={busy || !!selected.archived} onClick={() => manageRooms(selected)}><DoorOpen size={17}/>Quản lý phòng</button><button className="btn" disabled={busy} onClick={() => confirm(selected, selected.archived ? 'restore' : 'archive')}>{selected.archived ? 'Khôi phục cơ sở' : 'Lưu trữ cơ sở'}</button></div>
          </> : <p>{view.action === 'delete' ? 'Xóa cơ sở này khỏi danh sách? Chỉ cơ sở không có phòng và không có dữ liệu liên quan mới có thể xóa. Thao tác này không thể hoàn tác.' : view.action === 'archive' ? 'Lưu trữ sẽ ẩn cơ sở khỏi danh sách đang quản lý và giữ lại lịch sử. Hãy kết thúc các hợp đồng đang hoạt động trước khi lưu trữ.' : 'Cơ sở sẽ hiển thị lại trong danh sách để bạn tiếp tục quản lý.'}</p>}
          {view.action === 'delete' && roomCount(selected.id) === 0 && <div className="property-manager-alternatives"><button className="btn" disabled={busy} onClick={() => confirm(selected, selected.archived ? 'restore' : 'archive')}>{selected.archived ? 'Khôi phục cơ sở' : 'Lưu trữ cơ sở'}</button><span className="form-note">Giữ lại dữ liệu và lịch sử của cơ sở.</span></div>}
          {error && <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>{error}</p>}
          <div className="form-actions"><button className="btn" data-manager-focus disabled={busy} onClick={list}>Quay lại danh sách</button>{!(view.action === 'delete' && roomCount(selected.id) > 0) && <button className={`btn ${view.action === 'delete' ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={apply}>{busy ? 'Đang xử lý…' : view.action === 'delete' ? 'Xóa cơ sở' : view.action === 'archive' ? 'Lưu trữ' : 'Khôi phục'}</button>}</div>
        </> : <><p role="status">Cơ sở không còn trong danh sách. Hãy kiểm tra danh sách mới nhất.</p><div><button className="btn" data-manager-focus onClick={list}>Quay lại danh sách</button></div></>}
      </>}
    </div>
  </Modal>;
}
