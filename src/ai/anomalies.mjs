/** Explainable B02 statistics. It never changes readings, invoices or money. */
const round=(value,digits=2)=>Number(value.toFixed(digits));
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
const days=period=>{const [year,month]=period.split('-').map(Number);return new Date(Date.UTC(year,month,0)).getUTCDate();};
const validPeriod=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const indexValue=value=>value===null||value===undefined||value===''?NaN:Number(value);
const nextMonth=value=>{const [year,month]=value.split('-').map(Number);return `${month===12?year+1:year}-${String(month===12?1:month+1).padStart(2,'0')}`;};
const idOf=(reading,utility,kind)=>`utility:${reading.roomId}:${reading.period}:${utility}:${kind}`;
export function analyzeUtilities({data,input={}}){
 const rooms=(data.rooms||[]).filter(room=>(!input.roomId||room.id===input.roomId)&&(!input.propertyId||room.propertyId===input.propertyId));
 const readings=(data.readings||[]).filter(reading=>reading.confirmed&&validPeriod(reading.period)&&rooms.some(room=>room.id===reading.roomId)&&(!input.period||reading.period<=input.period));
 const alerts=[],insufficientRooms=new Set();let roomsAnalyzed=0;
 for(const room of rooms){
  const history=readings.filter(reading=>reading.roomId===room.id).sort((a,b)=>a.period.localeCompare(b.period));
  const current=input.period?history.find(reading=>reading.period===input.period):history.at(-1);
  if(!current)continue;roomsAnalyzed++;
  const earlier=history.filter(reading=>reading.period<current.period).slice(-6);
  const settings=(data.settings||[]).find(row=>row.propertyId===room.propertyId)||{};
  const threshold=Number.isFinite(Number(settings.anomalyThreshold))?Math.min(1000,Math.max(5,Number(settings.anomalyThreshold))):50;
  for(const utility of ['electric','water']){
   const oldField=utility==='electric'?'electricOld':'waterOld',newField=utility==='electric'?'electricNew':'waterNew',unit=utility==='electric'?'kWh':'m³',label=utility==='electric'?'điện':'nước';
   const from=indexValue(current[oldField]),to=indexValue(current[newField]),usage=to-from;
   const eligible=earlier.filter((row,index)=>Number.isFinite(indexValue(row[newField]))&&Number.isFinite(indexValue(row[oldField]))&&indexValue(row[newField])>=indexValue(row[oldField])&&(!index||nextMonth(earlier[index-1].period)===row.period));
   const trace=[...eligible,current].filter(row=>Number.isFinite(indexValue(row[newField])-indexValue(row[oldField]))).map(row=>({period:row.period,usage:round(indexValue(row[newField])-indexValue(row[oldField]))}));
   const common={propertyId:room.propertyId,roomId:room.id,roomCode:room.code,period:current.period,utility,currentUsage:Number.isFinite(usage)?round(usage):0,threshold,readingId:current.id,reviewed:false,history:trace};
   const previous=earlier.at(-1),prior=previous?indexValue(previous[newField]):undefined;
   if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<from||(prior!==undefined&&from!==prior)){
    alerts.push({...common,id:idOf(current,utility,'invalid'),kind:'invalid',severity:'critical',baseline:Number.isFinite(prior)?prior:0,changePercent:null,explanation:!Number.isFinite(from)||!Number.isFinite(to)?`Chỉ số ${label} không phải số hợp lệ.`:to<from?`Chỉ số ${label} mới (${to}) nhỏ hơn chỉ số cũ (${from}).`:`Chỉ số ${label} đầu kỳ (${from}) không nối tiếp chỉ số cuối kỳ trước (${prior}).`,recommendation:'Đối chiếu ảnh công tơ và lịch sử chỉ số; nếu thay công tơ, ghi rõ biên bản trước khi điều chỉnh.'});continue;
   }
   if(eligible.length<3||!previous||nextMonth(previous.period)!==current.period){insufficientRooms.add(room.id);continue;}
   const rates=eligible.map(row=>(Number(row[newField])-Number(row[oldField]))/days(row.period));
   const center=median(rates),baseline=center*days(current.period),difference=usage-baseline;
   const absoluteFloor=utility==='electric'?20:3;
   const mad=median(rates.map(rate=>Math.abs(rate-center)))*days(current.period);
   const material=Math.abs(difference)>=Math.max(absoluteFloor,3*mad);
   // A zero historical baseline cannot support a percentage. Require an absolute
   // material increase and explain this case explicitly instead of dividing by zero.
   const changePercent=baseline>0?round(difference/baseline*100):null;
   const triggered=material&&(baseline===0?usage>=absoluteFloor:Math.abs(changePercent)>=threshold);
   if(!triggered)continue;
   const kind=difference>0?'spike':'drop';
   const severe=kind==='spike'&&(baseline===0?usage>=absoluteFloor*4:changePercent>=Math.max(150,threshold*2));
   alerts.push({...common,id:idOf(current,utility,kind),kind,severity:severe?'critical':'warning',baseline:round(baseline),changePercent,
    explanation:baseline===0?`Các kỳ trước ghi nhận 0 ${unit}; kỳ ${current.period} sử dụng ${round(usage)} ${unit}. Không tính phần trăm trên nền 0.`:`Mức ${label} kỳ ${current.period} là ${round(usage)} ${unit}, ${kind==='spike'?'tăng':'giảm'} ${Math.abs(changePercent)}% so với mức tham chiếu ${round(baseline)} ${unit}. Tham chiếu là trung vị ${eligible.length} kỳ trước, đã quy đổi theo số ngày trong tháng.`,
    recommendation:kind==='spike'?'Kiểm tra ảnh và chỉ số đã nhập, số người ở và thay đổi sử dụng. Nếu chỉ số đúng, chủ trọ và người thuê kiểm tra thiết bị thực tế; cảnh báo này không kết luận có rò rỉ.':'Kiểm tra tình trạng sử dụng phòng, ảnh chỉ số và việc thay công tơ. Mức giảm có thể do thay đổi nhu cầu; không tự điều chỉnh hóa đơn.'});
  }
 }
 return {feature:'B02',engine:'statistics',alerts:alerts.sort((a,b)=>Number(b.severity==='critical')-Number(a.severity==='critical')||String(a.roomCode||'').localeCompare(String(b.roomCode||''))),summary:{roomsAnalyzed,readingsAnalyzed:readings.length,alertCount:alerts.length,criticalCount:alerts.filter(row=>row.severity==='critical').length,insufficientHistory:insufficientRooms.size},generatedAt:new Date().toISOString()};
}
