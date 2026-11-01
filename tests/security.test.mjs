import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/backend/server.mjs';
import { createUser } from '../src/backend/db.mjs';

const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';

async function fixture(t) {
  const app = createApp({ dbPath: ':memory:', seed: true });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  t.after(async () => { app.server.closeAllConnections(); await app.close(); });
  function client() {
    let cookie = '';
    return async (path, { method = 'GET', body, headers = {} } = {}) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.arrayBuffer();
      return { status: response.status, data, headers: response.headers };
    };
  }
  const owner = client(), tenant = client();
  assert.equal((await owner('/auth/login', { method: 'POST', body: { email: 'chu@trozy.vn', password: 'Trozy@2026' } })).status, 200);
  assert.equal((await tenant('/auth/login', { method: 'POST', body: { email: 'thue@trozy.vn', password: 'Trozy@2026' } })).status, 200);
  return { app, owner, tenant, client };
}

test('same-owner tenants cannot read each other’s private document attachments', async t => {
  const { app, owner, tenant, client } = await fixture(t);
  const secondaryUser = createUser(app.store, { name: 'Người thuê phòng 102', email: 'tenant102@example.com', password: 'Trozy@2026', role: 'tenant', tenantId: 'tenant_02', landlordId: 'owner_demo', verified: true });
  app.store.put('tenants', { ...app.store.get('tenants', 'tenant_02'), userId: secondaryUser.id });
  const secondary = client();
  assert.equal((await secondary('/auth/login', { method: 'POST', body: { email: secondaryUser.email, password: 'Trozy@2026' } })).status, 200);
  const file = await owner('/files', { method: 'POST', body: { name: 'phong-102.png', type: 'image/png', data: image, propertyId: 'property_01', roomId: 'room_102', tenantId: 'tenant_02' } });
  assert.equal(file.status, 201);
  const document = await owner('/documents', { method: 'POST', body: { propertyId: 'property_01', roomId: 'room_102', tenantId: 'tenant_02', name: 'Hồ sơ riêng phòng 102', category: 'contract', visibility: 'tenant', fileId: file.data.id } });
  assert.equal(document.status, 201);
  assert.equal((await tenant(`/documents/${document.data.id}`)).status, 404);
  assert.equal((await tenant(`/files/${file.data.id}?inline=1`)).status, 404);
  assert.equal((await secondary(`/documents/${document.data.id}`)).status, 200);
  assert.equal((await secondary(`/files/${file.data.id}?inline=1`)).status, 200);
});

test('former tenants retain own invoices but cannot read newly shared documents or new room attachments', async t => {
  const { app, owner, tenant } = await fixture(t);
  app.store.put('tenants', { ...app.store.get('tenants', 'tenant_01'), status: 'left', moveOutDate: '2026-09-30' });
  const file = await owner('/files', { method: 'POST', body: { name: 'noi-quy-moi.png', type: 'image/png', data: image, propertyId: 'property_01' } });
  assert.equal(file.status, 201);
  const document = await owner('/documents', { method: 'POST', body: { propertyId: 'property_01', name: 'Nội quy dành cho cư dân hiện tại', category: 'rules', visibility: 'all', fileId: file.data.id } });
  assert.equal(document.status, 201);
  app.store.put('readings', { id: 'after_checkout_reading', ownerId: 'owner_demo', propertyId: 'property_01', roomId: 'room_101', period: '2027-08', electricOld: 3000, electricNew: 3100, waterOld: 300, waterNew: 310, confirmed: true });
  const bootstrap = await tenant('/bootstrap');
  assert.equal(bootstrap.status, 200);
  assert(bootstrap.data.data.invoices.some(row => row.tenantId === 'tenant_01'), 'Own historical invoices should remain accessible.');
  assert(!bootstrap.data.data.documents.some(row => row.id === document.data.id), 'New shared documents must not grant access through a former property link.');
  assert(!bootstrap.data.data.readings.some(row => row.id === 'after_checkout_reading'), 'New meter records must not be visible through the old room ID.');
  assert.equal((await tenant(`/files/${file.data.id}`)).status, 404);
});

