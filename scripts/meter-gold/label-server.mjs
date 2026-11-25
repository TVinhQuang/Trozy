/**
 * Local-only labeling page for the gold set.
 *
 * Bound to 127.0.0.1 with a random per-run token; requests with a foreign Host
 * header are refused (DNS-rebinding guard). Validation/test photos are labeled
 * blind: the reader suggestion is refused for them so model mistakes cannot be
 * copied into the benchmark that measures the model.
 */
import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadManifest,saveManifest,validLayout,UTILITIES} from './gold-lib.mjs';

const MAX_BODY=4096;
const page=token=>`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gán nhãn ảnh công tơ</title><style>
body{font:18px/1.5 system-ui,sans-serif;margin:0;color:#171b24;background:#f4f7fc}
main{max-width:1100px;margin:0 auto;padding:16px;display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:20px}
@media(max-width:800px){main{grid-template-columns:1fr}}
img{max-width:100%;max-height:75vh;background:#dfe6f2;border-radius:8px;cursor:zoom-in}img.zoom{max-height:none;cursor:zoom-out}
form{display:grid;gap:12px}label{display:grid;gap:4px;font-weight:600}
input,select{font:inherit;padding:8px;border:1px solid #46505f;border-radius:6px}
button{font:inherit;font-weight:600;padding:10px 14px;border-radius:6px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;cursor:pointer}
button.secondary{background:#fff;color:#1d4ed8}button:disabled{opacity:1;background:#c8d0de;border-color:#c8d0de;color:#171b24;cursor:not-allowed}
.badge{display:inline-block;padding:2px 10px;border-radius:99px;background:#dbe5fb;font-weight:600}.note{color:#46505f}.sug{padding:8px;background:#fff;border-radius:6px}
</style></head><body><main>
<section><div id="progress" class="note" role="status"></div><img id="photo" alt="Ảnh công tơ cần gán nhãn"></section>
<section><form id="f" autocomplete="off">
<div><span class="badge" id="split"></span> <span class="note" id="blind"></span></div>
<label>Loại công tơ<select id="utility"><option value="electric">Điện</option><option value="water">Nước</option></select></label>
<label>Tổng số bánh số<input id="digits" type="number" min="1" max="12" required></label>
<label>Số bánh phần lẻ (0 nếu chỉ ghi số nguyên)<input id="decimals" type="number" min="0" max="4" required></label>
<label>Chỉ số phần nguyên đọc bằng mắt<input id="label" inputmode="numeric" pattern="[0-9]{1,9}" autofocus></label>
<div id="sug" class="sug" hidden></div>
<button type="submit">Lưu và ảnh tiếp theo</button>
<button type="button" class="secondary" id="suggest">Gợi ý từ bộ đọc Trozy</button>
<button type="button" class="secondary" id="skip">Bỏ qua ảnh này</button>
<button type="button" class="secondary" id="bad">Ảnh không đọc được — loại khỏi tập</button>
</form><p class="note" id="msg" role="status"></p></section></main>
<script>
const T=${JSON.stringify(token)};let cur=null;const $=id=>document.getElementById(id);
const api=async(path,body)=>{const r=await fetch(path,{method:body?'POST':'GET',headers:{'x-gold-token':T,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j;};
async function next(){const q=await api('/api/queue');$('progress').textContent='Còn '+q.remaining+' ảnh chưa gán nhãn / '+q.total+' ảnh';
 cur=q.item;$('msg').textContent='';$('sug').hidden=true;$('label').value='';if(!cur){$('photo').removeAttribute('src');$('split').textContent='Hết ảnh';return;}
 $('photo').src='/img/'+cur.id+'?t='+encodeURIComponent(T);$('photo').className='';$('utility').value=cur.utility;$('digits').value=cur.digits??(cur.utility==='water'?5:6);$('decimals').value=cur.decimals??(cur.utility==='water'?0:1);
 $('split').textContent='Tập '+cur.split+(cur.hard?' · ca khó':'');const blind=cur.split!=='train';$('blind').textContent=blind?'Gán nhãn mù: không có gợi ý, hãy đọc bằng mắt.':'';$('suggest').disabled=blind;$('label').focus();}
$('photo').onclick=()=>$('photo').classList.toggle('zoom');
const layout=()=>({utility:$('utility').value,digits:+$('digits').value,decimals:+$('decimals').value});
$('f').onsubmit=async e=>{e.preventDefault();if(!cur)return;const v=$('label').value.trim();if(!/^[0-9]{1,9}$/.test(v)){$('msg').textContent='Nhập chỉ số phần nguyên (chỉ chữ số).';return;}
 try{await api('/api/label',{id:cur.id,...layout(),label:+v});await next();}catch(x){$('msg').textContent=x.message;}};
$('suggest').onclick=async()=>{if(!cur)return;try{const s=await api('/api/suggest',{id:cur.id,...layout()});$('sug').hidden=false;$('sug').textContent=s.reading===null?'Bộ đọc chưa chắc ('+s.status+'). Hãy đọc bằng mắt.':'Bộ đọc đề xuất '+s.reading+' — chỉ là gợi ý, hãy đối chiếu ảnh và gõ lại.';}catch(x){$('msg').textContent=x.message;}};
$('skip').onclick=async()=>{if(!cur)return;await api('/api/skip',{id:cur.id});await next();};
$('bad').onclick=async()=>{if(!cur)return;await api('/api/exclude',{id:cur.id});await next();};
next().catch(x=>$('msg').textContent=x.message);
</script></body></html>`;

