import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, Check, CheckCheck, Copy, Download, FileText, KeyRound, Landmark, Plus, ReceiptText, Send, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { api, date, download, money, today } from '../api';
import { useApp, useRecords } from '../context';
import type { PageId, RecordData } from '../types';
import { Badge, DataTable, EmptyState, EntityPage, Modal, PageHeader, type FieldDefinition } from '../ui';

type Option = { value: string; label: string };
type FormValues = Record<string, any>;
type FormDialogProps = { title: string; fields: FieldDefinition[]; initial?: FormValues; description?: ReactNode; submitLabel?: string; onClose: () => void; onSubmit: (values: FormValues) => Promise<unknown> };

function FormDialog({ title, fields, initial = {}, description, submitLabel = 'Lưu thông tin', onClose, onSubmit }: FormDialogProps) {
  const [values, setValues] = useState<FormValues>(() => Object.fromEntries(fields.map(field => [field.name, initial[field.name] ?? field.defaultValue ?? (field.type === 'checkbox' ? false : '')])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      const payload = { ...values };
      for (const field of fields) if (field.type === 'number' && payload[field.name] !== '') payload[field.name] = Number(payload[field.name]);
      await onSubmit(payload); onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể lưu thông tin.'); }
    finally { setSaving(false); }
  }
  return <Modal title={title} onClose={onClose} wide={fields.length > 5}>
    <form onSubmit={submit} className="stack">
      {description && <div className="muted">{description}</div>}
      <div className="form-grid">{fields.map(field => {
        const id = `tenancy-${field.name}`;
        const controlProps = { id, name: field.name, required: field.required, disabled: saving, value: values[field.name] ?? '', onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues(old => ({ ...old, [field.name]: event.target.value })) };
        return <div className={`field${field.full ? ' field-full' : ''}`} key={field.name}>
          {field.type === 'checkbox' ? <label className="inline"><input id={id} name={field.name} type="checkbox" checked={!!values[field.name]} disabled={saving} onChange={event => setValues(old => ({ ...old, [field.name]: event.target.checked }))}/>{field.label}</label> : <>
            <label htmlFor={id}>{field.label}{field.required && <span className="required"> *</span>}</label>
            {field.type === 'select' ? <select {...controlProps}><option value="">Chọn {field.label.toLocaleLowerCase('vi')}</option>{field.options?.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea {...controlProps} rows={4}/> : <input {...controlProps} type={field.type || 'text'} min={field.min} step={field.type === 'number' ? (field.step ?? 1) : undefined}/>}
          </>}
        </div>;
      })}</div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Huỷ</button><button type="submit" className={`btn ${submitLabel.startsWith('Gửi') || submitLabel.startsWith('Đặt') ? 'btn-primary' : 'btn-success'}`} disabled={saving}>{saving ? 'Đang lưu…' : submitLabel}</button></div>
    </form>
  </Modal>;
}

function ConfirmDialog({ title, children, actionLabel, onClose, onConfirm, danger = false }: { title: string; children: ReactNode; actionLabel: string; onClose: () => void; onConfirm: () => Promise<unknown>; danger?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Modal title={title} onClose={onClose}><div className="stack">{children}{error && <div className="form-error" role="alert">{error}</div>}<div className="form-actions"><button className="btn btn-secondary" onClick={onClose} disabled={busy}>Huỷ</button><button className={`btn ${danger ? 'btn-danger' : 'btn-success'}`} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(); onClose(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể thực hiện.'); } finally { setBusy(false); } }}>{busy ? 'Đang xử lý…' : actionLabel}</button></div></div></Modal>;
}

function Metric({ label, value, icon, detail }: { label: string; value: ReactNode; icon: ReactNode; detail?: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div>{detail && <div className="stat-note muted">{detail}</div>}</div>;
}

function Details({ values }: { values: [string, ReactNode][] }) {
  return <dl className="detail-grid">{values.map(([label, value]) => <div key={label}><dt className="muted">{label}</dt><dd>{value || '—'}</dd></div>)}</dl>;
}

function useLookups() {
  const app = useApp();
  const property = (id: string) => app.data.properties.find(row => row.id === id);
  const room = (id: string) => app.data.rooms.find(row => row.id === id);
  const tenant = (id: string) => app.data.tenants.find(row => row.id === id);
  const defaultProperty = app.propertyId || app.data.properties.find(row => !row.archived)?.id || '';
  const myTenant = app.data.tenants.find(row => row.id === app.user.tenantId || row.userId === app.user.id) || app.data.tenants[0];
  const propertyOptions = app.data.properties.filter(row => !row.archived).map(row => ({ value: row.id, label: row.name }));
  const roomOptions = app.data.rooms.filter(row => row.status !== 'archived').map(row => ({ value: row.id, label: `${row.code} · ${property(row.propertyId)?.name || 'Cơ sở'}` }));
  const tenantOptions = app.data.tenants.filter(row => row.status !== 'left').map(row => ({ value: row.id, label: `${row.name}${room(row.roomId)?.code ? ` · Phòng ${room(row.roomId)?.code}` : ''}` }));
  const isLandlord = app.user.role === 'landlord';
  return { ...app, property, room, tenant, defaultProperty, myTenant, propertyOptions, roomOptions, tenantOptions, isLandlord };
}

const propertyField = (options: Option[]): FieldDefinition => ({ name: 'propertyId', label: 'Cơ sở', type: 'select', options, required: true });
const roomField = (options: Option[], required = true): FieldDefinition => ({ name: 'roomId', label: 'Phòng', type: 'select', options, required });
const tenantField = (options: Option[], required = true): FieldDefinition => ({ name: 'tenantId', label: 'Người thuê', type: 'select', options, required });
const moneyField = (name: string, label: string, required = true): FieldDefinition => ({ name, label, type: 'number', min: 0, required });
const textField = (name: string, label: string, required = false, full = false): FieldDefinition => ({ name, label, required, full });

function Properties() {
  const { data, user, mutate, notify } = useApp();
  const [archive, setArchive] = useState<RecordData | null>(null);
  const active = data.properties.filter(row => !row.archived);
  return <div className="page-stack">
    <div className="stats-grid"><Metric label="Cơ sở đang hoạt động" value={active.length} icon={<Building2 size={18}/>}/><Metric label="Tổng số phòng" value={data.rooms.filter(row => row.status !== 'archived').length} icon={<KeyRound size={18}/>}/><Metric label="Phòng đang thuê" value={data.rooms.filter(row => row.status === 'occupied').length} icon={<Users size={18}/>}/><Metric label="Cơ sở đã lưu trữ" value={data.properties.filter(row => row.archived).length} icon={<Landmark size={18}/>}/></div>
    <EntityPage collection="properties" title="Cơ sở nhà trọ" description="Thông tin liên hệ, tầng và nội quy của từng cơ sở." canCreate={user.role === 'landlord'} canEdit={user.role === 'landlord'} canDelete={user.role === 'landlord'}
      defaults={{ floors: 1, archived: false }}
      fields={[textField('name', 'Tên cơ sở', true), textField('address', 'Địa chỉ', true, true), textField('contact', 'Người liên hệ'), { name: 'phone', label: 'Số điện thoại', type: 'tel' }, { name: 'floors', label: 'Số tầng', type: 'number', min: 1, required: true }, { name: 'rules', label: 'Nội quy nhà trọ', type: 'textarea', full: true }]}
      columns={[{ key: 'name', label: 'Cơ sở', render: row => <div><strong>{row.name}</strong><div className="muted">{row.address}</div></div> }, { key: 'contact', label: 'Liên hệ', render: row => <div>{row.contact || '—'}<div className="muted">{row.phone}</div></div> }, { key: 'rooms', label: 'Số phòng', render: row => data.rooms.filter(room => room.propertyId === row.id && room.status !== 'archived').length }, { key: 'archived', label: 'Trạng thái', render: row => <Badge value={row.archived ? 'archived' : 'active'} label={row.archived ? 'Đã lưu trữ' : 'Hoạt động'}/> }]}
      renderActions={row => user.role === 'landlord' && <button className="btn btn-ghost btn-sm" onClick={() => setArchive(row)}>{row.archived ? 'Khôi phục' : 'Lưu trữ'}</button>}/>
    {user.role === 'tenant' && data.properties.map(row => <section className="card" key={row.id}><div className="card-header"><h2>Nội quy · {row.name}</h2></div><div className="card-body"><p style={{ whiteSpace: 'pre-wrap' }}>{row.rules || 'Chủ trọ chưa cập nhật nội quy.'}</p></div></section>)}
    {archive && <ConfirmDialog title={archive.archived ? 'Khôi phục cơ sở' : 'Lưu trữ cơ sở'} actionLabel={archive.archived ? 'Khôi phục' : 'Lưu trữ'} onClose={() => setArchive(null)} onConfirm={async () => { await mutate('properties', { archived: !archive.archived }, archive.id); notify(archive.archived ? 'Đã khôi phục cơ sở.' : 'Đã lưu trữ cơ sở.'); }}><p>{archive.archived ? 'Cơ sở sẽ hiển thị lại trong danh sách hoạt động.' : 'Chỉ lưu trữ khi các hợp đồng đang hoạt động đã được kết thúc. Dữ liệu và lịch sử vẫn được giữ lại.'}</p><strong>{archive.name}</strong></ConfirmDialog>}
  </div>;
}

function Tenants() {
  const ctx = useLookups();
  const rows = useRecords('tenants');
  const [invitation, setInvitation] = useState<{ name: string; inviteCode: string } | null>(null);
  const [details, setDetails] = useState<RecordData | null>(null);
  const [request, setRequest] = useState(false);
  async function invite(row: RecordData) {
    try { const result = await ctx.action('invite-tenant', { id: row.id }); setInvitation({ name: row.name, inviteCode: result.inviteCode || result.code }); }
    catch (failure) { ctx.notify(failure instanceof Error ? failure.message : 'Không thể tạo lời mời.', 'error'); }
  }
  return <div className="page-stack">
    <div className="stats-grid"><Metric label="Người thuê đang ở" value={rows.filter(row => row.status === 'active').length} icon={<Users size={18}/>}/><Metric label="Đã liên kết tài khoản" value={rows.filter(row => row.userId).length} icon={<ShieldCheck size={18}/>}/><Metric label="Chờ liên kết" value={rows.filter(row => row.status === 'active' && !row.userId).length} icon={<Send size={18}/>}/><Metric label="Đã chuyển đi" value={rows.filter(row => row.status === 'left').length} icon={<ArrowUpRight size={18}/>}/></div>
    <EntityPage collection="tenants" title={ctx.isLandlord ? 'Người thuê' : 'Hồ sơ lưu trú'} description="Hồ sơ đại diện, thành viên cùng phòng và lịch sử lưu trú." canCreate={ctx.isLandlord} canEdit={ctx.isLandlord} canDelete={false}
      defaults={{ propertyId: ctx.defaultProperty, status: 'active', moveInDate: today(), members: '' }}
      fields={[propertyField(ctx.propertyOptions), roomField(ctx.roomOptions, false), textField('name', 'Họ và tên', true), { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Số điện thoại', type: 'tel' }, textField('identityNumber', 'Số giấy tờ định danh'), { name: 'moveInDate', label: 'Ngày chuyển vào', type: 'date', required: true }, { name: 'moveOutDate', label: 'Ngày chuyển ra', type: 'date' }, { name: 'status', label: 'Tình trạng lưu trú', type: 'select', options: [{ value: 'active', label: 'Đang ở' }, { value: 'left', label: 'Đã chuyển đi' }], required: true }, { name: 'members', label: 'Thành viên cùng phòng', type: 'textarea', full: true }]}
      onSubmit={async (values, id) => ctx.mutate('tenants', { ...values, propertyId: ctx.room(values.roomId)?.propertyId || values.propertyId }, id)}
      columns={[{ key: 'name', label: 'Người thuê', render: row => <div><strong>{row.name}</strong><div className="muted">{row.email || 'Chưa có email'}</div></div> }, { key: 'roomId', label: 'Phòng', render: row => ctx.room(row.roomId)?.code || 'Chưa bố trí' }, { key: 'phone', label: 'Điện thoại' }, { key: 'moveInDate', label: 'Chuyển vào', render: row => date(row.moveInDate) }, { key: 'status', label: 'Trạng thái', render: row => <Badge value={row.status} label={row.status === 'left' ? 'Đã chuyển đi' : 'Đang ở'}/> }, { key: 'userId', label: 'Tài khoản', render: row => <Badge value={row.userId ? 'active' : 'draft'} label={row.userId ? 'Đã liên kết' : 'Chưa liên kết'}/> }]}
      renderActions={row => <><button className="btn btn-ghost btn-sm" onClick={() => setDetails(row)}>Chi tiết</button>{ctx.isLandlord && !row.userId && row.status !== 'left' && <button className="btn btn-secondary btn-sm" onClick={() => invite(row)}><Send size={14}/>Mời liên kết</button>}</>}/>
    {!ctx.isLandlord && <button className="btn btn-secondary" onClick={() => setRequest(true)}>Đề nghị cập nhật hồ sơ</button>}
    {invitation && <Modal title="Lời mời liên kết tài khoản" onClose={() => setInvitation(null)}><div className="stack"><p>Gửi mã này cho <strong>{invitation.name}</strong>. Người thuê nhập mã khi đăng ký để liên kết đúng hồ sơ và hợp đồng.</p><div className="callout"><strong style={{ fontSize: 24, letterSpacing: 3, overflowWrap: 'anywhere' }}>{invitation.inviteCode}</strong></div><button className="btn btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(invitation.inviteCode); ctx.notify('Đã sao chép mã lời mời.'); } catch { ctx.notify('Bạn có thể chọn và sao chép mã bên trên.', 'error'); } }}><Copy size={16}/>Sao chép mã</button></div></Modal>}
    {details && <Modal title={details.name} onClose={() => setDetails(null)}><div className="stack"><Details values={[[ 'Phòng', ctx.room(details.roomId)?.code ], [ 'Email', details.email ], [ 'Điện thoại', details.phone ], [ 'Giấy tờ', details.identityNumber ? `•••• ${String(details.identityNumber).slice(-4)}` : 'Chưa cập nhật' ], [ 'Ngày chuyển vào', date(details.moveInDate) ], [ 'Ngày chuyển ra', date(details.moveOutDate) ], [ 'Tài khoản', details.userId ? 'Đã liên kết' : 'Chưa liên kết' ]]}/><div><h3>Thành viên cùng phòng</h3><p style={{ whiteSpace: 'pre-wrap' }}>{details.members || 'Chưa có thông tin thành viên.'}</p></div><h3>Lịch sử hợp đồng</h3>{ctx.data.contracts.filter(contract => contract.tenantId === details.id).map(contract => <div className="inline" key={contract.id}><span>Phòng {ctx.room(contract.roomId)?.code} · {date(contract.startDate)} – {date(contract.endDate)}</span><Badge value={contract.status}/></div>)}</div></Modal>}
    {request && <FormDialog title="Đề nghị cập nhật hồ sơ" fields={[{ name: 'body', label: 'Thông tin cần điều chỉnh', type: 'textarea', required: true, full: true }]} onClose={() => setRequest(false)} submitLabel="Gửi đề nghị" onSubmit={async values => { if (!ctx.myTenant) throw new Error('Tài khoản chưa liên kết hồ sơ người thuê.'); await ctx.mutate('tickets', { propertyId: ctx.myTenant.propertyId, roomId: ctx.myTenant.roomId, tenantId: ctx.myTenant.id, title: 'Đề nghị cập nhật hồ sơ', category: 'profile', body: values.body, status: 'open' }); ctx.notify('Đã gửi đề nghị cho chủ trọ.'); }}/>}
  </div>;
}

function Contracts() {
  const ctx = useLookups();
  const rows = useRecords('contracts');
  const [detail, setDetail] = useState<RecordData | null>(null);
  const [pending, setPending] = useState<{ row: RecordData; name: string } | null>(null);
  const [renew, setRenew] = useState<RecordData | null>(null);
  const [request, setRequest] = useState<{ row: RecordData; type: 'renew' | 'move_out' } | null>(null);
  const expiring = rows.filter(row => row.status === 'active' && row.endDate >= today() && (new Date(row.endDate).getTime() - Date.now()) / 86400000 <= 30);
  const balance = (contract: RecordData) => ctx.data.deposits.filter(row => row.contractId === contract.id).reduce((sum, row) => sum + (row.type === 'receipt' ? Number(row.amount) : -Number(row.amount)), 0);
  const endDate = new Date(); endDate.setFullYear(endDate.getFullYear() + 1);
  const fields: FieldDefinition[] = [propertyField(ctx.propertyOptions), roomField(ctx.roomOptions), tenantField(ctx.tenantOptions), { name: 'startDate', label: 'Ngày bắt đầu', type: 'date', required: true }, { name: 'endDate', label: 'Ngày kết thúc', type: 'date', required: true }, moneyField('rent', 'Tiền thuê / tháng (đ)'), moneyField('deposit', 'Tiền cọc thoả thuận (đ)'), { name: 'terms', label: 'Điều khoản hợp đồng', type: 'textarea', full: true, required: true }];
  function exportContract(row: RecordData) {
    const tenant = ctx.tenant(row.tenantId), room = ctx.room(row.roomId), property = ctx.property(row.propertyId);
    download(`Hop-dong-${room?.code || row.id}-v${row.version || 1}.txt`, `HỢP ĐỒNG THUÊ PHÒNG\nMã: ${row.id} · Phiên bản ${row.version || 1}\n\nCơ sở: ${property?.name || ''}\nĐịa chỉ: ${property?.address || ''}\nPhòng: ${room?.code || ''}\nNgười thuê: ${tenant?.name || ''}\nThời hạn: ${date(row.startDate)} – ${date(row.endDate)}\nTiền thuê mỗi tháng: ${money(row.rent)}\nTiền cọc thoả thuận: ${money(row.deposit)}\n\nĐIỀU KHOẢN\n${row.terms || ''}\n\nTrạng thái: ${row.status}\nXác nhận đã đọc: ${row.acceptedAt ? date(row.acceptedAt) : 'Chưa xác nhận'}\nXác nhận trên web ghi nhận việc đã đọc/đồng ý, không thay thế chữ ký số.`, 'text/plain;charset=utf-8');
  }
  return <div className="page-stack">
    <div className="stats-grid"><Metric label="Hợp đồng đang thuê" value={rows.filter(row => row.status === 'active').length} icon={<FileText size={18}/>}/><Metric label="Sắp hết hạn trong 30 ngày" value={expiring.length} icon={<CalendarDays size={18}/>}/><Metric label="Hợp đồng nháp" value={rows.filter(row => row.status === 'draft').length} icon={<ReceiptText size={18}/>}/><Metric label="Tiền thuê theo hợp đồng" value={money(rows.filter(row => row.status === 'active').reduce((sum, row) => sum + Number(row.rent), 0))} icon={<Wallet size={18}/>}/></div>
    <EntityPage collection="contracts" title="Hợp đồng thuê" description="Theo dõi thời hạn, điều khoản, gia hạn và xác nhận của hai bên." fields={fields} canCreate={ctx.isLandlord} canEdit={false} canDelete={false}
      defaults={{ propertyId: ctx.defaultProperty, startDate: today(), endDate: endDate.toISOString().slice(0, 10), rent: 3000000, deposit: 3000000, status: 'draft', version: 1, terms: 'Tiền thuê được thanh toán hàng tháng theo kỳ đã thoả thuận. Người thuê thực hiện nội quy, bảo quản tài sản và thông báo trước khi trả phòng. Điện, nước và dịch vụ tính theo chỉ số, đơn giá được công khai.' }}
      onSubmit={async values => { const room = ctx.room(values.roomId); await ctx.mutate('contracts', { ...values, propertyId: room?.propertyId || values.propertyId, status: 'draft' }); ctx.notify('Đã tạo hợp đồng nháp. Kiểm tra điều khoản trước khi kích hoạt.'); }}
      columns={[{ key: 'roomId', label: 'Phòng / người thuê', render: row => <div><strong>Phòng {ctx.room(row.roomId)?.code || '—'}</strong><div className="muted">{ctx.tenant(row.tenantId)?.name}</div></div> }, { key: 'startDate', label: 'Thời hạn', render: row => <div>{date(row.startDate)}<div className="muted">đến {date(row.endDate)}</div></div> }, { key: 'rent', label: 'Tiền thuê / tháng', render: row => money(row.rent) }, { key: 'deposit', label: 'Cọc thoả thuận', render: row => money(row.deposit) }, { key: 'status', label: 'Trạng thái', render: row => <Badge value={row.status}/> }, { key: 'version', label: 'Phiên bản', render: row => `v${row.version || 1}` }]}
      renderActions={row => <><button className="btn btn-ghost btn-sm" onClick={() => setDetail(row)}>Chi tiết</button>{ctx.isLandlord && row.status === 'draft' && <button className="btn btn-success btn-sm" onClick={() => setPending({ row, name: 'contract-activate' })}>Kích hoạt</button>}{ctx.isLandlord && row.status === 'active' && <button className="btn btn-warning btn-sm" onClick={() => setRenew(row)}>Gia hạn</button>}{!ctx.isLandlord && row.status === 'active' && !row.acceptedAt && <button className="btn btn-success btn-sm" onClick={() => setPending({ row, name: 'contract-accept' })}>Đã đọc / đồng ý</button>}</>}/>
    {detail && <Modal title={`Hợp đồng · Phòng ${ctx.room(detail.roomId)?.code || ''}`} onClose={() => setDetail(null)} wide><div className="stack"><Details values={[[ 'Người thuê', ctx.tenant(detail.tenantId)?.name ], [ 'Cơ sở', ctx.property(detail.propertyId)?.name ], [ 'Thời hạn', `${date(detail.startDate)} – ${date(detail.endDate)}` ], [ 'Tiền thuê', money(detail.rent) ], [ 'Cọc thoả thuận', money(detail.deposit) ], [ 'Cọc thực đang giữ', money(balance(detail)) ], [ 'Trạng thái', <Badge value={detail.status}/> ], [ 'Người thuê xác nhận', detail.acceptedAt ? date(detail.acceptedAt) : 'Chưa xác nhận' ]]}/><div className="card"><div className="card-body"><h3>Điều khoản</h3><p style={{ whiteSpace: 'pre-wrap' }}>{detail.terms || 'Chưa có điều khoản.'}</p></div></div><p className="muted">Việc xác nhận đã đọc/đồng ý trên web không thay thế chữ ký điện tử hợp lệ.</p><div className="toolbar"><button className="btn btn-success" onClick={() => exportContract(detail)}><Download size={16}/>Tải hợp đồng</button>{ctx.isLandlord && detail.status === 'draft' && <button className="btn btn-warning" onClick={() => { setPending({ row: detail, name: 'edit-contract' }); setDetail(null); }}>Sửa bản nháp</button>}{ctx.isLandlord && detail.status === 'active' && <button className="btn btn-danger" onClick={() => { setPending({ row: detail, name: 'contract-end' }); setDetail(null); }}>Kết thúc hợp đồng</button>}{!ctx.isLandlord && detail.status === 'active' && <><button className="btn btn-secondary" onClick={() => { setRequest({ row: detail, type: 'renew' }); setDetail(null); }}>Đề nghị gia hạn</button><button className="btn btn-secondary" onClick={() => { setRequest({ row: detail, type: 'move_out' }); setDetail(null); }}>Đề nghị trả phòng</button></>}</div></div></Modal>}
    {pending?.name === 'edit-contract' && <FormDialog title="Sửa hợp đồng nháp" fields={fields} initial={pending.row} onClose={() => setPending(null)} onSubmit={values => ctx.mutate('contracts', { ...values, propertyId: ctx.room(values.roomId)?.propertyId || values.propertyId }, pending.row.id)}/>}
    {pending && pending.name !== 'edit-contract' && <ConfirmDialog title={pending.name === 'contract-activate' ? 'Kích hoạt hợp đồng' : pending.name === 'contract-end' ? 'Kết thúc hợp đồng' : 'Xác nhận đã đọc hợp đồng'} actionLabel={pending.name === 'contract-activate' ? 'Kích hoạt' : pending.name === 'contract-end' ? 'Kết thúc hợp đồng' : 'Đã đọc và đồng ý'} danger={pending.name === 'contract-end'} onClose={() => setPending(null)} onConfirm={async () => { await ctx.action(pending.name, { id: pending.row.id }); ctx.notify('Đã cập nhật hợp đồng.'); }}><p>Phòng <strong>{ctx.room(pending.row.roomId)?.code}</strong> · {ctx.tenant(pending.row.tenantId)?.name}</p>{pending.name === 'contract-end' ? <p>Phòng sẽ chuyển sang chờ bàn giao. Hãy chốt điện nước, công nợ và lập biên bản trả phòng trước khi hoàn cọc. Số cọc hiện đang giữ: <strong>{money(balance(pending.row))}</strong>.</p> : pending.name === 'contract-activate' ? <p>Kiểm tra thời hạn, người thuê và điều khoản. Hệ thống sẽ kiểm tra hợp đồng trùng thời gian trước khi nhận phòng.</p> : <p>Tôi đã đọc các điều khoản được cung cấp. Xác nhận này ghi nhận sự đồng ý trên hệ thống, không thay thế chữ ký số.</p>}</ConfirmDialog>}
    {renew && <FormDialog title={`Gia hạn · Phòng ${ctx.room(renew.roomId)?.code}`} fields={[{ name: 'endDate', label: 'Ngày kết thúc mới', type: 'date', required: true }, moneyField('rent', 'Tiền thuê / tháng (đ)')]} initial={{ endDate: renew.endDate, rent: renew.rent }} onClose={() => setRenew(null)} description="Hệ thống lưu phiên bản thay đổi; thời hạn mới phải sau thời hạn hiện tại." submitLabel="Xác nhận gia hạn" onSubmit={async values => { await ctx.action('contract-renew', { id: renew.id, ...values }); ctx.notify('Đã gia hạn hợp đồng.'); }}/>}
    {request && <FormDialog title={request.type === 'renew' ? 'Đề nghị gia hạn hợp đồng' : 'Đề nghị trả phòng'} fields={[{ name: 'date', label: request.type === 'renew' ? 'Ngày mong muốn gia hạn đến' : 'Ngày dự kiến trả phòng', type: 'date', required: true }, { name: 'body', label: 'Nội dung đề nghị', type: 'textarea', required: true, full: true }]} onClose={() => setRequest(null)} submitLabel="Gửi đề nghị" onSubmit={async values => { await ctx.mutate('tickets', { propertyId: request.row.propertyId, roomId: request.row.roomId, tenantId: request.row.tenantId, title: request.type === 'renew' ? 'Đề nghị gia hạn hợp đồng' : 'Đề nghị trả phòng', category: request.type, body: `Ngày dự kiến: ${date(values.date)}\n${values.body}`, status: 'open' }); ctx.notify('Đã gửi đề nghị cho chủ trọ.'); }}/>}
  </div>;
}

function Services() {
  const ctx = useLookups();
  const rows = useRecords('services');
  const unitLabel: Record<string, string> = { room: 'Phòng / tháng', person: 'Người / tháng', usage: 'Theo sử dụng' };
  return <div className="page-stack"><div className="stats-grid"><Metric label="Dịch vụ đang áp dụng" value={rows.filter(row => row.active).length} icon={<ReceiptText size={18}/>}/><Metric label="Phí cố định / phòng" value={money(rows.filter(row => row.active && row.unit === 'room').reduce((sum, row) => sum + Number(row.rate), 0))} icon={<Wallet size={18}/>} detail="Tổng các dịch vụ tính theo phòng"/><Metric label="Dịch vụ theo người" value={rows.filter(row => row.active && row.unit === 'person').length} icon={<Users size={18}/>}/><Metric label="Dịch vụ tạm ngừng" value={rows.filter(row => !row.active).length} icon={<CalendarDays size={18}/>}/></div>
    <EntityPage collection="services" title="Dịch vụ & phụ phí" description="Đơn giá công khai, áp dụng khi lập hóa đơn từng kỳ." canCreate={ctx.isLandlord} canEdit={ctx.isLandlord} canDelete={ctx.isLandlord} defaults={{ propertyId: ctx.defaultProperty, unit: 'room', rate: 0, active: true }}
      fields={[propertyField(ctx.propertyOptions), textField('name', 'Tên dịch vụ', true), moneyField('rate', 'Đơn giá (đ)'), { name: 'unit', label: 'Cách tính', type: 'select', required: true, options: [{ value: 'room', label: 'Theo phòng / tháng' }, { value: 'person', label: 'Theo người / tháng' }, { value: 'usage', label: 'Theo mức sử dụng' }] }, { name: 'active', label: 'Đang áp dụng', type: 'checkbox' }]}
      columns={[{ key: 'name', label: 'Dịch vụ', render: row => <strong>{row.name}</strong> }, { key: 'propertyId', label: 'Cơ sở', render: row => ctx.property(row.propertyId)?.name }, { key: 'rate', label: 'Đơn giá', render: row => money(row.rate) }, { key: 'unit', label: 'Đơn vị', render: row => unitLabel[row.unit] || row.unit }, { key: 'active', label: 'Trạng thái', render: row => <Badge value={row.active ? 'active' : 'inactive'} label={row.active ? 'Đang áp dụng' : 'Tạm ngừng'}/> }]}/>
  </div>;
}

function Deposits() {
  const ctx = useLookups();
  const rows = useRecords('deposits');
  const contracts = ctx.data.contracts.filter(row => !ctx.propertyId || row.propertyId === ctx.propertyId);
  const [show, setShow] = useState(false);
  const labels: Record<string, string> = { receipt: 'Nhận cọc', deduction: 'Khấu trừ', refund: 'Hoàn cọc' };
  const sum = (type: string) => rows.filter(row => row.type === type).reduce((total, row) => total + Number(row.amount), 0);
  return <div className="page-stack"><PageHeader title="Tiền cọc & hoàn cọc" description="Theo dõi cọc thực nhận, khấu trừ có lý do và khoản đã hoàn trả." actions={ctx.isLandlord && <button className="btn btn-primary" onClick={() => setShow(true)}><Plus size={16}/>Ghi nhận cọc</button>}/>
    <div className="stats-grid"><Metric label="Cọc đang giữ" value={money(sum('receipt') - sum('deduction') - sum('refund'))} icon={<ShieldCheck size={18}/>} detail="Được theo dõi riêng với doanh thu"/><Metric label="Tổng cọc đã nhận" value={money(sum('receipt'))} icon={<ArrowDownLeft size={18}/>}/><Metric label="Đã khấu trừ" value={money(sum('deduction'))} icon={<ReceiptText size={18}/>}/><Metric label="Đã hoàn trả" value={money(sum('refund'))} icon={<ArrowUpRight size={18}/>}/></div>
    <section className="card"><div className="card-header"><h2>Số dư theo hợp đồng</h2></div><DataTable rows={contracts} columns={[{ key: 'roomId', label: 'Phòng / người thuê', render: row => <div><strong>Phòng {ctx.room(row.roomId)?.code}</strong><div className="muted">{ctx.tenant(row.tenantId)?.name}</div></div> }, { key: 'deposit', label: 'Cọc thoả thuận', render: row => money(row.deposit) }, { key: 'balance', label: 'Cọc đang giữ', render: row => <strong>{money(ctx.data.deposits.filter(item => item.contractId === row.id).reduce((total, item) => total + (item.type === 'receipt' ? Number(item.amount) : -Number(item.amount)), 0))}</strong> }, { key: 'status', label: 'Hợp đồng', render: row => <Badge value={row.status}/> }]}/></section>
    <EntityPage collection="deposits" title="Lịch sử tiền cọc" description="Mọi giao dịch được lưu cùng ngày và nội dung đối chiếu." fields={[]} canCreate={false} canEdit={false} canDelete={false} columns={[{ key: 'date', label: 'Ngày', render: row => date(row.date) }, { key: 'roomId', label: 'Phòng / người thuê', render: row => <div>Phòng {ctx.room(row.roomId)?.code}<div className="muted">{ctx.tenant(row.tenantId)?.name}</div></div> }, { key: 'type', label: 'Nghiệp vụ', render: row => <Badge value={row.type} label={labels[row.type] || row.type}/> }, { key: 'amount', label: 'Số tiền', render: row => money(row.amount) }, { key: 'note', label: 'Nội dung' }]}/>
    {show && <FormDialog title="Ghi nhận giao dịch tiền cọc" fields={[{ name: 'contractId', label: 'Hợp đồng', type: 'select', required: true, options: contracts.map(row => ({ value: row.id, label: `Phòng ${ctx.room(row.roomId)?.code} · ${ctx.tenant(row.tenantId)?.name}` })) }, { name: 'type', label: 'Nghiệp vụ', type: 'select', required: true, options: [{ value: 'receipt', label: 'Nhận tiền cọc' }, { value: 'deduction', label: 'Khấu trừ tiền cọc' }, { value: 'refund', label: 'Hoàn trả tiền cọc' }] }, moneyField('amount', 'Số tiền (đ)'), { name: 'date', label: 'Ngày giao dịch', type: 'date', required: true }, { name: 'note', label: 'Nội dung / lý do', type: 'textarea', required: true, full: true }]} initial={{ type: 'receipt', date: today() }} onClose={() => setShow(false)} description="Khấu trừ hoặc hoàn trả không được vượt số cọc đang giữ. Khoản cọc không tự tính vào doanh thu." onSubmit={async values => { await ctx.action('deposit-record', values); ctx.notify('Đã ghi nhận giao dịch tiền cọc.'); }}/>}
  </div>;
}

function Transactions() {
  const ctx = useLookups();
  const rows = useRecords('transactions');
  const [month, setMonth] = useState(today().slice(0, 7));
  const filtered = rows.filter(row => !month || String(row.date).startsWith(month));
  const income = filtered.filter(row => row.type === 'income').reduce((sum, row) => sum + Number(row.amount), 0), expense = filtered.filter(row => row.type === 'expense').reduce((sum, row) => sum + Number(row.amount), 0);
  function exportCsv() {
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [['Ngày', 'Loại', 'Danh mục', 'Số tiền', 'Phòng', 'Nội dung'], ...filtered.map(row => [row.date, row.type === 'income' ? 'Thu' : 'Chi', row.category, row.amount, ctx.room(row.roomId)?.code, row.description])].map(row => row.map(escape).join(',')).join('\r\n');
    download(`So-thu-chi-${month || 'tat-ca'}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
  }
  return <div className="page-stack"><div className="toolbar"><label className="inline">Kỳ xem <input aria-label="Tháng thu chi" type="month" value={month} onChange={event => setMonth(event.target.value)}/></label><button className="btn btn-success" onClick={exportCsv}><Download size={16}/>Xuất sổ thu chi</button></div><div className="stats-grid"><Metric label="Tổng thu trong kỳ" value={money(income)} icon={<ArrowDownLeft size={18}/>}/><Metric label="Tổng chi trong kỳ" value={money(expense)} icon={<ArrowUpRight size={18}/>}/><Metric label="Chênh lệch thu chi" value={money(income - expense)} icon={<Wallet size={18}/>}/><Metric label="Số giao dịch" value={filtered.length} icon={<ReceiptText size={18}/>}/></div>
    <EntityPage collection="transactions" title="Sổ thu chi" description="Ghi nhận các khoản vận hành và đối chiếu dòng tiền của cơ sở." filter={row => !month || String(row.date).startsWith(month)} canCreate={ctx.isLandlord} canEdit={false} canDelete={false} defaults={{ propertyId: ctx.defaultProperty, type: 'expense', date: today(), amount: 0 }}
      fields={[propertyField(ctx.propertyOptions), { name: 'type', label: 'Loại giao dịch', type: 'select', required: true, options: [{ value: 'income', label: 'Khoản thu' }, { value: 'expense', label: 'Khoản chi' }] }, textField('category', 'Danh mục', true), moneyField('amount', 'Số tiền (đ)'), { name: 'date', label: 'Ngày giao dịch', type: 'date', required: true }, roomField(ctx.roomOptions, false), { name: 'description', label: 'Nội dung giao dịch', type: 'textarea', required: true, full: true }]}
      onSubmit={values => ctx.mutate('transactions', { ...values, propertyId: ctx.room(values.roomId)?.propertyId || values.propertyId })}
      columns={[{ key: 'date', label: 'Ngày', render: row => date(row.date) }, { key: 'description', label: 'Nội dung', render: row => <div><strong>{row.description}</strong><div className="muted">{row.category}</div></div> }, { key: 'type', label: 'Loại', render: row => <Badge value={row.type} label={row.type === 'income' ? 'Thu' : 'Chi'}/> }, { key: 'roomId', label: 'Phòng', render: row => ctx.room(row.roomId)?.code || 'Toàn cơ sở' }, { key: 'amount', label: 'Số tiền', render: row => <strong>{row.type === 'expense' ? '−' : '+'}{money(row.amount)}</strong> }]}/><p className="muted">Sổ thu chi phản ánh các bút toán đã ghi nhận. Tổng hóa đơn, khoản đã thu, công nợ và tiền cọc được theo dõi riêng trong các phân hệ tương ứng.</p></div>;
}

function Handovers() {
  const ctx = useLookups();
  const rows = useRecords('handovers');
  const [detail, setDetail] = useState<RecordData | null>(null);
  const [confirm, setConfirm] = useState<RecordData | null>(null);
  const [uploading, setUploading] = useState(false);
  const contractOptions = ctx.data.contracts.map(row => ({ value: row.id, label: `Phòng ${ctx.room(row.roomId)?.code} · ${ctx.tenant(row.tenantId)?.name}` }));
  const typeLabel = (row: RecordData) => row.type === 'move_out' ? 'Trả phòng' : 'Nhận phòng';
  async function upload(file: File | undefined) {
    if (!file || !detail) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { ctx.notify('Chọn ảnh JPG, PNG hoặc WebP.', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { ctx.notify('Ảnh không được vượt quá 5 MB.', 'error'); return; }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Không thể đọc ảnh.')); reader.readAsDataURL(file); });
      const uploaded = await api('/files', { method: 'POST', body: JSON.stringify({ name: file.name, type: file.type, data: base64, propertyId: detail.propertyId, roomId: detail.roomId, tenantId: detail.tenantId }) });
      const photoFileId = uploaded.id || uploaded.file?.id;
      await ctx.mutate('handovers', { photoFileId }, detail.id); setDetail({ ...detail, photoFileId }); ctx.notify('Đã lưu ảnh hiện trạng.');
    } catch (failure) { ctx.notify(failure instanceof Error ? failure.message : 'Không thể lưu ảnh.', 'error'); }
    finally { setUploading(false); }
  }
  return <div className="page-stack"><div className="stats-grid"><Metric label="Biên bản nhận phòng" value={rows.filter(row => row.type === 'move_in').length} icon={<KeyRound size={18}/>}/><Metric label="Biên bản trả phòng" value={rows.filter(row => row.type === 'move_out').length} icon={<ArrowUpRight size={18}/>}/><Metric label="Chờ xác nhận" value={rows.filter(row => row.status !== 'confirmed').length} icon={<CalendarDays size={18}/>}/><Metric label="Đã xác nhận" value={rows.filter(row => row.status === 'confirmed').length} icon={<CheckCheck size={18}/>}/></div>
    <EntityPage collection="handovers" title="Bàn giao & trả phòng" description="Ghi hiện trạng, tài sản và chỉ số cuối cùng trước khi quyết toán." canCreate={ctx.isLandlord} canEdit={false} canDelete={false} defaults={{ date: today(), type: 'move_in', status: 'draft', electricReading: 0, waterReading: 0 }}
      fields={[{ name: 'contractId', label: 'Hợp đồng', type: 'select', options: contractOptions, required: true }, { name: 'type', label: 'Loại biên bản', type: 'select', options: [{ value: 'move_in', label: 'Nhận phòng' }, { value: 'move_out', label: 'Trả phòng' }], required: true }, { name: 'date', label: 'Ngày bàn giao', type: 'date', required: true }, { name: 'electricReading', label: 'Chỉ số điện', type: 'number', min: 0, required: true }, { name: 'waterReading', label: 'Chỉ số nước', type: 'number', min: 0, required: true }, { name: 'condition', label: 'Hiện trạng phòng', type: 'textarea', required: true, full: true }, { name: 'assets', label: 'Tài sản bàn giao và tình trạng', type: 'textarea', full: true }, { name: 'note', label: 'Ghi chú quyết toán', type: 'textarea', full: true }]}
      onSubmit={async values => { const contract = ctx.data.contracts.find(row => row.id === values.contractId); if (!contract) throw new Error('Vui lòng chọn hợp đồng hợp lệ.'); await ctx.mutate('handovers', { ...values, propertyId: contract.propertyId, roomId: contract.roomId, tenantId: contract.tenantId, status: 'draft' }); }}
      columns={[{ key: 'roomId', label: 'Phòng / người thuê', render: row => <div><strong>Phòng {ctx.room(row.roomId)?.code}</strong><div className="muted">{ctx.tenant(row.tenantId)?.name}</div></div> }, { key: 'type', label: 'Biên bản', render: typeLabel }, { key: 'date', label: 'Ngày bàn giao', render: row => date(row.date) }, { key: 'electricReading', label: 'Điện / nước', render: row => `${row.electricReading} kWh · ${row.waterReading} m³` }, { key: 'status', label: 'Trạng thái', render: row => <Badge value={row.status} label={row.status === 'confirmed' ? 'Đã xác nhận' : 'Chờ xác nhận'}/> }]}
      renderActions={row => <><button className="btn btn-ghost btn-sm" onClick={() => setDetail(row)}>Xem biên bản</button>{((ctx.isLandlord && row.status === 'draft') || (!ctx.isLandlord && row.status === 'confirmed' && !row.tenantAcceptedAt)) && <button className="btn btn-success btn-sm" onClick={() => setConfirm(row)}>Xác nhận</button>}</>}/>
    {detail && <Modal title={`${typeLabel(detail)} · Phòng ${ctx.room(detail.roomId)?.code}`} onClose={() => setDetail(null)} wide><div className="stack"><Details values={[[ 'Ngày bàn giao', date(detail.date) ], [ 'Người thuê', ctx.tenant(detail.tenantId)?.name ], [ 'Chỉ số điện', `${detail.electricReading} kWh` ], [ 'Chỉ số nước', `${detail.waterReading} m³` ], [ 'Trạng thái', <Badge value={detail.status}/> ], [ 'Người thuê xác nhận', detail.tenantAcceptedAt ? date(detail.tenantAcceptedAt) : 'Chưa xác nhận' ]]}/><div><h3>Hiện trạng phòng</h3><p style={{ whiteSpace: 'pre-wrap' }}>{detail.condition}</p><h3>Tài sản bàn giao</h3><p style={{ whiteSpace: 'pre-wrap' }}>{typeof detail.assets === 'string' ? detail.assets : JSON.stringify(detail.assets, null, 2)}</p><h3>Ghi chú</h3><p>{detail.note || 'Không có ghi chú.'}</p></div>{detail.photoFileId && <a href={`/api/files/${encodeURIComponent(detail.photoFileId)}`} target="_blank" rel="noreferrer" className="btn btn-secondary">Xem ảnh hiện trạng</a>}{ctx.isLandlord && detail.status !== 'confirmed' && <div className="field"><label htmlFor="handover-photo">Ảnh hiện trạng (JPG, PNG, WebP · tối đa 5 MB)</label><input id="handover-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event => upload(event.target.files?.[0])}/>{uploading && <small className="muted">Đang tải ảnh…</small>}</div>}<button className="btn btn-success" onClick={() => download(`Bien-ban-${detail.id}.txt`, `${typeLabel(detail).toUpperCase()}\nPhòng ${ctx.room(detail.roomId)?.code}\nNgười thuê: ${ctx.tenant(detail.tenantId)?.name}\nNgày ${date(detail.date)}\nĐiện: ${detail.electricReading} kWh\nNước: ${detail.waterReading} m³\n\nHIỆN TRẠNG\n${detail.condition}\n\nTÀI SẢN\n${detail.assets || ''}\n\nGHI CHÚ\n${detail.note || ''}`, 'text/plain;charset=utf-8')}><Download size={16}/>Tải biên bản</button></div></Modal>}
    {confirm && <ConfirmDialog title="Xác nhận biên bản bàn giao" actionLabel="Xác nhận biên bản" onClose={() => setConfirm(null)} onConfirm={async () => { await ctx.action('handover-confirm', { id: confirm.id }); ctx.notify('Đã ghi nhận xác nhận bàn giao.'); }}><p>Tôi đã kiểm tra hiện trạng, tài sản và chỉ số điện nước trong biên bản <strong>{typeLabel(confirm).toLocaleLowerCase('vi')}</strong> của phòng <strong>{ctx.room(confirm.roomId)?.code}</strong>.</p>{confirm.type === 'move_out' && <p className="muted">Việc trả phòng cần đối chiếu công nợ và tiền cọc. Các khoản khấu trừ/hoàn cọc phải được ghi nhận riêng.</p>}</ConfirmDialog>}
  </div>;
}

function Vehicles() {
  const ctx = useLookups();
  const rows = useRecords('vehicles');
  const active = rows.filter(row => row.status === 'active');
  const fields: FieldDefinition[] = [...(ctx.isLandlord ? [propertyField(ctx.propertyOptions), roomField(ctx.roomOptions), tenantField(ctx.tenantOptions)] : []), textField('plate', 'Biển số xe', true), { name: 'type', label: 'Loại phương tiện', type: 'select', required: true, options: [{ value: 'motorbike', label: 'Xe máy' }, { value: 'bicycle', label: 'Xe đạp' }, { value: 'car', label: 'Ô tô' }, { value: 'electric', label: 'Xe điện' }] }, ...(ctx.isLandlord ? [textField('parkingSpot', 'Vị trí gửi xe'), moneyField('fee', 'Phí gửi xe / tháng (đ)'), { name: 'status', label: 'Trạng thái', type: 'select' as const, options: [{ value: 'active', label: 'Đang sử dụng' }, { value: 'inactive', label: 'Ngừng sử dụng' }] }] : [])];
  const typeLabels: Record<string, string> = { motorbike: 'Xe máy', bicycle: 'Xe đạp', car: 'Ô tô', electric: 'Xe điện' };
  return <div className="page-stack"><div className="stats-grid"><Metric label="Phương tiện đang gửi" value={active.length} icon={<KeyRound size={18}/>}/><Metric label="Phí gửi xe / tháng" value={money(active.reduce((sum, row) => sum + Number(row.fee || 0), 0))} icon={<Wallet size={18}/>}/><Metric label="Đã bố trí vị trí" value={active.filter(row => row.parkingSpot).length} icon={<Check size={18}/>}/><Metric label="Ngừng sử dụng" value={rows.filter(row => row.status === 'inactive').length} icon={<X size={18}/>}/></div><EntityPage collection="vehicles" title="Phương tiện & chỗ đỗ" description="Đăng ký phương tiện, vị trí đỗ và phí gửi xe của từng phòng." fields={fields} canCreate={ctx.isLandlord || !!ctx.myTenant} canEdit={ctx.isLandlord} canDelete={false} defaults={{ propertyId: ctx.defaultProperty, type: 'motorbike', fee: 0, status: 'active' }}
      onSubmit={async (values, id) => { const tenant = ctx.isLandlord ? ctx.tenant(values.tenantId) : ctx.myTenant; if (!tenant) throw new Error('Chọn người thuê trước khi đăng ký phương tiện.'); const roomId = ctx.isLandlord ? values.roomId : tenant.roomId; await ctx.mutate('vehicles', { ...values, plate: String(values.plate).trim().toUpperCase(), propertyId: ctx.room(roomId)?.propertyId || tenant.propertyId, roomId, tenantId: tenant.id, ...(ctx.isLandlord ? {} : { status: 'active' }) }, id); }}
      columns={[{ key: 'plate', label: 'Biển số', render: row => <strong>{row.plate}</strong> }, { key: 'type', label: 'Phương tiện', render: row => typeLabels[row.type] || row.type }, { key: 'roomId', label: 'Phòng / người thuê', render: row => <div>Phòng {ctx.room(row.roomId)?.code}<div className="muted">{ctx.tenant(row.tenantId)?.name}</div></div> }, { key: 'parkingSpot', label: 'Vị trí đỗ', render: row => row.parkingSpot || 'Chưa bố trí' }, { key: 'fee', label: 'Phí / tháng', render: row => money(row.fee) }, { key: 'status', label: 'Trạng thái', render: row => <Badge value={row.status} label={row.status === 'active' ? 'Đang gửi' : 'Ngừng sử dụng'}/> }]}/></div>;
}

function Amenities() {
  const ctx = useLookups();
  const amenities = useRecords('amenities'), bookings = useRecords('bookings');
  const [booking, setBooking] = useState<RecordData | null>(null);
  const [cancel, setCancel] = useState<RecordData | null>(null);
  const [day, setDay] = useState(today());
  const [showPast, setShowPast] = useState(false);
  const visibleBookings = bookings.filter(row => (!day || row.date === day) && (showPast || row.status !== 'cancelled')).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  return <div className="page-stack"><EntityPage collection="amenities" title="Tiện ích dùng chung" description="Quản lý tiện ích và đặt lịch sử dụng theo khung giờ." canCreate={ctx.isLandlord} canEdit={ctx.isLandlord} canDelete={ctx.isLandlord} defaults={{ propertyId: ctx.defaultProperty, capacity: 1, active: true }}
      fields={[propertyField(ctx.propertyOptions), textField('name', 'Tên tiện ích', true), { name: 'description', label: 'Mô tả và hướng dẫn sử dụng', type: 'textarea', full: true }, { name: 'capacity', label: 'Sức chứa / số chỗ', type: 'number', min: 1, required: true }, { name: 'active', label: 'Cho phép đặt lịch', type: 'checkbox' }]}
      columns={[{ key: 'name', label: 'Tiện ích', render: row => <div><strong>{row.name}</strong><div className="muted">{row.description}</div></div> }, { key: 'propertyId', label: 'Cơ sở', render: row => ctx.property(row.propertyId)?.name }, { key: 'capacity', label: 'Sức chứa' }, { key: 'active', label: 'Trạng thái', render: row => <Badge value={row.active ? 'active' : 'inactive'} label={row.active ? 'Đang mở' : 'Tạm ngừng'}/> }]}
      renderActions={row => row.active && <button className="btn btn-secondary btn-sm" onClick={() => setBooking(row)}><CalendarDays size={14}/>Đặt lịch</button>}/>
    <section className="card"><div className="card-header"><div><h2>Lịch sử dụng tiện ích</h2><p className="muted">Kiểm tra thời gian và người đặt trước khi đến sử dụng.</p></div></div><div className="card-body"><div className="toolbar"><label className="inline">Ngày <input type="date" aria-label="Ngày sử dụng tiện ích" value={day} onChange={event => setDay(event.target.value)}/></label><label className="inline"><input type="checkbox" checked={showPast} onChange={event => setShowPast(event.target.checked)}/>Hiện lịch đã huỷ</label></div></div><DataTable rows={visibleBookings} columns={[{ key: 'amenityId', label: 'Tiện ích', render: row => amenities.find(item => item.id === row.amenityId)?.name || 'Tiện ích' }, { key: 'tenantId', label: 'Người đặt', render: row => ctx.tenant(row.tenantId)?.name || '—' }, { key: 'date', label: 'Ngày', render: row => date(row.date) }, { key: 'startTime', label: 'Khung giờ', render: row => `${row.startTime} – ${row.endTime}` }, { key: 'status', label: 'Trạng thái', render: row => <Badge value={row.status} label={row.status === 'cancelled' ? 'Đã huỷ' : 'Đã đặt'}/> }, { key: 'actions', label: '', render: row => row.status !== 'cancelled' && (ctx.isLandlord || row.tenantId === ctx.myTenant?.id) && <button className="btn btn-ghost btn-sm" onClick={() => setCancel(row)}>Huỷ lịch</button> }]} empty={<EmptyState title="Chưa có lịch sử dụng" description="Chọn tiện ích ở trên để đặt một khung giờ."/>}/></section>
    {booking && <FormDialog title={`Đặt lịch · ${booking.name}`} fields={[...(ctx.isLandlord ? [tenantField(ctx.tenantOptions.filter(option => ctx.tenant(option.value)?.propertyId === booking.propertyId))] : []), { name: 'date', label: 'Ngày sử dụng', type: 'date', required: true }, { name: 'startTime', label: 'Giờ bắt đầu', type: 'text', required: true }, { name: 'endTime', label: 'Giờ kết thúc', type: 'text', required: true }]} initial={{ date: today(), startTime: '08:00', endTime: '09:00' }} description="Nhập giờ theo định dạng HH:mm, ví dụ 08:30. Lịch trùng khung giờ được kiểm tra trước khi lưu." submitLabel="Xác nhận đặt lịch" onClose={() => setBooking(null)} onSubmit={async values => { const tenantId = ctx.isLandlord ? values.tenantId : ctx.myTenant?.id; if (!tenantId) throw new Error('Tài khoản chưa liên kết người thuê.'); if (!/^\d{2}:\d{2}$/.test(values.startTime) || !/^\d{2}:\d{2}$/.test(values.endTime)) throw new Error('Vui lòng nhập giờ theo dạng HH:mm.'); if (values.startTime >= values.endTime) throw new Error('Giờ kết thúc phải sau giờ bắt đầu.'); await ctx.mutate('bookings', { ...values, propertyId: booking.propertyId, amenityId: booking.id, tenantId, status: 'confirmed' }); ctx.notify('Đã đặt lịch sử dụng tiện ích.'); }}/>}
    {cancel && <ConfirmDialog title="Huỷ lịch sử dụng tiện ích" actionLabel="Huỷ lịch" danger onClose={() => setCancel(null)} onConfirm={async () => { await ctx.action('booking-cancel', { id: cancel.id }); ctx.notify('Đã huỷ lịch sử dụng.'); }}><p>{amenities.find(row => row.id === cancel.amenityId)?.name} · {date(cancel.date)} · {cancel.startTime} – {cancel.endTime}</p></ConfirmDialog>}
  </div>;
}

export function TenancyPages({ page }: { page: PageId }) {
  switch (page) {
    case 'properties': return <Properties/>;
    case 'tenants': return <Tenants/>;
    case 'contracts': return <Contracts/>;
    case 'services': return <Services/>;
    case 'deposits': return <Deposits/>;
    case 'transactions': return <Transactions/>;
    case 'handovers': return <Handovers/>;
    case 'vehicles': return <Vehicles/>;
    case 'amenities': return <Amenities/>;
    default: return null;
  }
}
