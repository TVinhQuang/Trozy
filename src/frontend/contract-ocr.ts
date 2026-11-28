import {createWorker, OEM} from 'tesseract.js';
import {screenContractText} from '../shared/contract-screen.mjs';

export async function readContractPage(file:File){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Chọn ảnh hợp đồng JPG, PNG hoặc WebP.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('Ảnh không đọc được. Hãy chọn lại hoặc nhập tay.');});
  let text='';
  try{
    if(bitmap.width*bitmap.height>16_000_000)throw new Error('Ảnh quá lớn. Hãy cắt riêng trang hợp đồng rồi thử lại.');
    const canvas=document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Thiết bị chưa thể đọc ảnh. Bạn có thể nhập tay.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0);
    let rejectRead:(reason:Error)=>void=()=>{};
    const unavailable=new Error('Bộ đọc ảnh trên thiết bị chưa sẵn sàng. Hãy thử lại hoặc nhập tay.');
    const failure=new Promise<never>((_,reject)=>{rejectRead=reject;});
    const timer=window.setTimeout(()=>rejectRead(unavailable),90000);
    const loading=createWorker('vie',OEM.LSTM_ONLY,{workerPath:'/contract-ocr/worker.min.js',
      corePath:'/contract-ocr/tesseract-core-lstm.js',langPath:'/contract-ocr',workerBlobURL:false,cacheMethod:'none',
      errorHandler:()=>rejectRead(unavailable)});
    try{
      const worker=await Promise.race([loading,failure]);
      const {data}=await Promise.race([worker.recognize(canvas),failure]);
      if(data.confidence>=55)text=screenContractText(data.text);
    }finally{
      window.clearTimeout(timer);
      void loading.then(worker=>worker.terminate()).catch(()=>{});
    }
  }finally{bitmap.close();}
  if(!text)throw new Error('Chưa nhận diện được trang hợp đồng thuê. Chọn trang rõ tiêu đề và thông tin thuê. Số CCCD nhập tay.');
  return text;
}
