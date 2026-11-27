import {useState, type FormEvent} from 'react';
import {contactFields,privacyFields,privacyStatuses} from '../shared/privacy-policy.mjs';
import {date,download} from './api';
import {useApp} from './context';
import type {RecordData} from './types';
import {Field,Modal} from './ui';

const rejectReasons:Record<string,string>={identity:'Chưa xác minh được danh tính',authority:'Chưa xác minh được quyền đại diện',scope:'Yêu cầu ngoài phạm vi được phép'};
const sourceNames:Record<string,string>={linked:'Tài khoản đã liên kết',external:'Chính chủ gửi bên ngoài',delegate:'Người được ủy quyền'};
const isOpen=(row:RecordData)=>['pending','reviewed'].includes(row.status);
const checked=(form:FormData,key:string)=>form.get(key)==='on';

function Decisions({row}:{row:RecordData}){
  return <ul>{(row.decisions||[]).map((d:{field:string;eligible:boolean;reason:string})=>
    <li key={d.field}><b>{privacyFields[d.field]}</b> · {d.eligible?(isOpen(row)?'Có thể xóa':'Đã xóa'):'Giữ lại'}<br/>{d.reason}</li>)}</ul>;
}

export function PrivacyRequests({propertyId}:{propertyId?:string}){
  const {user,data,action,notify}=useApp(),owner=user.role==='landlord';
  const [dialog,setDialog]=useState(''),[rowId,setRowId]=useState(''),[preview,setPreview]=useState<RecordData|null>(null);
  const [tenantId,setTenantId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const rows=(data.privacyRequests||[]).filter(r=>!owner||r.propertyId===propertyId).sort((a,b)=>String(b.createdAt).localeCompare(a.createdAt));
  const row=rows.find(r=>r.id===rowId);
  const tenants=data.tenants.filter(t=>t.propertyId===propertyId),tenant=tenants.find(t=>t.id===tenantId);
  const requestTenant=data.tenants.find(t=>t.id===row?.tenantId);
  const openCases=row?[...data.tickets.filter(t=>['open','progress'].includes(t.status)),...data.issues.filter(i=>!['closed','rejected'].includes(i.status))]
    .filter(r=>[row.tenantId,row.personId].includes(r.tenantId)): [];
  function show(mode:string,id=''){
    setRowId(id);setPreview(null);setError('');setDialog(mode);setTenantId('');
  }
  async function run(name:string,input:Record<string,unknown>,next=''){
    setBusy(true);setError('');
    try{
      const result=await action('privacy-'+name,input);
      if(next==='confirm'){setPreview(result);setDialog(next);}
      else{setDialog('');notify(name==='submit'?'Đã tiếp nhận yêu cầu.':'Đã ghi nhận kết quả.');}
    }catch(e){setError((e as Error).message);if(name==='confirm'){setPreview(null);setDialog('review');}}
    finally{setBusy(false);}
  }
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=new FormData(e.currentTarget);
    if(!form.has('fields')){setError('Chọn ít nhất một mục dữ liệu.');return;}
    void run('submit',{fields:form.getAll('fields'),...(owner?{propertyId,tenantId,personId:form.get('personId'),source:form.get('source'),requesterName:form.get('requesterName')}:{})});
  }
  function review(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!row)return;
    const form=new FormData(e.currentTarget);
    void run('preview',{id:row.id,settled:form.get('settled')==='yes',neededFields:form.getAll('needed'),
      identityChecked:checked(form,'identity'),authorityChecked:checked(form,'authority')},'confirm');
  }
  function receipt(r:RecordData){
    const details=(r.decisions||[]).map((d:{field:string;eligible:boolean;reason:string})=>privacyFields[d.field]+' · '+(d.eligible?'Đã xóa':'Giữ lại')+' · '+d.reason);
    download(r.id+'.txt',['Trozy · Kết quả xử lý yêu cầu dữ liệu',r.id,date(r.finishedAt),privacyStatuses[r.status],rejectReasons[r.reason],...details].filter(Boolean).join('\n'),'text/plain;charset=utf-8');
  }
  const close=()=>{if(!busy)show('');};
  const submitButton=(label:string,danger=false)=><button className={'btn '+(danger?'btn-danger':'btn-primary')} disabled={busy||(!owner&&!user.tenantId)}>{label}</button>;
  const errorText=error&&<p className="form-error" role="alert">{error}</p>;
  return <section className="card"><div className="card-header"><h2>Yêu cầu xóa dữ liệu</h2>
    <button className="btn" disabled={owner?!propertyId||!tenants.length:!user.tenantId} onClick={()=>show('new')}>{owner?'Tiếp nhận yêu cầu bên ngoài':'Gửi yêu cầu'}</button></div>
    <div className="card-body stack">{!rows.length&&<p className="muted">Chưa có yêu cầu xóa dữ liệu.</p>}
    {rows.map(r=><div className="stack" key={r.id}><div><b>{owner?r.subjectName:'Yêu cầu ngày '+date(r.createdAt)}</b> · {privacyStatuses[r.status]}
      <p>{r.fields.map((f:string)=>privacyFields[f]).join(', ')}</p></div><div className="row-actions">
      <button className="btn btn-sm" onClick={()=>show(owner&&isOpen(r)?'review':'detail',r.id)}>{owner&&isOpen(r)?'Kiểm tra yêu cầu':'Xem chi tiết'}</button>
      {isOpen(r)&&<button className="btn btn-sm" onClick={()=>show('cancel',r.id)}>{owner?'Hủy xử lý':'Rút yêu cầu'}</button>}</div></div>)}</div>

    {dialog==='new'&&<Modal title={owner?'Tiếp nhận yêu cầu xóa dữ liệu':'Gửi yêu cầu xóa dữ liệu'} onClose={close}><form onSubmit={submit} className="stack">
      {owner&&<><Field label="Hồ sơ thuê" type="select" value={tenantId} required onChange={e=>setTenantId(e.target.value)}><option value="">Chọn hồ sơ</option>
        {tenants.map(t=><option key={t.id} value={t.id}>{t.name} · {data.rooms.find(r=>r.id===t.roomId)?.code||t.roomId}</option>)}</Field>
        {tenant&&<Field key={tenant.id} label="Người có dữ liệu" type="select" name="personId" required>{[tenant,...tenant.memberProfiles||[]].map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Field>}
        <Field label="Người gửi yêu cầu" type="select" name="source"><option value="external">Chính chủ</option><option value="delegate">Người được ủy quyền</option></Field>
        <Field label="Họ tên người gửi" name="requesterName" maxLength={150} required/></>}
      <fieldset className="stack"><legend>Dữ liệu đề nghị xóa</legend>
        {Object.entries(privacyFields).map(([key,label])=><label className="inline" key={key}><input type="checkbox" name="fields" value={key}/>{label}</label>)}</fieldset>
      <p className="muted">Chủ trọ sẽ kiểm tra từng mục và trả kết quả. Ảnh giấy tờ tùy thân được đối chiếu bên ngoài Trozy.</p>
      {errorText}<div className="form-actions"><button className="btn" type="button" onClick={close}>Quay lại</button>{submitButton('Gửi yêu cầu')}</div>
    </form></Modal>}

    {row&&dialog==='review'&&<Modal title="Kiểm tra yêu cầu xóa dữ liệu" onClose={close}><form onSubmit={review} className="stack">
      <p><b>{row.subjectName}</b> · Người gửi {row.requesterName} · {sourceNames[row.source]}</p>
      <p>{row.fields.map((f:string)=>privacyFields[f]).join(', ')}</p>
      {row.source!=='linked'&&<label className="inline"><input name="identity" type="checkbox" required/>Đã đối chiếu trực tiếp danh tính người gửi</label>}
      {row.source==='delegate'&&<label className="inline"><input name="authority" type="checkbox" required/>Đã kiểm tra ủy quyền cho đúng người và phạm vi dữ liệu</label>}
      <Field label="Tình trạng tất toán của người có dữ liệu" type="select" name="settled" required defaultValue=""><option value="">Chọn kết quả đối chiếu</option><option value="yes">Đã tất toán</option><option value="no">Còn nghĩa vụ hoặc chưa đủ căn cứ</option></Field>
      {openCases.length>0&&<div><b>Phiếu liên quan cần đối chiếu</b><ul>{openCases.map(r=><li key={r.id}>{r.title||r.id}</li>)}</ul></div>}
      {row.fields.some((f:string)=>contactFields.includes(f))&&<fieldset><legend>Trường còn cần cho yêu cầu đang xử lý</legend>
        {row.fields.filter((f:string)=>contactFields.includes(f)).map((f:string)=><label className="inline" key={f}><input type="checkbox" name="needed" value={f} defaultChecked={openCases.length>0}/>{privacyFields[f]}</label>)}</fieldset>}
      {!requestTenant&&<p>Hồ sơ cần đối chiếu lại trong cơ sở này.</p>}
      {errorText}<div className="form-actions"><button className="btn" type="button" disabled={busy} onClick={()=>show('reject',row.id)}>Từ chối yêu cầu</button>{submitButton('Xem trước kết quả')}</div>
    </form></Modal>}

    {row&&dialog==='confirm'&&preview&&<Modal title="Xác nhận kết quả xử lý" onClose={close}><form className="stack" onSubmit={e=>{
      e.preventDefault();void run('confirm',{id:row.id,previewId:preview.previewId,confirmed:true,fields:preview.decisions.filter((d:{eligible:boolean})=>d.eligible).map((d:{field:string})=>d.field)});
    }}><p><b>{row.subjectName}</b></p><Decisions row={preview}/>{errorText}<div className="form-actions">
      <button className="btn" type="button" disabled={busy} onClick={()=>show('review',row.id)}>Kiểm tra lại</button>
      {preview.decisions.some((d:{eligible:boolean})=>d.eligible)?submitButton('Xác nhận xóa các trường đủ điều kiện',true):submitButton('Xác nhận giữ lại toàn bộ')}</div></form></Modal>}

    {row&&dialog==='reject'&&<Modal title="Từ chối yêu cầu" onClose={close}><form className="stack" onSubmit={e=>{e.preventDefault();void run('reject',{id:row.id,reason:new FormData(e.currentTarget).get('reason')});}}>
      <Field label="Lý do từ chối" name="reason" type="select">{Object.entries(rejectReasons).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Field>{errorText}{submitButton('Ghi nhận từ chối')}</form></Modal>}
    {row&&dialog==='cancel'&&<Modal title="Hủy yêu cầu xóa dữ liệu" onClose={close}><p>Hủy yêu cầu {row.id} và giữ nguyên dữ liệu đã chọn?</p>{errorText}<div className="form-actions"><button className="btn" onClick={close}>Quay lại</button>
      <button className="btn btn-warning" disabled={busy} onClick={()=>void run('cancel',{id:row.id})}>Xác nhận hủy yêu cầu</button></div></Modal>}
    {row&&dialog==='detail'&&<Modal title="Kết quả yêu cầu dữ liệu" onClose={close}><div className="stack"><p>{row.id} · {privacyStatuses[row.status]}</p>
      {row.reason&&<p>{rejectReasons[row.reason]}</p>}<Decisions row={row}/>
      {!isOpen(row)&&<button className="btn" onClick={()=>receipt(row)}>Tải phiếu kết quả</button>}
      {owner&&row.source!=='linked'&&!isOpen(row)&&(row.deliveredAt?<p>Đã trả kết quả ngày {date(row.deliveredAt)}.</p>:<button className="btn" disabled={busy} onClick={()=>void run('delivered',{id:row.id})}>Đã trả kết quả trực tiếp cho người gửi</button>)}{errorText}</div></Modal>}
  </section>;
}
