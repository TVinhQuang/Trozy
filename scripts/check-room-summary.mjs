// Pure summary calculations and XLSX round-trips with synthetic records only.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import ExcelJS from 'exceljs';

const vite = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
try {
  const {collections} = await vite.ssrLoadModule('/src/frontend/types.ts');
  const {buildRoomSummaries} = await vite.ssrLoadModule('/src/frontend/room-summary.ts');
  const {createRoomWorkbook,exportRoomWorkbook} = await vite.ssrLoadModule('/src/frontend/room-export.ts');
  const data=Object.fromEntries(collections.map(key=>[key,[]]));
  data.properties=[{id:'p1',name:'Nhà trọ mẫu Ánh Hồng'},{id:'p2',name:'Cơ sở khác'}];
  data.rooms=[
    {id:'room-current',propertyId:'p1',code:'001',floor:0,area:20,capacity:3,price:4000000,status:'occupied',amenities:'Máy lạnh, Wi-Fi',description:'Mô tả tiếng Việt '+('rất dài '.repeat(25))},
    {id:'room-vacant',propertyId:'p1',code:'002',floor:0,area:0,capacity:0,price:0,status:'vacant'},
    {id:'room-handover',propertyId:'p1',code:'201',floor:2,area:21,capacity:2,price:2500000,status:'handover'},
    {id:'room-expired',propertyId:'p1',code:'202',floor:2,area:22,capacity:2,price:2600000,status:'occupied'},
    {id:'room-foreign',propertyId:'p2',code:'B1',floor:1,area:30,capacity:3,price:6000000,status:'occupied'},
  ];
  data.tenants=[
    {id:'tenant-current',propertyId:'p1',roomId:'room-current',name:'Nguyễn Ánh Hồng',status:'active',members:'Hai người? Ghi chú không phải số hồ sơ',identityNumber:'PRIVATE-ID-NOT-EXPORT',email:'private@example.test'},
    {id:'tenant-old',propertyId:'p1',roomId:'room-current',name:'Người thuê cũ',status:'left'},
    {id:'tenant-fake',propertyId:'p2',roomId:'room-current',name:'Không thuộc cơ sở',status:'active'},
    {id:'tenant-handover',propertyId:'p1',roomId:'room-handover',name:'Chờ bàn giao',status:'active'},
    {id:'tenant-expired',propertyId:'p1',roomId:'room-expired',name:'Hợp đồng quá hạn',status:'active'},
  ];
  data.contracts=[
    {id:'contract-current',propertyId:'p1',roomId:'room-current',tenantId:'tenant-current',startDate:'2026-08-01',endDate:'2027-07-31',rent:3800000,deposit:4000000,status:'active'},
    {id:'contract-old',propertyId:'p1',roomId:'room-current',tenantId:'tenant-old',startDate:'2025-01-01',endDate:'2026-07-31',rent:3000000,status:'ended'},
    {id:'contract-future',propertyId:'p1',roomId:'room-current',tenantId:'tenant-current',startDate:'2027-08-01',endDate:'2028-07-31',rent:9000000,status:'draft'},
    {id:'contract-wrong-property',propertyId:'p2',roomId:'room-current',tenantId:'tenant-fake',startDate:'2026-10-01',endDate:'2028-07-31',rent:99000000,status:'active'},
    {id:'contract-vacant-old',propertyId:'p1',roomId:'room-vacant',tenantId:'old-vacant',startDate:'2025-01-01',endDate:'2025-12-31',rent:2900000,status:'ended'},
    {id:'contract-handover',propertyId:'p1',roomId:'room-handover',tenantId:'tenant-handover',startDate:'2026-01-01',endDate:'2026-10-31',rent:2500000,status:'ended',endedAt:'2026-10-30T10:00:00Z'},
    {id:'contract-expired',propertyId:'p1',roomId:'room-expired',tenantId:'tenant-expired',startDate:'2025-01-01',endDate:'2026-10-31',rent:2600000,status:'active'},
  ];
  const deposit=(id,contractId,tenantId,type,amount,roomId='room-current',propertyId='p1')=>({id,contractId,tenantId,type,amount,roomId,propertyId});
  data.deposits=[deposit('d1','contract-current','tenant-current','receipt',4000000),deposit('d2','contract-current','tenant-current','deduction',200000),deposit('d3','contract-current','tenant-current','refund',300000),deposit('old-deposit','contract-old','tenant-old','receipt',99000000),deposit('mismatch-tenant','contract-current','tenant-old','receipt',88000000),deposit('foreign-deposit','contract-current','tenant-current','receipt',77000000,'room-current','p2'),deposit('vacant-deposit','contract-vacant-old','old-vacant','receipt',66000000,'room-vacant'),deposit('handover-deposit','contract-handover','tenant-handover','receipt',2500000,'room-handover')];
  const invoice=(id,status,total,paid,dueDate,tenantId='tenant-current',propertyId='p1')=>({id,status,total,paid,dueDate,tenantId,propertyId,roomId:'room-current'});
  data.invoices=[invoice('current-invoice','issued',4500000,2000000,'2026-10-05'),invoice('old-invoice','issued',1000000,0,'2026-07-05','tenant-old'),invoice('future-invoice','issued',200000,0,'2026-12-05'),invoice('draft','draft',99000000,0,'2026-01-01'),invoice('cancelled','cancelled',88000000,0,'2026-01-01'),invoice('paid','issued',100,150,'2026-01-01'),invoice('foreign','issued',77000000,0,'2026-01-01','tenant-fake','p2')];
  data.readings=[
    {id:'read-old',propertyId:'p1',roomId:'room-current',period:'2026-09',confirmed:true,electricNew:900,waterNew:100},
    {id:'read-zero',propertyId:'p1',roomId:'room-current',period:'2026-10',confirmed:true,electricNew:0,waterNew:0},
    {id:'read-pending',propertyId:'p1',roomId:'room-current',period:'2026-11',confirmed:false,electricNew:9999,waterNew:9999},
    {id:'read-foreign',propertyId:'p2',roomId:'room-current',period:'2026-12',confirmed:true,electricNew:8888,waterNew:8888},
  ];
  data.issues=['new','progress','resolved','closed'].map((status,index)=>({id:`issue-${index}`,propertyId:'p1',roomId:'room-current',status}));
  data.issues.push({id:'wrong-issue',propertyId:'p2',roomId:'room-current',status:'new'});
  const permittedRooms=data.rooms.filter(room=>room.propertyId==='p1');
  const rows=buildRoomSummaries(data,permittedRooms,'2026-11-01');
  assert.equal(rows.length,4); assert.equal(rows.some(row=>row.propertyId==='p2'),false);
  const current=rows[0];
  assert.equal(current.contractId,'contract-current');assert.equal(current.contractRent,3800000);
  assert.equal(current.heldDeposit,3500000);assert.equal(current.reservationDeposit,0);assert.equal(current.roomDebt,3700000);assert.equal(current.overdueDebt,3500000);
  assert.deepEqual(current.tenantNames,['Nguyễn Ánh Hồng']);assert.equal(current.tenantCount,1);
  assert.equal(current.electricReading,0);assert.equal(current.waterReading,0);assert.equal(current.latestReadingPeriod,'2026-10');assert.equal(current.openIssues,3);
  assert.equal(rows[1].contractId,null);assert.equal(rows[1].heldDeposit,0);assert.equal(rows[1].contractRent,null);assert.equal(rows[1].listedRent,0);assert.equal(rows[1].electricReading,null);
  assert.equal(rows[2].contractId,'contract-handover');assert.equal(rows[2].heldDeposit,2500000);assert.equal(rows[2].contractState,'Chờ bàn giao');
  assert.equal(rows[3].contractState,'Đã quá hạn hợp đồng');assert.equal(rows[3].tenantNames[0],'Hợp đồng quá hạn');
  assert.deepEqual(buildRoomSummaries(data,[],'2026-11-01'),[]);
  console.log('PASS Scoped summaries preserve current contracts, explicit deposits, room debts, confirmed zeros, future drafts and old-tenancy boundaries');

  const reservationData=structuredClone(data);
  reservationData.contracts.push(
    {id:'reservation-first',propertyId:'p1',roomId:'room-vacant',tenantId:'reservation-tenant',status:'draft',deposit:99000000,startDate:'2027-01-01',endDate:'2027-12-31'},
    {id:'reservation-second',propertyId:'p1',roomId:'room-vacant',tenantId:'reservation-second-tenant',status:'draft',deposit:88000000,startDate:'2027-01-01',endDate:'2027-12-31'},
    {id:'reservation-foreign',propertyId:'p2',roomId:'room-vacant',tenantId:'reservation-tenant',status:'draft',deposit:77000000,startDate:'2027-01-01',endDate:'2027-12-31'},
  );
  reservationData.deposits.push(
    deposit('reservation-receipt','reservation-first','reservation-tenant','receipt',1500000,'room-vacant'),
    deposit('reservation-refund','reservation-first','reservation-tenant','refund',200000,'room-vacant'),
    deposit('reservation-deduction','reservation-first','reservation-tenant','deduction',100000,'room-vacant'),
    deposit('reservation-second-receipt','reservation-second','reservation-second-tenant','receipt',300000,'room-vacant'),
    deposit('reservation-wrong-tenant','reservation-first','wrong-tenant','receipt',66000000,'room-vacant'),
    deposit('reservation-wrong-property','reservation-first','reservation-tenant','receipt',55000000,'room-vacant','p2'),
    deposit('reservation-wrong-room','reservation-first','reservation-tenant','receipt',44000000,'room-current'),
    deposit('reservation-foreign-contract','reservation-foreign','reservation-tenant','receipt',33000000,'room-vacant'),
  );
  const reserved=buildRoomSummaries(reservationData,[data.rooms[1]],'2026-11-01')[0];
  assert.equal(reserved.reservationDeposit,1500000);
  assert.equal(reserved.heldDeposit,0);assert.equal(reserved.contractId,null);assert.equal(reserved.contractRent,null);
  assert.equal(reserved.tenantCount,0,'A reservation receipt is not a current tenancy');
  const reservationBook=await createRoomWorkbook([reserved]);
  const reservationRestored=new ExcelJS.Workbook();await reservationRestored.xlsx.load(await reservationBook.xlsx.writeBuffer());
  const reservationSheet=reservationRestored.getWorksheet('Tổng hợp phòng');
  const reservationHeaders=[];reservationSheet.getRow(1).eachCell((cell,index)=>reservationHeaders[index]=cell.text);
  assert.equal(reservationSheet.getRow(2).getCell(reservationHeaders.indexOf('Cọc lượt thuê hiện tại (₫)')).value,0);
  assert.equal(reservationSheet.getRow(2).getCell(reservationHeaders.indexOf('Cọc giữ chỗ (₫)')).value,1500000);
  assert.equal(reservationSheet.getRow(2).getCell(reservationHeaders.indexOf('Tổng cọc phòng (₫)')).value,1500000);
  assert.equal(reservationRestored.getWorksheet('Thông tin xuất').getCell('A3').value,'Thời gian xuất (UTC)');
  console.log('PASS Draft reservations use actual net receipts, reject mismatched ledger joins and remain separate from current-tenancy money in XLSX');

  const workbook=await createRoomWorkbook(rows,{scopeLabel:'Cơ sở mẫu',exportedAt:new Date('2026-11-01T06:00:00Z')});
  const buffer=await workbook.xlsx.writeBuffer();
  const restored=new ExcelJS.Workbook();await restored.xlsx.load(buffer);
  const sheet=restored.getWorksheet('Tổng hợp phòng');
  const headers=[];sheet.getRow(1).eachCell((cell,index)=>headers[index]=cell.text);
  const column=name=>headers.indexOf(name);
  assert.equal(sheet.rowCount,5);assert.equal(sheet.views[0].ySplit,1);assert.equal(sheet.views[0].xSplit,2);assert.ok(sheet.autoFilter);
  assert.equal(sheet.getRow(2).getCell(column('Phòng')).value,'001');
  assert.equal(sheet.getRow(2).getCell(column('Công nợ phòng (₫)')).value,3700000);
  assert.equal(sheet.getRow(2).getCell(column('Cọc lượt thuê hiện tại (₫)')).value,3500000);
  assert.equal(sheet.getRow(2).getCell(column('Điện đã chốt (kWh)')).value,0);
  assert.equal(sheet.getRow(3).getCell(column('Điện đã chốt (kWh)')).value,null);
  assert.equal(sheet.getRow(3).getCell(column('Giá niêm yết (₫/tháng)')).value,0);
  assert.equal(sheet.getRow(3).getCell(column('Giá hợp đồng (₫/tháng)')).value,null);
  assert.equal(sheet.getRow(2).getCell(column('Ngày bắt đầu')).value.toISOString().slice(0,10),'2026-08-01');
  assert.equal(sheet.getRow(2).getCell(column('Người thuê hiện tại')).value,'Nguyễn Ánh Hồng');
  assert.ok(sheet.getRow(2).height>36,'Long descriptions receive enough row height');
  const serialized=JSON.stringify(restored.model);
  for(const forbidden of ['PRIVATE-ID-NOT-EXPORT','private@example.test','contract-current','room-current','tenant-current'])assert.equal(serialized.includes(forbidden),false,forbidden);
  console.log('PASS Real XLSX round-trip retains Vietnamese labels, exact numeric money, dates, leading zeros and blanks without private record fields');

  const formulaLabel='=HYPERLINK("https://example.test","Text")';
  const malicious={...current,code:formulaLabel,tenantNames:['+CMD'],propertyName:'@formula',amenities:'-1+1',description:'=1+1'};
  const safe=await createRoomWorkbook([malicious]);
  const safeRestored=new ExcelJS.Workbook();await safeRestored.xlsx.load(await safe.xlsx.writeBuffer());
  const safeSheet=safeRestored.getWorksheet('Tổng hợp phòng');
  assert.equal(safeSheet.getCell('B2').value,formulaLabel);
  safeSheet.eachRow(row=>row.eachCell(cell=>assert.equal(cell.type===ExcelJS.ValueType.Formula,false)));
  const empty=await createRoomWorkbook([]);const emptyRestored=new ExcelJS.Workbook();await emptyRestored.xlsx.load(await empty.xlsx.writeBuffer());
  assert.equal(emptyRestored.getWorksheet('Tổng hợp phòng').rowCount,1);
  console.log('PASS Formula-looking labels stay literal text and empty exports retain a valid header-only workbook');

  const originalURLCreate=URL.createObjectURL,originalURLRevoke=URL.revokeObjectURL,originalDocument=globalThis.document;
  let capturedBlob,clicked=false,filename='';
  URL.createObjectURL=blob=>{capturedBlob=blob;return 'blob:room-summary-fixture';};URL.revokeObjectURL=()=>{};
  globalThis.document={createElement:()=>({set href(value){assert.equal(value,'blob:room-summary-fixture');},set download(value){filename=value;},click(){clicked=true;}})};
  try {
    await exportRoomWorkbook([current],{scopeLabel:'Chỉ một phòng'});
    assert.equal(clicked,true);assert.match(filename,/^Trozy-tong-hop-phong-\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.equal(capturedBlob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const downloadRestored=new ExcelJS.Workbook();await downloadRestored.xlsx.load(await capturedBlob.arrayBuffer());
    assert.equal(downloadRestored.getWorksheet('Tổng hợp phòng').rowCount,2);
  } finally {URL.createObjectURL=originalURLCreate;URL.revokeObjectURL=originalURLRevoke;if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
  console.log('PASS Browser download packages only supplied filtered rows as an actual XLSX file');
  console.log('PASS: 5 room summary/export groups with synthetic records and no business database writes.');
} finally {await vite.close();}
