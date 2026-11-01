/** Technical capture checks, not a probability that a meter reading is correct. */
export function analyzeMeterPixels({data,width,height,channels=4}={}, {scope='frame'}={}) {
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<3||height<3||width*height>12000000||![1,3,4].includes(channels)||!data||data.length!==width*height*channels)throw new TypeError('Invalid meter image pixels.');
 if(!['frame','counter'].includes(scope))throw new TypeError('Invalid image quality scope.');
 const gray=new Float32Array(width*height);let sum=0,square=0,dark=0,light=0,glare=0;
 for(let i=0;i<gray.length;i++){
  const offset=i*channels,r=data[offset],g=channels===1?r:data[offset+1],b=channels===1?r:data[offset+2];
  const y=.2126*r+.7152*g+.0722*b;gray[i]=y;sum+=y;square+=y*y;
  if(y<18)dark++;if(y>245)light++;if(r>=250&&g>=250&&b>=250)glare++;
 }
 let lap=0,lapSquare=0,count=0;
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x,value=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-width]-gray[i+width];lap+=value;lapSquare+=value*value;count++;
 }
 const mean=sum/gray.length,contrast=Math.sqrt(Math.max(0,square/gray.length-mean*mean)),edgeEnergy=Math.max(0,lapSquare/count-(lap/count)**2);
 const rounded=value=>Math.round(value*1000)/1000;
 const metrics={width,height,meanLuma:rounded(mean),contrast:rounded(contrast),edgeEnergy:rounded(edgeEnergy),clippedDark:rounded(dark/gray.length),clippedLight:rounded(light/gray.length),glareFraction:rounded(glare/gray.length)};
 // Evaluate at native scale or a bounded downsample; never upscale to pass resolution.
 // A white printed counter or a black drum background can legitimately dominate
 // the crop. Clipped highlights alone do not prove glare when strong glyphs remain.
 const checks={resolution:scope==='counter'?Math.max(width,height)>=180&&Math.min(width,height)>=28:Math.max(width,height)>=320&&Math.min(width,height)>=240,exposure:mean>=20&&mean<=245&&dark/gray.length<.94&&light/gray.length<.94,contrast:contrast>=20,sharpness:edgeEnergy>=45,glare:glare/gray.length<.8||contrast>=35&&edgeEnergy>=80};
 const messages={resolution:scope==='counter'?'Vùng bộ đếm quá nhỏ. Đưa camera gần hơn, giữ đủ cả dãy số và đơn vị.':'Ảnh quá nhỏ. Chụp lại ở độ phân giải cao hơn.',exposure:'Ảnh quá tối hoặc quá sáng. Điều chỉnh ánh sáng rồi chụp lại.',contrast:'Các nét số chưa tách rõ khỏi nền. Chọn vùng bộ đếm và điều chỉnh ánh sáng.',sharpness:'Vùng ảnh chưa đủ nét. Giữ máy yên và chạm lấy nét vào dãy số.',glare:'Vùng ảnh bị cháy sáng nhiều. Đổi góc để giảm phản chiếu.'};
 const reasons=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>messages[key]),pass=reasons.length===0;
 return {version:1,status:pass?'pass':'retake',canSubmit:pass&&scope==='counter',scope,checks,reasons,metrics};
}