test('replaying a completed checkout cannot release a room rented to someone else', async t => {
  const { app, tenant } = await fixture(t);
  const oldContract = app.store.get('contracts', 'contract_01');
  app.store.put('contracts', { ...oldContract, status: 'ended' });
  for (const invoice of app.store.list('invoices', 'owner_demo').filter(row => row.tenantId === 'tenant_01')) app.store.put('invoices', { ...invoice, paid: invoice.total });
  app.store.put('deposits', { id: 'old_refund', ownerId: 'owner_demo', propertyId: 'property_01', roomId: 'room_101', tenantId: 'tenant_01', contractId: 'contract_01', type: 'refund', amount: oldContract.deposit, date: '2026-10-01', note: 'Đã quyết toán lượt thuê cũ' });
  app.store.put('tenants', { ...app.store.get('tenants', 'tenant_01'), status: 'left', moveOutDate: '2026-10-01' });
  app.store.put('tenants', { ...app.store.get('tenants', 'tenant_02'), roomId: 'room_101', status: 'active' });
  app.store.put('rooms', { ...app.store.get('rooms', 'room_101'), status: 'occupied' });
  app.store.put('contracts', { id: 'new_current_tenancy', ownerId: 'owner_demo', propertyId: 'property_01', roomId: 'room_101', tenantId: 'tenant_02', status: 'active', startDate: '2026-10-02', endDate: '2027-10-01', rent: 3500000, deposit: 0, version: 1 });
  app.store.put('handovers', { id: 'completed_old_checkout', ownerId: 'owner_demo', propertyId: 'property_01', roomId: 'room_101', tenantId: 'tenant_01', contractId: 'contract_01', type: 'move_out', status: 'confirmed', date: '2026-10-01', condition: 'Đã quyết toán', landlordConfirmedAt: '2026-10-01T01:00:00Z', tenantAcceptedAt: '2026-10-01T02:00:00Z', completedAt: '2026-10-01T02:00:00Z' });
  const replay = await tenant('/actions/handover-confirm', { method: 'POST', body: { id: 'completed_old_checkout' } });
  assert([200, 400, 403, 409].includes(replay.status));
  assert.equal(app.store.get('rooms', 'room_101').status, 'occupied', 'Replay must not release the current occupant’s room.');
  assert.equal(app.store.get('contracts', 'new_current_tenancy').status, 'active');
});

test('a future draft cannot create two current active tenancies in one room', async t => {
  const { app, owner } = await fixture(t);
  const person = await owner('/tenants', { method: 'POST', body: { propertyId: 'property_01', name: 'Người thuê dự kiến', email: 'future@example.com' } });
  assert.equal(person.status, 201);
  const draft = await owner('/contracts', { method: 'POST', body: { propertyId: 'property_01', roomId: 'room_101', tenantId: person.data.id, startDate: '2028-01-01', endDate: '2028-12-31', rent: 3500000, deposit: 3500000 } });
  assert.equal(draft.status, 201);
  const activate = await owner('/actions/contract-activate', { method: 'POST', body: { id: draft.data.id } });
  assert([400, 409].includes(activate.status), `Expected activation rejection; received ${activate.status}.`);
  assert.equal(app.store.list('contracts', 'owner_demo').filter(row => row.roomId === 'room_101' && row.status === 'active').length, 1);
});

test('tenant mass assignment cannot change owner, occupant or parking charges', async t => {
  const { app, tenant } = await fixture(t);
  const vehicle = await tenant('/vehicles', { method: 'POST', body: { ownerId: 'owner_other', userId: 'owner_other', tenantId: 'tenant_02', propertyId: 'property_other', roomId: 'room_102', plate: '59-X1 TEST-ACL', type: 'Xe máy', fee: 9999999, parkingSpot: 'VIP' } });
  assert.equal(vehicle.status, 201);
  const stored = app.store.get('vehicles', vehicle.data.id);
  assert.equal(stored.ownerId, 'owner_demo');
  assert.equal(stored.tenantId, 'tenant_01');
  assert.equal(stored.roomId, 'room_101');
  assert.equal(stored.propertyId, 'property_01');
  assert.equal(stored.fee, 0);
  assert.equal(stored.parkingSpot, '');
  assert.equal((await tenant('/payments', { method: 'POST', body: { amount: 1, tenantId: 'tenant_01' } })).status, 403);
});

