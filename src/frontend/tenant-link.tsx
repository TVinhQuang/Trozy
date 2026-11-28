import {useEffect,useState,type FormEvent} from 'react';
import {api} from './api';
import {useApp} from './context';
import {Field} from './ui';

type LinkStatus='pending'|'approved'|'rejected'|'expired';
export type TenantLinkRequest={id:string;tenantId:string;profileEmail:string;requestedEmail:string};
export const linkRequestsPath='/auth/tenant-link-requests';
export const linkStatusText:Record<LinkStatus,string>={
  pending:'Đang chờ chủ trọ duyệt liên kết.',
  approved:'Tài khoản đã liên kết với hồ sơ thuê.',
  rejected:'Chủ trọ đã từ chối yêu cầu. Hãy xin mã mời mới để gửi lại.',
  expired:'Yêu cầu liên kết đã hết hiệu lực. Hãy kiểm tra mã mời với chủ trọ và gửi lại.'
};

export function TenantLinkAccount() {
  const {user,refresh,notify}=useApp();
  const [status,setStatus]=useState<LinkStatus|null>(null);
  const [error,setError]=useState('');
  const [connectionError,setConnectionError]=useState('');
  const [busy,setBusy]=useState(false);
  const linked=Boolean(user.tenantId);

  useEffect(()=>{
    if(linked||busy)return;
    const controller=new AbortController();
    async function check(){
      try{
        const result=await api<{status:LinkStatus|null}>(linkRequestsPath,{signal:controller.signal});
        if(controller.signal.aborted)return;
        setConnectionError('');
        setStatus(result.status);
        if(result.status==='approved')await refresh();
      }catch(failure){if(!controller.signal.aborted)setConnectionError((failure as Error).message);}
    }
    void check();
    const timer=window.setInterval(check,30000);
    window.addEventListener('focus',check);
    return ()=>{
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus',check);
    };
  },[user.id,linked,busy,refresh]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const input=Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try{
      const result=await api<{status:'pending'|'linked'}>('/auth/link-tenant',{method:'POST',body:JSON.stringify(input)});
      if(result.status==='pending')setStatus('pending');
      else {await refresh();notify(linkStatusText.approved);}
    }catch(failure){setError((failure as Error).message);}
    finally{setBusy(false);}
  }

  const message=linked?linkStatusText.approved:status&&linkStatusText[status];
  return <section className="card">
    <div className="card-header"><h2>Liên kết hồ sơ thuê</h2></div>
    <div className="card-body stack">
      {message&&<p role="status">{message}</p>}
      {!linked&&status!=='pending'&&status!=='approved'&&<form className="stack" onSubmit={submit}>
        <Field label="Mã mời của chủ trọ" name="inviteCode" required/>
        <div><button className="btn btn-primary" disabled={busy}>{busy?'Đang gửi…':'Liên kết hồ sơ thuê'}</button></div>
      </form>}
      {(error||connectionError)&&<p className="form-error" role="alert">{error||connectionError}</p>}
    </div>
  </section>;
}
