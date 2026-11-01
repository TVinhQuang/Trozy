// Real Rooms/Dashboard components with synthetic scoped data and a real XLSX roundtrip.
// This is an isolated DOM check, not a rendered browser/layout test.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer as createVite } from 'vite';
import ExcelJS from 'exceljs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:5173/', pretendToBeVisual: true });
const previous = new Map();
function install(name, value) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
for (const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','Element','Node','Event','MouseEvent','KeyboardEvent','File','FileReader','FormData','MutationObserver']) {
  install(name, name === 'window' ? dom.window : name === 'document' ? dom.window.document : dom.window[name]);
}
install('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
install('requestAnimationFrame', callback => setTimeout(() => callback(Date.now()), 0));
install('cancelAnimationFrame', clearTimeout);
install('IS_REACT_ACT_ENVIRONMENT', true);
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.scrollTo = () => {};
const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
const originalClick = dom.window.HTMLAnchorElement.prototype.click;
const nativeFetch = globalThis.fetch;
const downloads = [], blobs = new Map();
let failDownload = false, blobSequence = 0;
URL.createObjectURL = blob => {
  if (failDownload) throw new Error('Không thể tạo tệp tải xuống thử nghiệm.');
  const url = `blob:rooms-ui-${++blobSequence}`; blobs.set(url, blob); return url;
};
URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function () {
  downloads.push({ name: this.download, blob: blobs.get(this.href) });
};
globalThis.fetch = async url => { throw new Error(`Room UI checks must not issue network requests: ${url}`); };
const vite = await createVite({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { createElement: h } = await import('react');
const { render, screen, fireEvent, within, waitFor, cleanup, act, configure } = await import('@testing-library/react');
configure({ asyncUtilTimeout: 6000 });
const { AppContext } = await vite.ssrLoadModule('/src/frontend/context.tsx');
const { Rooms, Dashboard } = await vite.ssrLoadModule('/src/frontend/pages/Core.tsx');
const { collections } = await vite.ssrLoadModule('/src/frontend/types.ts');
const { money, today } = await vite.ssrLoadModule('/src/frontend/api.ts');
const displayedMoney = value => money(value).replace(/\s+/g, ' ');
let checks = 0;
function pass(message) { checks++; console.log(`PASS ${message}`); }

function dataFixture() {
  const data = Object.fromEntries(collections.map(name => [name, []]));
  data.properties = [
    { id:'p1', name:'Cơ sở Ánh Hồng', address:'Địa chỉ mẫu A', archived:false },
    { id:'p2', name:'Cơ sở Bình Minh', address:'Địa chỉ mẫu B', archived:false },
  ];
  data.rooms = [
    { id:'r1', propertyId:'p1', code:'A101', floor:1, status:'occupied', price:3500000, area:24, capacity:3, amenities:'Máy lạnh, Wi-Fi', description:'Phòng có cửa sổ' },
    { id:'r2', propertyId:'p1', code:'A102', floor:1, status:'vacant', price:3000000, area:20, capacity:2, amenities:'Wi-Fi', description:'Phòng trống' },
    { id:'r3', propertyId:'p1', code:'A201', floor:2, status:'maintenance', price:4000000, area:28, capacity:3, amenities:'Bếp riêng' },
    { id:'r4', propertyId:'p2', code:'B01', floor:0, status:'vacant', price:0, area:22, capacity:2, amenities:'Chưa trang bị' },
  ];
  data.tenants = [
    { id:'t1', propertyId:'p1', roomId:'r1', name:'Nguyễn Ánh Hồng', status:'active', moveInDate:'2020-01-01', members:'', identityNumber:'PRIVATE-ID-NEVER-EXPORT', phone:'PRIVATE-PHONE-NEVER-EXPORT' },
    { id:'reservation-tenant', propertyId:'p1', name:'Người đặt giữ chỗ', status:'active' },
    { id:'old', propertyId:'p1', roomId:'r1', name:'Khách cũ đã rời đi', status:'left', moveInDate:'2018-01-01' },
    { id:'spoof', propertyId:'p2', roomId:'r1', name:'Không ghép sai cơ sở', status:'active' },
  ];
  data.contracts = [
    { id:'c1', propertyId:'p1', roomId:'r1', tenantId:'t1', status:'active', startDate:'2020-01-01', endDate:'2099-12-31', rent:3400000, deposit:3500000 },
    { id:'reservation-contract', propertyId:'p1', roomId:'r2', tenantId:'reservation-tenant', status:'draft', startDate:'2099-01-01', endDate:'2099-12-31', rent:3000000, deposit:9000000 },
    { id:'old-c', propertyId:'p1', roomId:'r1', tenantId:'old', status:'ended', startDate:'2018-01-01', endDate:'2019-12-31', rent:2500000, deposit:2500000 },
    { id:'spoof-c', propertyId:'p2', roomId:'r1', tenantId:'spoof', status:'active', startDate:'2020-01-01', endDate:'2099-12-31', rent:99999999, deposit:99999999 },
  ];
  data.deposits = [
    { id:'dep1', propertyId:'p1', roomId:'r1', tenantId:'t1', contractId:'c1', type:'receipt', amount:3500000, date:'2020-01-01' },
    { id:'dep2', propertyId:'p1', roomId:'r1', tenantId:'t1', contractId:'c1', type:'deduction', amount:500000, date:'2020-02-01' },
    { id:'dep3', propertyId:'p1', roomId:'r1', tenantId:'t1', contractId:'c1', type:'refund', amount:200000, date:'2020-03-01' },
    { id:'reservation-receipt', propertyId:'p1', roomId:'r2', tenantId:'reservation-tenant', contractId:'reservation-contract', type:'receipt', amount:1500000, date:'2026-11-01' },
    { id:'reservation-refund', propertyId:'p1', roomId:'r2', tenantId:'reservation-tenant', contractId:'reservation-contract', type:'refund', amount:200000, date:'2026-11-01' },
    { id:'reservation-deduction', propertyId:'p1', roomId:'r2', tenantId:'reservation-tenant', contractId:'reservation-contract', type:'deduction', amount:100000, date:'2026-11-01' },
    { id:'old-dep', propertyId:'p1', roomId:'r1', tenantId:'old', contractId:'old-c', type:'receipt', amount:2500000, date:'2018-01-01' },
    { id:'spoof-dep', propertyId:'p2', roomId:'r1', tenantId:'spoof', contractId:'c1', type:'receipt', amount:99999999, date:'2020-01-01' },
  ];
  data.invoices = [
    { id:'inv1', propertyId:'p1', roomId:'r1', tenantId:'t1', contractId:'c1', period:'2020-01', status:'issued', total:5000000, paid:1500000, dueDate:'2020-02-01' },
    { id:'inv-old', propertyId:'p1', roomId:'r1', tenantId:'old', contractId:'old-c', period:'2019-01', status:'issued', total:500000, paid:0, dueDate:'2019-02-01' },
    { id:'inv-draft', propertyId:'p1', roomId:'r1', tenantId:'t1', status:'draft', total:8000000, paid:0, dueDate:'2020-02-01' },
    { id:'inv-cancelled', propertyId:'p1', roomId:'r1', tenantId:'t1', status:'cancelled', total:9000000, paid:0, dueDate:'2020-02-01' },
    { id:'inv-spoof', propertyId:'p2', roomId:'r1', tenantId:'spoof', status:'issued', total:99999999, paid:0, dueDate:'2020-02-01' },
  ];
  data.readings = [
    { id:'read1', propertyId:'p1', roomId:'r1', period:'2020-01', confirmed:true, electricNew:1234, waterNew:125 },
    { id:'read2', propertyId:'p1', roomId:'r1', period:'2020-02', confirmed:false, electricNew:9999, waterNew:9999 },
  ];
  data.issues = [
    { id:'issue1', propertyId:'p1', roomId:'r1', title:'Vòi nước', status:'new', priority:'normal' },
    { id:'issue2', propertyId:'p1', roomId:'r1', title:'Đã hoàn tất', status:'closed' },
  ];
  return data;
}
function fixture({ role='landlord', propertyId='', tenantScoped=false } = {}) {
  let data = dataFixture();
  if (tenantScoped) {
    const scoped = Object.fromEntries(collections.map(name => [name, []]));
    for (const name of ['rooms','contracts','deposits','invoices','readings','issues']) scoped[name] = data[name].filter(row => row.propertyId === 'p1' && row.roomId === 'r1' && (!row.tenantId || row.tenantId === 't1'));
    scoped.rooms = data.rooms.filter(row => row.id === 'r1');
    scoped.properties = data.properties.filter(row => row.id === 'p1');
    scoped.tenants = data.tenants.filter(row => row.id === 't1');
    data = scoped;
  }
  const user = { id:'ui-user', name:'Người dùng kiểm thử', role, tenantId:role==='tenant'?'t1':undefined };
  const mutations=[], notifications=[], navigation=[];
  const value = { user, data, bootstrap:{user,data}, propertyId, page:'rooms', setPropertyId() {}, navigate(page) { navigation.push(page); }, notify(...args) { notifications.push(args); }, refresh:async()=>{}, mutate:async(...args)=>{mutations.push(args);return {};}, remove:async()=>assert.fail('No remove permitted in these tests'), action:async()=>assert.fail('No action permitted in these tests') };
  return { value, mutations, notifications, navigation };
}
function mount(Component, context) { return render(h(AppContext.Provider,{value:context.value},h(Component))); }
const roomRows = () => [...document.querySelectorAll('.rooms-overview-table tbody tr[data-room-id]')].filter(row=>!row.closest('[hidden]'));
const visibleIds = () => roomRows().map(row=>row.dataset.roomId).sort();
const rowFor = id => { const row=roomRows().find(item=>item.dataset.roomId===id); assert.ok(row,`Missing room row ${id}`); return within(row); };
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target:{value} });
const clearSearch = () => change('Tìm phòng','');
const mainTab = () => screen.getByRole('tab',{name:'Bảng tổng hợp',exact:true});
const cardTab = () => screen.getByRole('tab',{name:'Xem từng phòng',exact:true});
const depositMetric = () => within(screen.getByText('Tổng cọc đang giữ',{selector:'dt'}).parentElement).getByRole('definition').textContent;
function exportedCell(sheet, row, heading) {
  const headers=[]; sheet.getRow(1).eachCell((cell,index)=>{headers[index]=cell.text;});
  const index=headers.indexOf(heading); assert.ok(index>0,`Missing Excel heading: ${heading}`);
  return sheet.getRow(row).getCell(index).value;
}

try {
  let ctx=fixture(), view=mount(Rooms,ctx);
  assert.equal(mainTab().getAttribute('aria-selected'),'true');
  assert.equal(cardTab().getAttribute('aria-selected'),'false');
  assert.deepEqual(visibleIds(),['r1','r2','r3','r4']);
  assert.ok(screen.getByRole('region',{name:'Bảng tổng hợp phòng trọ, có thể cuộn ngang'}));
  assert.ok(screen.getByText(/Cơ sở Ánh Hồng.*Tầng 1/));
  assert.ok(screen.getByText(/Cơ sở Bình Minh.*Tầng trệt/));
  const a101=rowFor('r1');
  assert.ok(a101.getByText('Nguyễn Ánh Hồng'));
  assert.ok(a101.getByText(displayedMoney(2800000)));
  assert.ok(a101.getByText(displayedMoney(4000000)));
  const a102=rowFor('r2');
  assert.ok(a102.getByText(displayedMoney(1200000)));
  assert.ok(a102.getByText(`Lượt thuê hiện tại: ${displayedMoney(0)}`));
  assert.ok(a102.getByText(`Giữ chỗ: ${displayedMoney(1200000)}`));
  assert.ok(a102.getByText('Chưa có người thuê'));
  assert.ok(a102.getByText('Chưa có hợp đồng hiện tại'));
  assert.equal(depositMetric(),money(4000000));
  assert.equal(document.querySelector('.rooms-overview-table').textContent.includes('Không ghép sai cơ sở'),false);
  assert.equal(document.querySelector('.rooms-overview-table').textContent.includes('Khách cũ đã rời đi'),false);
  pass('Rooms opens a grouped summary with scoped current tenant, issued room debt and actual current/reservation deposits after refund and deduction');

  change('Tìm phòng','Nguyễn Ánh Hồng'); assert.deepEqual(visibleIds(),['r1']);
  clearSearch(); change('Cơ sở','p2'); assert.deepEqual(visibleIds(),['r4']);
  change('Cơ sở',''); change('Tầng','2'); assert.deepEqual(visibleIds(),['r3']);
  change('Tầng',''); change('Giá thuê từ (₫)','3400000'); change('Giá thuê đến (₫)','3400000'); assert.deepEqual(visibleIds(),['r1']);
  assert.ok(rowFor('r1').getByText(displayedMoney(3400000)));
  change('Giá thuê từ (₫)','3500000'); change('Giá thuê đến (₫)','3500000'); assert.deepEqual(visibleIds(),[],'The listed 3.5m price must not match when the displayed contract rent is 3.4m');
  change('Giá thuê từ (₫)',''); change('Giá thuê đến (₫)','');
  fireEvent.click(screen.getByRole('button',{name:/^Phòng trống/})); assert.deepEqual(visibleIds(),['r2','r4']);
  fireEvent.click(screen.getByRole('button',{name:/^Tất cả/})); assert.equal(visibleIds().length,4);
  pass('Search, property, floor and status filters share the summary; price ranges match the displayed discounted contract rent');

  fireEvent.click(cardTab());
  assert.equal(cardTab().getAttribute('aria-selected'),'true');
  assert.equal(roomRows().length,0);
  assert.equal(document.querySelectorAll('.room-card').length,4);
  assert.ok(screen.getByRole('heading',{name:'Phòng A101',level:3}));
  const occupiedCard=screen.getByRole('heading',{name:'Phòng A101',level:3}).closest('.room-card');
  const occupiedPrice=occupiedCard.querySelector('.room-price').textContent.replace(/\s+/g,' ');
  assert.ok(occupiedPrice.includes(displayedMoney(3400000)));
  assert.equal(occupiedPrice.includes(displayedMoney(3500000)),false);
  assert.ok(within(occupiedCard).getByText(/\/ tháng · Theo hợp đồng$/));
  const vacantCard=screen.getByRole('heading',{name:'Phòng A102',level:3}).closest('.room-card');
  assert.ok(vacantCard.querySelector('.room-price').textContent.replace(/\s+/g,' ').includes(displayedMoney(3000000)));
  assert.ok(within(vacantCard).getByText(/\/ tháng · Giá niêm yết$/));
  change('Giá thuê từ (₫)','3400000'); change('Giá thuê đến (₫)','3400000');
  assert.equal(document.querySelectorAll('.room-card').length,1);
  assert.ok(screen.getByRole('heading',{name:'Phòng A101',level:3}));
  change('Giá thuê từ (₫)',''); change('Giá thuê đến (₫)','');
  fireEvent.click(within(document.querySelector('.room-card')).getByRole('button',{name:/Thông tin phòng/}));
  assert.ok(screen.getByRole('dialog',{name:'Phòng A101'}));
  fireEvent.click(within(screen.getByRole('dialog',{name:'Phòng A101'})).getByRole('button',{name:'Đóng',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:'Chỉnh sửa phòng A101',exact:true}));
  assert.ok(screen.getByRole('dialog',{name:'Chỉnh sửa phòng A101'}));
  fireEvent.click(within(screen.getByRole('dialog',{name:'Chỉnh sửa phòng A101'})).getByRole('button',{name:'Huỷ',exact:true}));
  fireEvent.keyDown(cardTab(),{key:'Home'}); assert.equal(mainTab().getAttribute('aria-selected'),'true');
  fireEvent.keyDown(mainTab(),{key:'ArrowRight'}); assert.equal(cardTab().getAttribute('aria-selected'),'true');
  fireEvent.keyDown(cardTab(),{key:'ArrowLeft'}); assert.equal(mainTab().getAttribute('aria-selected'),'true');
  pass('The separate room tab preserves cards and detail/edit dialogs, shares effective displayed rent and price filtering, and supports keyboard tab activation');

  change('Tìm phòng','A101');
  const beforeDownload=downloads.length;
  fireEvent.click(screen.getByRole('button',{name:'Xuất Excel',exact:true}));
  await waitFor(()=>assert.equal(downloads.length,beforeDownload+1));
  const output=downloads.at(-1);
  assert.match(output.name,/\.xlsx$/i);
  assert.ok(output.blob instanceof Blob);
  const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(await output.blob.arrayBuffer());
  const sheet=workbook.worksheets[0]; assert.ok(sheet);
  const exported=[]; sheet.eachRow(row=>exported.push(row.values));
  const serialized=JSON.stringify(exported);
  assert.ok(serialized.includes('A101'));
  assert.ok(serialized.includes('Nguyễn Ánh Hồng'));
  for(const other of ['A102','A201','B01','PRIVATE-ID-NEVER-EXPORT','PRIVATE-PHONE-NEVER-EXPORT','Không ghép sai cơ sở'])assert.equal(serialized.includes(other),false,`${other} must not be exported`);
  const values=exported.flat(2); assert.ok(values.includes(2800000)); assert.ok(values.includes(4000000));
  assert.equal(exportedCell(sheet,2,'Cọc lượt thuê hiện tại (₫)'),2800000);
  assert.equal(exportedCell(sheet,2,'Cọc giữ chỗ (₫)'),0);
  assert.equal(exportedCell(sheet,2,'Tổng cọc phòng (₫)'),2800000);
  assert.ok(sheet.views.some(item=>item.state==='frozen'));
  assert.ok(sheet.autoFilter);
  for(const row of exported)for(const cell of row)assert.equal(Boolean(cell&&typeof cell==='object'&&'formula' in cell),false);
  await waitFor(()=>assert.ok(screen.getByRole('button',{name:'Xuất Excel',exact:true})));
  pass('Excel downloads a real XLSX containing only filtered permitted rooms with numeric money, Unicode, frozen headers and no private fields');

  change('Tìm phòng','A102');
  assert.equal(depositMetric(),money(1200000));
  fireEvent.click(screen.getByRole('button',{name:'Xuất Excel',exact:true}));
  await waitFor(()=>assert.equal(downloads.length,beforeDownload+2));
  const reservationBook=new ExcelJS.Workbook(); await reservationBook.xlsx.load(await downloads.at(-1).blob.arrayBuffer());
  const reservationSheet=reservationBook.getWorksheet('Tổng hợp phòng');
  assert.equal(reservationSheet.rowCount,2);
  assert.equal(exportedCell(reservationSheet,2,'Phòng'),'A102');
  assert.equal(exportedCell(reservationSheet,2,'Cọc lượt thuê hiện tại (₫)'),0);
  assert.equal(exportedCell(reservationSheet,2,'Cọc giữ chỗ (₫)'),1200000);
  assert.equal(exportedCell(reservationSheet,2,'Tổng cọc phòng (₫)'),1200000);
  assert.equal(exportedCell(reservationSheet,2,'Số hồ sơ đang ở'),0);
  await waitFor(()=>assert.equal(screen.getByRole('button',{name:'Xuất Excel',exact:true}).disabled,false));
  pass('Filtered summary metric and downloaded XLSX retain actual net reservation money separately from current tenancy and promised draft deposits');

  failDownload=true;
  fireEvent.click(screen.getByRole('button',{name:'Xuất Excel',exact:true}));
  await waitFor(()=>assert.ok(screen.getByRole('alert')));
  assert.match(screen.getByRole('alert').textContent,/tạo tệp|xuất|tải/i);
  await waitFor(()=>assert.equal(screen.getByRole('button',{name:'Xuất Excel',exact:true}).disabled,false));
  assert.equal(downloads.length,beforeDownload+2); failDownload=false;
  change('Tìm phòng','không-tồn-tại');
  assert.equal(roomRows().length,0);
  assert.equal(screen.getByRole('button',{name:'Xuất Excel',exact:true}).disabled,true);
  assert.ok(screen.getByText('Chưa có phòng phù hợp'));
  assert.deepEqual(ctx.mutations,[]);
  view.unmount();
  pass('Failed Excel download reports an error and permits retry; empty filters disable export without mutating records');

  ctx=fixture({propertyId:'p2'}); view=mount(Rooms,ctx);
  assert.deepEqual(visibleIds(),['r4']);
  assert.ok(rowFor('r4').getAllByText(displayedMoney(0)).length > 0);
  view.unmount();
  ctx=fixture({role:'tenant',tenantScoped:true}); view=mount(Rooms,ctx);
  assert.deepEqual(visibleIds(),['r1']);
  assert.equal(screen.queryByRole('button',{name:'Xuất Excel',exact:true}),null);
  assert.equal(screen.queryByRole('button',{name:/Thêm phòng/}),null);
  assert.equal(screen.queryByRole('button',{name:'Chỉnh sửa phòng A101',exact:true}),null);
  assert.equal(document.querySelector('.rooms-overview-table').textContent.includes('B01'),false);
  assert.deepEqual(ctx.mutations,[]); view.unmount();
  pass('Global property scope and tenant data scope are retained, and tenant views omit owner export/create/edit controls');

  ctx=fixture(); view=mount(Dashboard,ctx);
  for(const unwanted of ['Chào ','một ngày tốt lành','Hôm nay, mình chăm chút','Mọi hoạt động nhà trọ, trong một góc nhìn.'])assert.equal(document.body.textContent.includes(unwanted),false);
  const stamp=document.querySelector('time.rose-dashboard-date'); assert.ok(stamp); assert.match(stamp.getAttribute('datetime'),/^\d{4}-\d{2}-\d{2}$/);
  assert.match(stamp.textContent,/\d{4}/);
  for(const [label,variant]of [['Quản lý phòng trọ','btn-primary'],['Theo dõi điện nước','btn-info'],['Xem báo cáo','btn-report']]) {
    assert.ok(screen.getByRole('button',{name:label,exact:true}).classList.contains(variant), `${label} must retain its distinct action background`);
  }
  fireEvent.click(screen.getByRole('button',{name:'Quản lý phòng trọ',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:'Theo dõi điện nước',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:'Xem báo cáo',exact:true}));
  assert.deepEqual(ctx.navigation,['rooms','readings','reports']); view.unmount();
  pass('Dashboard removes greeting copy while retaining the date and working room, reading and report actions');
  console.log(`PASS: ${checks} room/dashboard UI groups with synthetic data and real Excel roundtrip. Browser layout remains separate.`);
} finally {
  cleanup(); await vite.close(); dom.window.close();
  URL.createObjectURL=originalCreate; URL.revokeObjectURL=originalRevoke;
  dom.window.HTMLAnchorElement.prototype.click=originalClick;
  globalThis.fetch=nativeFetch;
  for(const[name,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}
