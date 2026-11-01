/** Native, local-only Ollama transport. No SDK, key or cloud fallback. */
export class OllamaError extends Error {
  constructor(code,message){super(message);this.name='OllamaError';this.code=code;}
}

export function ollamaConfig(){
  const raw=process.env.OLLAMA_HOST||'http://127.0.0.1:11434';
  let url;
  try{url=new URL(raw.includes('://')?raw:`http://${raw}`);}catch{throw new OllamaError('configuration','Địa chỉ Ollama không hợp lệ.');}
  if(!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/'){
    throw new OllamaError('configuration','Trozy chỉ kết nối Ollama cục bộ tại localhost hoặc địa chỉ loopback.');
  }
  const model=process.env.TROZY_AI_MODEL||'qwen3:4b-instruct';
  if(!/^[a-zA-Z0-9._:/-]{1,120}$/.test(model)||/(?:^|[-:])cloud(?:$|[-:])/i.test(model))throw new OllamaError('configuration','Chọn model Ollama tải cục bộ; không dùng model cloud.');
  const configured=Number(process.env.TROZY_AI_TIMEOUT_MS||60000);
  const timeoutMs=Number.isFinite(configured)?Math.min(120000,Math.max(100,configured)):60000;
  return {host:url.origin,model,timeoutMs};
}

async function readBounded(response,limit){
  if(Number(response.headers.get('content-length'))>limit)throw new OllamaError('response_size','Phản hồi Ollama vượt giới hạn.');
  const reader=response.body?.getReader();if(!reader)return '';
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw new OllamaError('response_size','Phản hồi Ollama vượt giới hạn.');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  return Buffer.concat(chunks).toString('utf8');
}

async function request(path,{body,timeoutMs,maxRequestBytes=60*1024}={}){
  const config=ollamaConfig(),controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs??config.timeoutMs);timeout.unref?.();
  try{
    const serialized=body===undefined?undefined:JSON.stringify(body);
    if(serialized&&Buffer.byteLength(serialized)>maxRequestBytes)throw new OllamaError('request_size','Ngữ cảnh quá dài cho lượt hỏi hiện tại.');
    const response=await fetch(`${config.host}${path}`,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:serialized,redirect:'error',signal:controller.signal});
    const text=await readBounded(response,192*1024);
    if(!response.ok)throw new OllamaError(response.status===404?'model_missing':'unavailable',response.status===404?'Model chưa có trong Ollama. Hãy tải model đã cấu hình.':'Ollama chưa xử lý được yêu cầu.');
    let value;try{value=JSON.parse(text);}catch{throw new OllamaError('invalid_json','Ollama trả dữ liệu không hợp lệ.');}
    if(!value||typeof value!=='object'||Array.isArray(value)||value.error)throw new OllamaError('invalid_json','Ollama trả dữ liệu không hợp lệ.');
    return value;
  }catch(error){
    if(error instanceof OllamaError)throw error;
    if(controller.signal.aborted)throw new OllamaError('timeout','Ollama phản hồi quá lâu; đang dùng kết quả cục bộ.');
    throw new OllamaError('unavailable','Chưa kết nối được Ollama trên máy này.');
  }finally{clearTimeout(timeout);}
}

/** Lightweight status checks do not load models or pull downloads. */
export async function getOllamaStatus(){
  let config;try{config=ollamaConfig();}catch(error){return {provider:'ollama',available:false,model:process.env.TROZY_AI_MODEL||'qwen3:4b-instruct',modelInstalled:false,models:[],message:error.message};}
  try{
    const result=await request('/api/tags',{timeoutMs:1500});
    if(!Array.isArray(result.models))throw new OllamaError('invalid_json','Danh sách model Ollama không hợp lệ.');
    const models=result.models.filter(item=>item&&typeof item.name==='string'&&!item.remote_model&&!item.remote_host&&!/(?:^|[-:])cloud(?:$|[-:])/i.test(item.name)).map(item=>item.name).slice(0,100);
    const normalized=value=>value.includes(':')?value:`${value}:latest`;
    const modelInstalled=models.some(name=>normalized(name)===normalized(config.model));
    return {provider:'ollama',available:true,model:config.model,modelInstalled,models,message:modelInstalled?'Ollama cục bộ đã sẵn sàng.':`Ollama đang chạy nhưng chưa có model ${config.model}.`};
  }catch(error){return {provider:'ollama',available:false,model:config.model,modelInstalled:false,models:[],message:error.message};}
}

export async function ollamaJson({system,prompt,schema,maxTokens=900,timeoutMs}={}){
  if(typeof system!=='string'||typeof prompt!=='string'||!schema||typeof schema!=='object')throw new OllamaError('request','Thiếu nội dung hoặc schema Ollama.');
  const config=ollamaConfig();
  const response=await request('/api/chat',{timeoutMs:timeoutMs??config.timeoutMs,body:{model:config.model,messages:[{role:'system',content:system},{role:'user',content:prompt}],format:schema,stream:false,think:false,keep_alive:'5m',options:{temperature:0,num_predict:Math.min(1600,Math.max(100,maxTokens)),num_ctx:8192}}});
  if(response.done!==true||response.done_reason==='length'||typeof response.message?.content!=='string'||response.message.content.length>24000)throw new OllamaError('incomplete','Ollama chưa trả lời hoàn chỉnh.');
  let result;try{result=JSON.parse(response.message.content);}catch{throw new OllamaError('invalid_json','Nội dung trả lời chưa đúng định dạng yêu cầu.');}
  if(!result||typeof result!=='object'||Array.isArray(result))throw new OllamaError('invalid_json','Nội dung trả lời chưa đúng định dạng yêu cầu.');
  return result;
}
