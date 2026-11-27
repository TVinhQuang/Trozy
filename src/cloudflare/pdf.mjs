import pdfMake from 'pdfmake/build/pdfmake.min.js';
import fonts from 'pdfmake/build/vfs_fonts.js';

export function renderDocument(definition) {
  const report = pdfMake.createPdf(definition, undefined, undefined, fonts);
  return new Promise((resolve, reject) => {
    const doc = report.getStream();
    const chunks = [];
    doc.on('error', reject);
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}
