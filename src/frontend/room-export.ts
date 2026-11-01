import type { RoomSummary } from './room-summary';
import { today } from './api';

export type RoomExportMetadata = { scopeLabel?: string; exportedAt?: Date };
const roomStates: Record<string, string> = { vacant: 'Phòng trống', occupied: 'Đang thuê', maintenance: 'Bảo trì', handover: 'Chờ bàn giao', archived: 'Đã lưu trữ' };
const excelDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
};

export async function createRoomWorkbook(rows: RoomSummary[], metadata: RoomExportMetadata = {}) {
  const imported = await import('exceljs');
  const ExcelJS = imported.default || imported;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Trozy';
  workbook.created = metadata.exportedAt || new Date();
  const sheet = workbook.addWorksheet('Tổng hợp phòng', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  sheet.columns = [
    {header:'Cơ sở',key:'property',width:28},
    {header:'Phòng',key:'room',width:15},
    {header:'Tầng',key:'floor',width:10},
    {header:'Diện tích (m²)',key:'area',width:16},
    {header:'Sức chứa',key:'capacity',width:12},
    {header:'Trạng thái phòng',key:'status',width:20},
    {header:'Giá niêm yết (₫/tháng)',key:'listedRent',width:24},
    {header:'Giá hợp đồng (₫/tháng)',key:'contractRent',width:24},
    {header:'Cọc lượt thuê hiện tại (₫)',key:'deposit',width:27},
    {header:'Cọc giữ chỗ (₫)',key:'reservationDeposit',width:22},
    {header:'Tổng cọc phòng (₫)',key:'totalDeposit',width:24},
    {header:'Công nợ phòng (₫)',key:'debt',width:23},
    {header:'Nợ quá hạn (₫)',key:'overdue',width:22},
    {header:'Người thuê hiện tại',key:'tenants',width:30},
    {header:'Số hồ sơ đang ở',key:'tenantCount',width:20},
    {header:'Ngày bắt đầu',key:'start',width:18},
    {header:'Ngày kết thúc',key:'end',width:18},
    {header:'Tình trạng hợp đồng',key:'contractState',width:27},
    {header:'Kỳ chỉ số đã chốt',key:'period',width:20},
    {header:'Điện đã chốt (kWh)',key:'electric',width:23},
    {header:'Nước đã chốt (m³)',key:'water',width:22},
    {header:'Sự cố chưa đóng',key:'issues',width:20},
    {header:'Tiện nghi',key:'amenities',width:34},
    {header:'Mô tả',key:'description',width:42},
  ];
  for (const room of rows) {
    // Every text value is supplied as a string. ExcelJS never interprets formula-like
    // labels as formulas, hyperlinks or rich objects; no raw record is exported.
    sheet.addRow({property:String(room.propertyName),room:String(room.code),floor:room.floor,
      area:room.area,capacity:room.capacity,status:roomStates[room.status] || String(room.status),
      listedRent:room.listedRent,contractRent:room.contractRent,deposit:room.heldDeposit,
      reservationDeposit:room.reservationDeposit,totalDeposit:room.heldDeposit+room.reservationDeposit,
      debt:room.roomDebt,overdue:room.overdueDebt,tenants:room.tenantNames.join('; '),tenantCount:room.tenantCount,
      start:excelDate(room.contractStart),end:excelDate(room.contractEnd),contractState:room.contractState,
      period:room.latestReadingPeriod,electric:room.electricReading,water:room.waterReading,
      issues:room.openIssues,amenities:String(room.amenities),description:String(room.description)});
  }
  sheet.autoFilter = { from: {row:1,column:1}, to: {row:Math.max(1,sheet.rowCount),column:sheet.columnCount} };
  sheet.getRow(1).height = 36;
  sheet.getRow(1).font = {bold:true,color:{argb:'FF751442'}};
  sheet.getRow(1).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFFFB3D5'}};
  sheet.getRow(1).alignment = {vertical:'middle',wrapText:true};
  for (const key of ['listedRent','contractRent','deposit','reservationDeposit','totalDeposit','debt','overdue']) sheet.getColumn(key).numFmt = '#,##0" ₫"';
  for (const key of ['area','electric','water']) sheet.getColumn(key).numFmt = '#,##0.###';
  for (const key of ['start','end']) sheet.getColumn(key).numFmt = 'dd/mm/yyyy';
  sheet.eachRow((row,index)=>{
    if (index === 1) return;
    row.alignment = {vertical:'top',wrapText:true};
    let lines = 1;
    row.eachCell(cell => {
      const width = Math.max(8, Number(sheet.getColumn(cell.col).width || 12) - 2);
      lines = Math.max(lines, ...cell.text.split('\n').map(text => Math.max(1, Math.ceil(text.length / width))));
    });
    row.height = Math.min(409, Math.max(30, lines * 16 + 10));
    if (index % 2 === 0) row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF0F7'}};
  });
  const info = workbook.addWorksheet('Thông tin xuất');
  info.columns=[{header:'Thông tin',key:'label',width:26},{header:'Giá trị',key:'value',width:85}];
  info.addRows([
    {label:'Phạm vi',value:String(metadata.scopeLabel || 'Các phòng đang lọc')},
    {label:'Thời gian xuất (UTC)',value:metadata.exportedAt || workbook.created},
    {label:'Số phòng',value:rows.length},
    {label:'Công nợ phòng',value:'Tổng còn phải thu của hóa đơn đã phát hành theo phòng, có thể gồm lượt thuê trước; không phải chỉ nợ của người thuê hiện tại.'},
    {label:'Cọc lượt thuê hiện tại',value:'Chỉ các giao dịch nhận, khấu trừ và hoàn cọc thuộc hợp đồng hiện tại hoặc lượt đang chờ bàn giao.'},
    {label:'Cọc giữ chỗ',value:'Số tiền thực nhận còn lại trên các hợp đồng nháp của phòng sau hoàn/khấu trừ; không lấy số cọc thỏa thuận làm tiền đã nhận.'},
    {label:'Tổng cọc phòng',value:'Cọc lượt thuê hiện tại cộng cọc giữ chỗ thực nhận. Hai khoản được tách để không gán cọc giữ chỗ cho người đang thuê.'},
    {label:'Giá niêm yết',value:'Giá phòng trong danh mục; không phải doanh thu thực thu.'},
    {label:'Điện / nước',value:'Chỉ số cuối cùng đã xác nhận. Ô trống nghĩa là chưa có chỉ số, không phải số 0.'},
    {label:'Số hồ sơ đang ở',value:'Số hồ sơ người thuê đang hoạt động thuộc lượt thuê hiện tại; không suy đoán từ ghi chú thành viên.'},
  ]);
  info.getRow(1).font={bold:true,color:{argb:'FF751442'}};
  info.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFB3D5'}};
  info.getCell('B3').numFmt='dd/mm/yyyy hh:mm';
  info.getColumn('value').alignment={vertical:'top',wrapText:true};
  info.eachRow((row,index)=>{if(index>1)row.height=Math.max(30,Math.ceil(row.getCell('value').text.length/77)*16+10);});
  return workbook;
}

export async function exportRoomWorkbook(rows: RoomSummary[], metadata: RoomExportMetadata = {}) {
  const workbook = await createRoomWorkbook(rows, metadata);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as BlobPart], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  try {
    const anchor = document.createElement('a');
    anchor.href=url;
    anchor.download=`Trozy-tong-hop-phong-${today()}.xlsx`;
    anchor.click();
  } finally { setTimeout(()=>URL.revokeObjectURL(url),1000); }
}
