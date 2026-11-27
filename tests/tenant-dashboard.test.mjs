import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer as createVite } from 'vite';
import { openStore, safeUser } from '../src/backend/db.mjs';
import { seedDemo } from '../src/backend/seed.mjs';
import { dataFor, performAction } from '../src/backend/domain.mjs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:5173/', pretendToBeVisual: true,
});
const previous = new Map();
function install(name, value) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver']) {
  install(name, name === 'window' ? dom.window : dom.window[name]);
}
install('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
install('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
install('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
install('IS_REACT_ACT_ENVIRONMENT', true);
install('FormData',dom.window.FormData);

const { createElement: h } = await import('react');
const { render, screen, fireEvent, within, waitFor, cleanup, act } = await import('@testing-library/react');
const vite = await createVite({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { AppContext } = await vite.ssrLoadModule('/src/frontend/context.tsx');
const { Dashboard, Payments } = await vite.ssrLoadModule('/src/frontend/pages/Core.tsx');
const { PrivacyRequests } = await vite.ssrLoadModule('/src/frontend/privacy-requests.tsx');

test('UC67 owner reviews a named member and sees each outcome before the explicit delete button',async t=>{
  const {context,store}=fixture(t);
  const owner=store.account('owner_demo'),tenant=store.get('tenants','tenant_01');
  store.put('tenants',{...tenant,memberProfiles:[{id:'departed',name:'Thành viên đã rời',status:'left',moveOutDate:'2026-01-01',phone:'0900000001'}]});
  context.user=safeUser(owner);
  const record=store.transaction(()=>performAction(store,owner,'privacy-submit',{propertyId:tenant.propertyId,tenantId:tenant.id,personId:'departed',source:'delegate',requesterName:'Người đại diện',fields:['phone','invoices']}));
  const tree=()=>h(AppContext.Provider,{value:context},h(PrivacyRequests,{propertyId:tenant.propertyId}));
  context.data=dataFor(store,owner);
  const view=render(tree());
  context.action=async(name,input)=>{
    const result=store.transaction(()=>performAction(store,owner,name,input));
    context.data=dataFor(store,owner);view.rerender(tree());return result;
  };
  fireEvent.click(screen.getByRole('button',{name:'Kiểm tra yêu cầu'}));
  fireEvent.click(screen.getByLabelText('Đã đối chiếu trực tiếp danh tính người gửi'));
  fireEvent.click(screen.getByLabelText('Đã kiểm tra ủy quyền cho đúng người và phạm vi dữ liệu'));
  fireEvent.change(screen.getByLabelText(/Tình trạng tất toán/),{target:{value:'yes'}});
  const hold=screen.getByLabelText('Số điện thoại trong hồ sơ thuê');assert.equal(hold.checked,true);
  fireEvent.click(hold);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Xem trước kết quả'}));});
  const confirm=await screen.findByRole('button',{name:'Xác nhận xóa các trường đủ điều kiện'});
  assert.match(screen.getByRole('dialog').textContent,/Hóa đơn · Giữ lại/);
  assert.equal(store.get('tenants',tenant.id).memberProfiles[0].phone,'0900000001');
  await act(async()=>{fireEvent.click(confirm);});
  assert.ok(!screen.queryByRole('dialog'));
  assert.equal(store.get('privacyRequests',record.id).status,'partial');
  assert.equal(store.get('tenants',tenant.id).memberProfiles[0].phone,'');
});

function fixture(t) {
  const store = openStore(':memory:');
  seedDemo(store);
  t.after(() => store.close());
  const rawUser = store.db.prepare('SELECT * FROM users WHERE email=?').get('thue@trozy.vn');
  const user = safeUser(rawUser), data = dataFor(store, rawUser);
  const context = {
    user, data, bootstrap: { user, data }, propertyId: '', page: 'dashboard',
    navigate() {}, setPropertyId() {}, notify() {}, refresh: async () => {},
    action: async (name, values) => store.transaction(() => performAction(store, rawUser, name, values)),
  };
  return { store, context, mount: () => render(h(AppContext.Provider, { value: context }, h(Dashboard))) };
}

afterEach(async () => { await act(async () => cleanup()); });
after(async () => {
  await vite.close();
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

test('UC63 filters issued personal costs by billing month and opens the matching document',t=>{
  const {context}=fixture(t),original=context.data.invoices[0];
  context.data.invoices=['01','02','03'].map((month,i)=>({...original,id:'cost-'+month,period:'2027-'+month,status:i===2?'draft':'issued',total:10000,paid:0}));
  render(h(AppContext.Provider,{value:context},h(Payments)));
  const section=screen.getByRole('heading',{name:'Chi phí của tôi'}).closest('section');
  const costs=within(section);
  fireEvent.change(costs.getByLabelText('Từ kỳ'),{target:{value:'2027-02'}});
  fireEvent.change(costs.getByLabelText('Đến kỳ'),{target:{value:'2027-03'}});
  assert.equal(costs.queryByRole('button',{name:'Xem hóa đơn cost-01'}),null);
  assert.equal(costs.queryByRole('button',{name:'Xem hóa đơn cost-03'}),null);
  fireEvent.click(costs.getByRole('button',{name:'Xem hóa đơn cost-02'}));
  assert.match(screen.getByRole('link',{name:'Tải hóa đơn'}).getAttribute('href'),/cost-02/);
});

test('tenant dashboard uses the active tenancy when an earlier draft is present', t => {
  const { context, mount } = fixture(t);
  const active = context.data.contracts.find(contract => contract.status === 'active');
  context.data.contracts.unshift({ ...active, id: 'earlier-draft', status: 'draft', endDate: '2028-12-31' });
  mount();
  assert.match(screen.getByText('Hợp đồng đến').parentElement.textContent, /30\/0?6\/2027/);
});

test('tenant dashboard shows the four most recent invoices when all are paid', t => {
  const { context, mount } = fixture(t);
  const original = context.data.invoices[0];
  context.data.invoices = ['06', '07', '08', '09', '10'].map(month => ({
    ...original, id: `paid-${month}`, period: `2026-${month}`, total: 1000000, paid: 1000000, status: 'issued',
  }));
  mount();
  const table = screen.getByRole('table');
  assert.match(table.textContent, /2026-10/);
  assert.doesNotMatch(table.textContent, /2026-06/);
});

test('a cancelled rating cannot become the default rating for a different issue', async t => {
  const { store, context, mount } = fixture(t);
  const original = store.get('issues', 'issue_01');
  for (const [id, title] of [['resolved-first', 'Sự cố thứ nhất'], ['resolved-second', 'Sự cố thứ hai']]) {
    store.put('issues', { ...original, id, title, status: 'resolved', resolution: 'Đã sửa xong.' });
  }
  context.data.issues = dataFor(store, store.db.prepare('SELECT * FROM users WHERE id=?').get(context.user.id)).issues
    .filter(issue => issue.status === 'resolved');
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận & đánh giá' }));
  fireEvent.change(screen.getByLabelText('Đánh giá chất lượng xử lý'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
  const secondRow = screen.getByText('Sự cố thứ hai').parentElement.parentElement;
  fireEvent.click(within(secondRow).getByRole('button', { name: 'Xác nhận', exact: true }));
  assert.equal(screen.getByLabelText('Đánh giá chất lượng xử lý').value, '5');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hoàn tất' })); });
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(store.get('issues', 'resolved-second').status, 'closed');
  assert.equal(store.get('issues', 'resolved-second').rating, 5);
  assert.equal(store.get('issues', 'resolved-first').status, 'resolved');
});