test('cross-site mutation origins and unauthenticated reads are rejected', async t => {
  const { owner, client } = await fixture(t);
  assert.equal((await client()('/bootstrap')).status, 401);
  const foreign = await owner('/notifications', { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: { propertyId: 'property_01', title: 'CSRF test', body: 'Không được phép ghi dữ liệu từ trang khác.' } });
  assert.equal(foreign.status, 403);
  const crossSite = await owner('/notifications', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' }, body: { propertyId: 'property_01', title: 'CSRF test', body: 'Không được phép ghi dữ liệu từ trang khác.' } });
  assert.equal(crossSite.status, 403);
});

test('failed bulk import rolls back rows already processed', async t => {
  const { app, owner } = await fixture(t);
  const result = await owner('/import', { method: 'POST', body: { collection: 'rooms', rows: [{ propertyId: 'property_01', code: 'IMPORT-ATOMIC', area: 20, capacity: 2, price: 3000000 }, { propertyId: 'property_01', code: '101', area: 20, capacity: 2, price: 3000000 }] } });
  assert([400, 409].includes(result.status));
  assert(!app.store.list('rooms', 'owner_demo').some(room => room.code === 'IMPORT-ATOMIC'));
});

test('reworked repairs cannot silently diverge from the posted cashbook expense', async t => {
  const { app, owner } = await fixture(t);
  assert.equal((await owner('/actions/issue-transition', { method: 'POST', body: { id: 'issue_01', status: 'resolved', resolution: 'Đã sửa đường ống thoát nước máy lạnh.', cost: 180000 } })).status, 200);
  const issue = app.store.get('issues', 'issue_01');
  assert.equal(app.store.get('transactions', issue.expenseId).amount, 180000);
  assert.equal((await owner('/actions/issue-transition', { method: 'POST', body: { id: 'issue_01', status: 'progress' } })).status, 200);
  const changedCost = await owner('/actions/issue-transition', { method: 'POST', body: { id: 'issue_01', status: 'resolved', resolution: 'Kiểm tra lại thiết bị sau sửa chữa.', cost: 250000 } });
  assert([400, 409].includes(changedCost.status), 'Previously posted repair cost must not be rewritten without a financial adjustment.');
  assert.equal(app.store.get('issues', 'issue_01').cost, 180000);
  assert.equal(app.store.get('transactions', issue.expenseId).amount, 180000);
});

test('multi-room notifications stay inside the chosen property and target rooms', async t => {
  const { app, owner, tenant, client } = await fixture(t);
  const secondaryUser = createUser(app.store, { name: 'Người thuê phòng 102', email: 'notice102@example.com', password: 'Trozy@2026', role: 'tenant', tenantId: 'tenant_02', landlordId: 'owner_demo', verified: true });
  app.store.put('tenants', { ...app.store.get('tenants', 'tenant_02'), userId: secondaryUser.id });
  const secondary = client();
  assert.equal((await secondary('/auth/login', { method: 'POST', body: { email: secondaryUser.email, password: 'Trozy@2026' } })).status, 200);
  const notice = await owner('/notifications', { method: 'POST', body: { propertyId: 'property_01', roomIds: ['room_101', 'room_201'], title: 'Lịch kiểm tra thiết bị', body: 'Kiểm tra thiết bị tại hai phòng đã chọn vào sáng mai.' } });
  assert.equal(notice.status, 201);
  assert.deepEqual(notice.data.roomIds, ['room_101', 'room_201']);
  assert.equal((await tenant(`/notifications/${notice.data.id}`)).status, 200);
  assert.equal((await secondary(`/notifications/${notice.data.id}`)).status, 404);
  const differentProperty = await owner('/notifications', { method: 'POST', body: { propertyId: 'property_01', roomIds: ['room_101', 'room_b01'], title: 'Sai phạm vi', body: 'Danh sách phòng thuộc nhiều cơ sở cần bị từ chối.' } });
  assert.equal(differentProperty.status, 400);
  const malformed = await owner('/notifications', { method: 'POST', body: { propertyId: 'property_01', roomIds: 'room_101', title: 'Sai kiểu dữ liệu', body: 'Danh sách phòng phải là một mảng ID phòng.' } });
  assert.equal(malformed.status, 400);
});

test('maintenance asset links must identify equipment in the reported room', async t => {
  const { owner, tenant } = await fixture(t);
  const valid = await tenant('/issues', { method: 'POST', body: { title: 'Máy lạnh kêu to', category: 'Thiết bị', description: 'Máy lạnh phát tiếng kêu lớn khi bật vào buổi tối.', assetId: 'asset_0' } });
  assert.equal(valid.status, 201);
  assert.equal(valid.data.assetId, 'asset_0');
  assert.equal(valid.data.roomId, 'room_101');
  const invalid = await owner('/issues', { method: 'POST', body: { propertyId: 'property_01', roomId: 'room_101', tenantId: 'tenant_01', title: 'Sai thiết bị', category: 'Thiết bị', description: 'Không được liên kết tài sản thuộc một phòng khác.', assetId: 'asset_1' } });
  assert.equal(invalid.status, 400);
});

test('document templates retain version metadata and obey document visibility', async t => {
  const { owner, tenant } = await fixture(t);
  const template = await owner('/documents', { method: 'POST', body: { propertyId: 'property_01', name: 'Mẫu hợp đồng thuê phòng', category: 'contract', isTemplate: true, visibility: 'landlord', content: 'Mẫu điều khoản thuê phòng dùng nội bộ chủ trọ.' } });
  assert.equal(template.status, 201);
  assert.equal(template.data.isTemplate, true);
  assert.equal((await tenant(`/documents/${template.data.id}`)).status, 404);
  const changed = await owner(`/documents/${template.data.id}`, { method: 'PATCH', body: { content: 'Mẫu điều khoản đã được cập nhật cho kỳ thuê mới.' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.version, 2);
  assert.equal(changed.data.versions[0].isTemplate, true);
  assert.equal(changed.data.versions[0].content, template.data.content);
});

test('overpayments, credit allocations and both refund paths preserve cash and invoice identities', async t => {
  const { app, owner, tenant } = await fixture(t);
  const netCash = () => app.store.list('transactions', 'owner_demo').reduce((sum, entry) => sum + (entry.type === 'income' ? entry.amount : -entry.amount), 0);
  const allocated = id => app.store.list('payments', 'owner_demo').filter(entry => entry.invoiceId === id).reduce((sum, entry) => sum + (entry.appliedAmount ?? entry.amount), 0);
  const baseline = netCash();
  const oldInvoice = app.store.get('invoices', 'HD-10-101');
  const due = oldInvoice.total - oldInvoice.paid;
  const receipt = await owner('/actions/payment-record', { method: 'POST', body: { invoiceId: oldInvoice.id, amount: due + 500000, method: 'transfer', date: '2026-10-27', note: 'Người thuê chuyển dư để giữ cho kỳ sau.' } });
  assert.equal(receipt.status, 200);
  assert.equal(receipt.data.appliedAmount, due);
  assert.equal(receipt.data.creditAmount, 500000);
  assert.equal(app.store.get('invoices', oldInvoice.id).paid, oldInvoice.total);
  assert.equal(netCash() - baseline, due + 500000);

  const next = await owner('/actions/invoice-issue', { method: 'POST', body: { roomId: 'room_101', period: '2026-11' } });
  assert.equal(next.status, 200);
  const transactionCount = app.store.list('transactions', 'owner_demo').length;
  const apply = await owner('/actions/payment-apply-credit', { method: 'POST', body: { invoiceId: next.data.id, creditId: receipt.data.id, amount: 200000, date: '2026-10-27' } });
  assert.equal(apply.status, 200);
  assert.equal(app.store.get('invoices', next.data.id).paid, 200000);
  assert.equal(app.store.list('transactions', 'owner_demo').length, transactionCount, 'Applying previously received credit must not count cash income twice.');
  assert.equal((await owner('/actions/payment-refund', { method: 'POST', body: { creditId: receipt.data.id, amount: 150000, method: 'transfer', date: '2026-10-27', note: 'Hoàn một phần tiền chuyển dư.' } })).status, 200);
  assert.equal((await owner('/actions/payment-refund', { method: 'POST', body: { invoiceId: next.data.id, amount: 50000, method: 'cash', date: '2026-10-27', note: 'Hoàn bớt phần đã phân bổ hóa đơn.' } })).status, 200);
  const bootstrap = await tenant('/bootstrap');
  const credit = bootstrap.data.data.credits.find(row => row.id === receipt.data.id);
  assert.equal(credit.balance, 150000);
  assert.equal(bootstrap.data.data.tenants.find(row => row.id === 'tenant_01').creditBalance, 150000);
  assert.equal(app.store.get('invoices', next.data.id).paid, 150000);
  assert.equal(allocated(oldInvoice.id), app.store.get('invoices', oldInvoice.id).paid);
  assert.equal(allocated(next.data.id), app.store.get('invoices', next.data.id).paid);
  assert.equal(netCash() - baseline, due + 300000, 'Net cash must equal actual receipts minus both actual refunds.');

  const beforeDenied = { payments: app.store.list('payments', 'owner_demo').length, cash: netCash() };
  assert.equal((await owner('/actions/payment-refund', { method: 'POST', body: { creditId: receipt.data.id, amount: 150001, note: 'Thử hoàn vượt số dư.' } })).status, 400);
  const crossTenant = await owner('/actions/payment-apply-credit', { method: 'POST', body: { invoiceId: 'HD-10-102', creditId: receipt.data.id, amount: 100000 } });
  assert([400, 403].includes(crossTenant.status));
  assert.equal((await tenant('/actions/payment-refund', { method: 'POST', body: { creditId: receipt.data.id, amount: 1, note: 'Tenant không có quyền xác nhận hoàn.' } })).status, 403);
  assert.equal((await owner('/credits', { method: 'POST', body: { amount: 9999999, balance: 9999999, tenantId: 'tenant_01' } })).status, 403);
  assert.equal(app.store.list('payments', 'owner_demo').length, beforeDenied.payments);
  assert.equal(netCash(), beforeDenied.cash);
});

test('issued invoice adjustments preserve paid allocation and reject undercutting received money', async t => {
  const { app, owner } = await fixture(t);
  const draft = await owner('/actions/invoice-draft', { method: 'POST', body: { roomId: 'room_101', period: '2026-11', serviceItems: [{ name: 'Internet', quantity: 1, rate: 100000 }] } });
  assert.equal(draft.status, 200);
  assert.equal(draft.data.status, 'draft');
  const issued = await owner('/actions/invoice-issue', { method: 'POST', body: { id: draft.data.id } });
  assert.equal(issued.status, 200);
  const invoiceId = issued.data.id;
  assert.equal((await owner('/actions/payment-record', { method: 'POST', body: { invoiceId, amount: 200000, method: 'cash', date: '2026-10-27' } })).status, 200);
  const changed = await owner('/actions/invoice-adjust', { method: 'POST', body: { id: invoiceId, adjustment: 10000, reason: 'Bổ sung phí dịch vụ đã thống nhất.' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.paid, 200000);
  assert.equal(changed.data.total, issued.data.total + 10000);
  assert.equal(changed.data.version, 2);
  assert.equal(changed.data.versions[0].total, issued.data.total);
  const before = app.store.get('invoices', invoiceId);
  const rejected = await owner('/actions/invoice-adjust', { method: 'POST', body: { id: invoiceId, rent: 0, electricRate: 0, waterRate: 0, serviceFee: 0, adjustment: 0, reason: 'Thử giảm tổng thấp hơn phần đã thu.' } });
  assert.equal(rejected.status, 400);
  assert.equal(app.store.get('invoices', invoiceId).total, before.total);
  assert.equal(app.store.get('invoices', invoiceId).paid, before.paid);
  assert.equal(app.store.get('invoices', invoiceId).version, before.version);
  const periodChange = await owner('/actions/invoice-adjust', { method: 'POST', body: { id: invoiceId, period: '2026-12', reason: 'Không được chuyển kỳ một hóa đơn đã phát hành.' } });
  assert.equal(periodChange.status, 400);
});