function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"});
  res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));
}
const fail=(res,status,error)=>send(res,status,{error});

async function readJson(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Object.assign(new Error('Yêu cầu quá lớn.'),{status:413});chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('JSON không hợp lệ.'),{status:400});}
}

export function createLabelHandler({root,token,suggest,port,now=()=>new Date().toISOString()}){
  const served=new Map();   // id -> integer the reader suggested (train items only)
  const skipped=new Set();
  const tokenOk=value=>typeof value==='string'&&value.length===token.length&&timingSafeEqual(Buffer.from(value),Buffer.from(token));
  const hostOk=host=>[`127.0.0.1:${port}`,`localhost:${port}`].includes(host);
  const find=(manifest,id)=>typeof id==='string'&&/^[0-9a-f]{16}$/.test(id)?manifest.items.find(item=>item.id===id):null;
  const pending=manifest=>manifest.items.filter(item=>item.label===null&&!item.excluded);

  return async function handle(req,res){
    try{
      if(!hostOk(req.headers.host))return fail(res,403,'Host không được phép.');
      const url=new URL(req.url,'http://local');
      const supplied=req.headers['x-gold-token']??url.searchParams.get('t');
      if(!tokenOk(supplied))return fail(res,403,'Thiếu hoặc sai mã phiên.');
      if(req.method==='GET'&&url.pathname==='/')return send(res,200,page(token),'text/html; charset=utf-8');
      const manifest=loadManifest(root);

      if(req.method==='GET'&&url.pathname==='/api/queue'){
        const open=pending(manifest),candidates=open.filter(item=>!skipped.has(item.id));
        const item=candidates[0]??null;
        return send(res,200,{total:manifest.items.filter(row=>!row.excluded).length,remaining:open.length,item:item&&{id:item.id,utility:item.utility,split:item.split,digits:item.digits,decimals:item.decimals,hard:item.hard}});
      }
      if(req.method==='GET'&&url.pathname.startsWith('/img/')){
        const item=find(manifest,url.pathname.slice(5));
        if(!item)return fail(res,404,'Không tìm thấy ảnh.');
        return send(res,200,readFileSync(join(root,item.file)),'image/jpeg');
      }
      if(req.method!=='POST')return fail(res,404,'Không tìm thấy.');
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return fail(res,415,'Cần JSON.');
      const body=await readJson(req);
      const item=find(manifest,body.id);
      if(!item)return fail(res,404,'Không tìm thấy ảnh.');

      if(url.pathname==='/api/skip'){skipped.add(item.id);return send(res,200,{ok:true});}
      if(url.pathname==='/api/exclude'){
        item.excluded=true;saveManifest(manifest,root);return send(res,200,{ok:true});
      }
      const layoutOk=UTILITIES.includes(body.utility)&&validLayout(body.digits,body.decimals);
      if(!layoutOk)return fail(res,400,'Loại công tơ hoặc số bánh số/phần lẻ không hợp lệ.');
      if(url.pathname==='/api/suggest'){
        if(item.split!=='train')return fail(res,403,'Ảnh val/test được gán nhãn mù; không có gợi ý.');
        const result=await suggest({bytes:readFileSync(join(root,item.file)),utility:body.utility,digits:body.digits,decimals:body.decimals});
        const value=result?.status==='ready'&&Number.isSafeInteger(result.reading?.integerValue)?result.reading.integerValue:null;
        if(value!==null)served.set(item.id,value);
        return send(res,200,{status:result?.status??'error',reading:value});
      }
      if(url.pathname==='/api/label'){
        if(!Number.isSafeInteger(body.label)||body.label<0||body.label>999999999)return fail(res,400,'Chỉ số phần nguyên không hợp lệ.');
        if(item.label!==null)return fail(res,409,'Ảnh này đã có nhãn.');
        const fromSuggestion=item.split==='train'&&served.get(item.id)===body.label;
        Object.assign(item,{utility:body.utility,digits:body.digits,decimals:body.decimals,label:body.label,labelSource:fromSuggestion?'human-confirmed-suggestion':'human-typed',labeledAt:now()});
        saveManifest(manifest,root);
        return send(res,200,{ok:true,labelSource:item.labelSource});
      }
      return fail(res,404,'Không tìm thấy.');
    }catch(error){
      return fail(res,error.status||500,error.status?error.message:'Lỗi nội bộ.');
    }
  };
}

export function startLabelServer({root,suggest,port=0}){
  const token=randomBytes(24).toString('hex');
  let handler;
  const server=createServer((req,res)=>handler(req,res));
  return new Promise((resolveStart,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',()=>{
      const actual=server.address().port;
      handler=createLabelHandler({root,token,suggest,port:actual});
      resolveStart({server,url:`http://127.0.0.1:${actual}/?t=${token}`,token});
    });
  });
}
