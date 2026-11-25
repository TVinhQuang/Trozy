/** Image-derived layout proof shared by the process bridge and owner API. */
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const share=value=>Number.isFinite(value)&&value>=0&&value<=1;

export function waterAgreementEvidence(value,reading){
 return object(value)&&value.agreement===true&&Array.isArray(value.observations)&&value.observations.length===2&&typeof reading?.digits==='string'&&value.observations.every(row=>object(row)&&row.digits===reading.digits&&share(row.confidence)&&row.confidence>=.7&&Array.isArray(row.corners)&&row.corners.length===4&&row.corners.every(point=>Array.isArray(point)&&point.length===2&&point.every(share)));
}

export function imageLayoutEvidence(value,configuration,reading,utility,ocrEvidence){
 if(!object(value)||value.version!==1||value.source!=='image'||value.complete!==true||
    !object(configuration)||value.digits!==configuration.digits||value.decimals!==configuration.decimals||
    !Number.isSafeInteger(value.digits)||value.digits<3||value.digits>12||
    !Number.isSafeInteger(value.decimals)||value.decimals<1||value.decimals>4||value.decimals>=value.digits||value.digits-value.decimals>9||
    value.countSource!==(utility==='electric'?'ocr-line':'detected-wheel-grid')||
    !Array.isArray(value.cells)||!Array.isArray(value.separatorTexts))return null;
 const cells=value.cells.map((cell,index)=>object(cell)&&cell.index===index&&share(cell.redShare)&&share(cell.neutralShare)?{index,redShare:cell.redShare,neutralShare:cell.neutralShare}:null);
 if(cells.some(cell=>cell===null))return null;
 if(value.method==='red-suffix'){
  if(cells.length!==value.digits||value.separatorTexts.length!==0||
     !cells.every((cell,index)=>index<value.digits-value.decimals?cell.redShare<=.008&&cell.neutralShare>=.15:cell.redShare>=.015))return null;
 }else if(value.method==='printed-decimal'){
  if(utility!=='electric'||cells.length!==0||value.separatorTexts.length!==2||!reading?.digits)return null;
  const pattern=new RegExp(`^[0-9]{${value.digits-value.decimals}}\\.[0-9]{${value.decimals}}$`);
  if(!value.separatorTexts.every(text=>typeof text==='string'&&text.length<=96&&pattern.test(text.replace(/\s/g,''))&&text.replace(/\s/g,'').replace('.','')===reading.digits))return null;
  const selected=ocrEvidence?.selectedObservationIndices;
  if(!Array.isArray(selected)||selected.length!==2||new Set(selected).size!==2||!selected.every((index,position)=>Number.isSafeInteger(index)&&index>=0&&typeof ocrEvidence?.observations?.[index]?.text==='string'&&ocrEvidence.observations[index].text.replace(/\s/g,'')===value.separatorTexts[position].replace(/\s/g,'')))return null;
 }else return null;
 return {version:1,source:'image',method:value.method,digits:value.digits,decimals:value.decimals,cells,separatorTexts:[...value.separatorTexts],countSource:value.countSource,complete:true};
}
