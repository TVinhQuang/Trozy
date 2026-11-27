import {useState, type FormEvent} from 'react';
import {date, money} from './api';
import {BusinessPdfLink} from './business-pdf-link';
import {useApp} from './context';
import type {RecordData} from './types';
import {Field, Modal} from './ui';

export function ReceiptCorrection({receipt,invoice,onClose}:{receipt:RecordData;invoice:RecordData;onClose:()=>void}){
  const {action,notify}=useApp();
  const [amount,setAmount]=useState(String(receipt.amount)),[receivedDate,setReceivedDate]=useState(receipt.date);
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [requestId]=useState(()=>crypto.randomUUID());
  const previous=receipt.appliedAmount??receipt.amount;
  const delta=Number(amount)-receipt.amount;
  const applied=delta>=0?previous+Math.min(delta,invoice.total-invoice.paid):Math.min(Number(amount),previous);
  const remaining=invoice.total-invoice.paid+previous-applied;
  async function submit(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try{
      await action('payment-correct',{id:receipt.id,amount:Number(amount),date:receivedDate,reason,requestId,
        expectedRevision:receipt.corrections?.length||0,expectedPaid:invoice.paid,expectedTotal:invoice.total});
      notify('Đã cập nhật biên nhận, hóa đơn và sổ thu chi.');onClose();
    }catch(failure){setError((failure as Error).message);}finally{setBusy(false);}
  }
  return <Modal title="Đối chiếu khoản thu gốc" onClose={onClose}><form className="stack" onSubmit={submit}>
    <p>Hóa đơn <b>{invoice.id}</b> · Đã ghi nhận {money(receipt.amount)} ngày {date(receipt.date)}</p>
    <BusinessPdfLink href={'/api/payments/'+encodeURIComponent(receipt.id)+'/pdf'}>Tải biên nhận hiện tại</BusinessPdfLink>
    {receipt.corrections?.map((c:RecordData)=><p key={c.requestId}>{date(c.at)} · {money(c.before.amount)} → {money(c.after.amount)} · {c.reason}</p>)}
    <Field label="Số tiền đã đối chiếu (₫)" type="number" min={1} step={1} required value={amount} onChange={e=>setAmount(e.target.value)}/>
    <Field label="Ngày thực nhận" type="date" required value={receivedDate} onChange={e=>setReceivedDate(e.target.value)}/>
    <Field label="Lý do điều chỉnh" type="textarea" required minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/>
    <p>Sau điều chỉnh · Còn phải thu <b>{money(remaining)}</b> · Tiền trả dư <b>{money(Math.max(0,Number(amount)-applied))}</b></p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Hủy</button><button className="btn btn-success" disabled={busy}>Xác nhận điều chỉnh</button></div>
  </form></Modal>;
}
