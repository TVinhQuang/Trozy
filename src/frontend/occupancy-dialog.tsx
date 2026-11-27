import {useEffect,useState} from 'react';
import {api,date,today} from './api';
import {useApp} from './context';
import type {RecordData} from './types';
import {Field,Modal} from './ui';

const send=(step:string,body:object)=>api('/occupancy/'+step,{method:'POST',body:JSON.stringify(body)});
export function OccupancyDialog({tenant,onClose}:{tenant:RecordData;onClose:()=>void}){
  const {data,refresh,notify}=useApp(),members:RecordData[]=[tenant,...(tenant.memberProfiles||[])];
  const active=members.filter(m=>(m.id===tenant.id?tenant.occupantStatus||tenant.status:m.status||tenant.status)==='active');
  const [mode,setMode]=useState('transfer'),[checked,setChecked]=useState(active.map(p=>p.id)),[room,setRoom]=useState(''),[day,setDay]=useState(today()),[terms,setTerms]=useState(''),[other,setOther]=useState(''),[person,setPerson]=useState(tenant.id),[view,setView]=useState<any>(null),[records,setRecords]=useState<RecordData[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let live=true;send('list',{tenantId:tenant.id}).then(r=>{if(live)setRecords(r.records);}).catch(e=>{if(live)setError(e.message);});return ()=>{live=false;};},[tenant.id]);
  const payload={tenantId:tenant.id,people:checked,roomId:room,date:day,terms,otherContractId:other};
  async function submit(){
    setBusy(true);setError('');
    try{
      if(mode!=='transfer'){const r=await send('stay',{tenantId:tenant.id,date:day,direction:mode,personId:person});await refresh();notify(r.empty?'Đã ghi chuyển ra. Phòng đã hết người, cần hoàn tất bàn giao và quyết toán.':'Đã ghi nhận lưu trú.');onClose();return;}
      if(!view){setView(await send('preview',payload));return;}
      const r=await send('confirm',{...payload,revision:view.revision});await refresh();notify(r.status==='scheduled'?'Đã lưu lịch chuyển phòng.':'Đã xác nhận chuyển phòng.');onClose();
    }catch(e){setError((e as Error).message);setView(null);}finally{setBusy(false);}
  }
  const split=checked.length>0&&checked.length<active.length;
  const rooms=data.rooms.filter(r=>r.status==='vacant'&&r.id!==tenant.roomId);
  const statusName:Record<string,string>={scheduled:'Đã lên lịch',completed:'Đã chuyển',review:'Cần kiểm tra lại',cancelled:'Đã hủy'};
  return <Modal title={'Lưu trú · '+tenant.name} onClose={onClose} wide><div className="stack">
    <Field type="select" label="Thao tác" value={mode} onChange={e=>{setMode(e.target.value);setView(null);setError('');}}><option value="transfer">Chuyển phòng</option><option value="in">Ghi nhận chuyển vào</option><option value="out">Ghi nhận chuyển ra</option></Field>
    <form onChange={()=>setView(null)} onSubmit={e=>{e.preventDefault();void submit();}} className="stack">
      <Field label="Ngày hiệu lực" type="date" value={day} required onChange={e=>setDay(e.target.value)}/>
      {mode==='transfer'?<><fieldset><legend>Người chuyển phòng</legend>{active.map(p=><label key={p.id} className="inline"><input type="checkbox" checked={checked.includes(p.id)} onChange={e=>setChecked(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/>{p.name}{p.id===tenant.id?' · Đại diện':''}</label>)}</fieldset>
        <Field type="select" label="Phòng chuyển đến" value={room} required onChange={e=>setRoom(e.target.value)}><option value="">Chọn phòng trống</option>{rooms.map(r=><option key={r.id} value={r.id}>{data.properties.find(p=>p.id===r.propertyId)?.name} · {r.code}</option>)}</Field>
        {split&&<Field type="select" required label="Hợp đồng của nhóm tách" value={other} onChange={e=>setOther(e.target.value)}><option value="">Chọn hợp đồng nháp đã lập cho đại diện nhóm tách</option>{data.contracts.filter(c=>c.status==='draft'&&c.roomId===(checked.includes(tenant.id)?tenant.roomId:room)).map(c=><option key={c.id} value={c.id}>{c.id} · {members.find(m=>m.id===c.tenantId)?.name||c.tenantId}</option>)}</Field>}
        <Field type="textarea" label="Nội dung phụ lục đã thống nhất" value={terms} required onChange={e=>setTerms(e.target.value)}/></>:<Field type="select" label="Người ghi nhận lưu trú" value={person} required onChange={e=>setPerson(e.target.value)}>{members.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Field>}
      {view&&<div className="card card-body"><h3>Đối chiếu trước khi chuyển</h3><p>Phòng {view.source.code} → {view.destination.code} · {date(view.date)}</p><p>Người chuyển: {view.moving.map((m:RecordData)=>m.name).join(', ')}.</p>{view.staying.length>0&&<p>Ở lại: {view.staying.map((m:RecordData)=>m.name).join(', ')}.</p>}<p>Hợp đồng {view.contract.id} · Phiên bản mới {view.contract.version+1}</p><p>{view.linkedAccount?'Tài khoản người đại diện tiếp tục liên kết.':'Người đại diện chưa liên kết tài khoản.'}</p><p>Tài liệu liên quan: {view.documents.map((d:RecordData)=>d.name).join(', ')||'Chưa có'}</p><p>{view.terms}</p></div>}
      {error&&<p role="alert" className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={busy}>{mode!=='transfer'?'Xác nhận lưu trú':view?'Xác nhận chuyển phòng':'Xem trước chuyển phòng'}</button></div></form>
    {records.length>0&&<section><h3>Lịch sử chuyển phòng</h3>{records.map(r=><div className="summary-line" key={r.id}><span>{date(r.date)} · {statusName[r.status]} {r.reason||''}</span>{r.status==='scheduled'&&<button className="btn" disabled={busy} onClick={async()=>{setBusy(true);try{await send('cancel',{id:r.id});setRecords((await send('list',{tenantId:tenant.id})).records);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Hủy lịch</button>}</div>)}</section>}
  </div></Modal>;
}
