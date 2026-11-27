import {useEffect,useRef,useState} from 'react';
import {api} from './api';

type Fields=Record<string,string>;
type Target={roomId:string;collection:'contracts'|'tenants';id?:string};
const labels:Fields={name:'Họ tên người thuê',phone:'Điện thoại',email:'Email',birthDate:'Ngày sinh',roomId:'Phòng',tenantId:'Người thuê',startDate:'Ngày bắt đầu',endDate:'Ngày kết thúc',rent:'Tiền thuê mỗi tháng',deposit:'Tiền cọc'};
const encode=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Không đọc được ảnh.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
export function PaperContractInput({collection,id,onApply}:{collection:Target['collection'];id?:string;onApply?:(fields:Fields)=>void}){
  const container=useRef<HTMLDivElement>(null),request=useRef(0);
  const [open,setOpen]=useState(false),[allowed,setAllowed]=useState(false),[file,setFile]=useState<File|null>(null),[url,setUrl]=useState('');
  const [fields,setFields]=useState<Fields>({}),[selected,setSelected]=useState<string[]>([]),[scope,setScope]=useState<Target|null>(null);
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  useEffect(()=>{if(!file){setUrl('');return;}const u=URL.createObjectURL(file);setUrl(u);return ()=>URL.revokeObjectURL(u);},[file]);
  useEffect(()=>{reset();return ()=>{request.current++;};},[collection,id]);
  function reset(){request.current++;setOpen(false);setAllowed(false);setBusy(false);setFile(null);setFields({});setSelected([]);setScope(null);setFeedback('');}
  function form(){const f=container.current?.closest('form');if(!f)throw new Error('Chưa mở biểu mẫu.');return f;}
  function target(){const roomId=String(new FormData(form()).get('roomId')||'');if(!roomId)throw new Error('Chọn phòng trong biểu mẫu trước khi đọc hợp đồng.');return {roomId,collection,id};}
  async function extract(){
    const seq=++request.current;setBusy(true);setFeedback('');setFields({});setSelected([]);
    try{
      const t=target();if(!allowed||!file)throw new Error('Chọn ảnh hợp đồng giấy.');
      if(file.size>5*1024*1024)throw new Error('Ảnh hợp đồng tối đa 5 MB.');
      const result=await api('/paper-contract/extract',{method:'POST',body:JSON.stringify({...t,geminiConsent:allowed,source:'paper-contract',fileName:file.name,image:await encode(file)})});
      if(seq===request.current){setFields(result.fields);setScope(t);}
    }catch(e){if(seq===request.current)setFeedback((e as Error).message);}finally{if(seq===request.current)setBusy(false);}
  }
  async function confirm(){
    const seq=++request.current;setBusy(true);setFeedback('');
    try{
      const t=target();if(!scope||t.roomId!==scope.roomId||t.collection!==scope.collection||t.id!==scope.id)throw new Error('Biểu mẫu đã đổi. Đọc lại hợp đồng cho hồ sơ đang chọn.');
      await api('/paper-contract/confirm',{method:'POST',body:JSON.stringify(t)});
      if(seq!==request.current||target().roomId!==scope.roomId)return;
      const confirmed=Object.fromEntries(selected.map(key=>[key,fields[key]]));
      if(onApply)onApply(confirmed);else for(const [key,value] of Object.entries(confirmed)){
        const field=form().elements.namedItem(key) as HTMLInputElement|HTMLSelectElement|null;
        if(field)field.value=value;
      }
      reset();setFeedback('Đã điền vào bản đang sửa: '+selected.map(k=>labels[k]).join(', ')+'.');
    }catch(e){if(seq===request.current)setFeedback((e as Error).message);}finally{if(seq===request.current)setBusy(false);}
  }
  function display(key:string,value:string){const el=container.current?.closest('form')?.elements.namedItem(key);return el instanceof HTMLSelectElement?Array.from(el.options).find(o=>o.value===value)?.text||value:value;}
  return <div className="stack" ref={container}>{!open?<button type="button" className="btn" onClick={()=>{setFeedback('');setOpen(true);}}>Nhập từ hợp đồng giấy</button>:<fieldset className="stack"><legend>Đọc hợp đồng giấy</legend>
    <label className="inline"><input type="checkbox" checked={allowed} onChange={e=>{setAllowed(e.target.checked);setFile(null);setFields({});setSelected([]);}} disabled={busy}/>Tôi đồng ý gửi ảnh hợp đồng này đến Google Gemini để đọc các trường. Tôi chỉ chọn trang hợp đồng và che số CCCD trước khi gửi.</label>
    {allowed&&<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Ảnh hợp đồng giấy" disabled={busy} onChange={e=>{
      const candidate=e.target.files?.[0]||null;setFields({});setSelected([]);setFeedback('');
      if(candidate&&/cccd|cmnd|can[ _-]*cuoc|chung[ _-]*minh|identity[ _-]*card/i.test(candidate.name.normalize('NFD').replace(/\p{M}/gu,''))){setFile(null);e.target.value='';setFeedback('Chỉ chọn ảnh hợp đồng giấy. Số CCCD nhập tay.');}else setFile(candidate);
    }}/>}
    {file&&<button type="button" className="btn" disabled={busy} onClick={extract}>{busy?'Đang xử lý…':'Đọc ảnh hợp đồng'}</button>}
    {url&&<div className="form-grid"><a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Hợp đồng giấy đang đối chiếu" style={{width:'100%',maxHeight:440,objectFit:'contain'}}/></a>
      {!!Object.keys(fields).length&&<div className="stack">{Object.entries(fields).map(([key,value])=><div key={key} className="field"><label><input type="checkbox" checked={selected.includes(key)} onChange={e=>setSelected(list=>e.target.checked?[...list,key]:list.filter(x=>x!==key))}/> {labels[key]}</label>
        {['roomId','tenantId'].includes(key)?<span>{display(key,value)}</span>:<input aria-label={'Đối chiếu '+labels[key]} value={value} onChange={e=>setFields(old=>({...old,[key]:e.target.value}))}/>}</div>)}
        <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy||!selected.length}>Điền các trường đã xác nhận</button></div>}</div>}
    <button type="button" className="btn" onClick={reset}>Hủy đọc hợp đồng</button></fieldset>}
    {feedback&&<p role="status">{feedback}</p>}</div>;
}
