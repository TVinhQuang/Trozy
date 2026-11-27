import PdfPrinter from 'pdfmake';
import fonts from 'pdfmake/build/vfs_fonts.js';
import {contractDocument,invoiceDocument,receiptDocument} from './business-documents.mjs';

const printer=new PdfPrinter({Roboto:{normal:Buffer.from(fonts['Roboto-Regular.ttf'],'base64'),bold:Buffer.from(fonts['Roboto-Medium.ttf'],'base64')}});
function renderPdf(definition){
  const doc=printer.createPdfKitDocument(definition);
  const chunks=[];const bytes=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});doc.end();
  return bytes;
}

async function render(document){
  return {bytes:await renderPdf(document.definition),version:document.version};
}
export const contractPdf=(...args)=>render(contractDocument(...args));
export const receiptPdf=(...args)=>render(receiptDocument(...args));
export const invoicePdf=(...args)=>render(invoiceDocument(...args));
