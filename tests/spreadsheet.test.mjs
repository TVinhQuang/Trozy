import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

test('Excel import/export dependency round-trips Unicode, whole-VND values and validation',async()=>{
 const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('Phòng trọ');
 sheet.columns=[{header:'code',key:'code'},{header:'price',key:'price'},{header:'description',key:'description'}];
 sheet.addRow({code:'A101',price:3500000,description:'Phòng có cửa sổ, máy lạnh'});
 // Exercises ExcelJS UUID-backed objects after the security override as well.
 sheet.addImage(workbook.addImage({base64:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',extension:'png'}),'D1:D2');
 sheet.getCell('B2').dataValidation={type:'whole',operator:'greaterThanOrEqual',formulae:[0]};
 const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
 const restored=loaded.getWorksheet('Phòng trọ');assert.equal(restored.getCell('A2').value,'A101');assert.equal(restored.getCell('B2').value,3500000);assert.equal(restored.getCell('C2').value,'Phòng có cửa sổ, máy lạnh');assert.equal(restored.getImages().length,1);
});
