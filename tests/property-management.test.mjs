import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/backend/server.mjs';
import { COLLECTIONS } from '../src/backend/db.mjs';
import { createRecord, updateRecord, deleteRecord } from '../src/backend/domain.mjs';

function fixture(t) {
  const app = createApp({ dbPath: ':memory:', seed: true });
  t.after(() => app.close());
  const owner = { id: 'owner_demo', role: 'landlord', name: 'Owner fixture' };
  const tenant = { id: 'user_tenant', role: 'tenant', landlord_id: owner.id, tenant_id: 'tenant_01', name: 'Tenant fixture' };
  const other = { id: 'owner_other', role: 'landlord', name: 'Other owner' };
  const create = (values = {}) => app.store.transaction(() => createRecord(app.store, owner, 'properties', {
    name: 'Cơ sở kiểm thử', address: '12 Đường kiểm thử, TP. Hồ Chí Minh', contact: 'Người liên hệ',
    phone: '0900000000', floors: 2, rules: 'Nội quy kiểm thử.', ...values,
  }));
  const remove = propertyId => app.store.transaction(() => deleteRecord(app.store, owner, 'properties', propertyId));
  return { store: app.store, owner, tenant, other, create, remove };
}

const rejects = expected => error => error.status === expected;
const recordsSnapshot = store => JSON.stringify(store.db.prepare('SELECT collection,id,data FROM records ORDER BY collection,id').all());

test('property creation and editing preserve fields, owner boundaries and default settings', t => {
  const { store, owner, tenant, other, create } = fixture(t);
  const created = create();
  assert.equal(created.ownerId, owner.id);
  assert.equal(created.name, 'Cơ sở kiểm thử');
  assert.equal(created.address, '12 Đường kiểm thử, TP. Hồ Chí Minh');
  assert.equal(created.floors, 2);
  assert.equal(created.archived, false);
  const settings = store.list('settings', owner.id).filter(row => row.propertyId === created.id);
  assert.equal(settings.length, 1);
  assert.equal(settings[0].electricRate, 3500);
  assert.equal(settings[0].waterRate, 15000);
  const edited = store.transaction(() => updateRecord(store, owner, 'properties', created.id, {
    name: 'Cơ sở đã đổi tên', address: '34 Địa chỉ mới', contact: 'Liên hệ mới', phone: '0911111111', floors: 3, rules: 'Nội quy đã sửa.',
  }));
  assert.equal(edited.id, created.id);
  assert.equal(edited.name, 'Cơ sở đã đổi tên');
  assert.equal(edited.address, '34 Địa chỉ mới');
  assert.equal(edited.floors, 3);
  assert.equal(store.list('settings', owner.id).filter(row => row.propertyId === created.id).length, 1);
  const before = recordsSnapshot(store);
  assert.throws(() => createRecord(store, tenant, 'properties', { name: 'Forbidden', address: 'Forbidden address' }), rejects(403));
  for (const user of [tenant, other]) {
    assert.throws(() => updateRecord(store, user, 'properties', created.id, { name: 'Intrusion' }), error => [403, 404].includes(error.status));
    assert.throws(() => deleteRecord(store, user, 'properties', created.id), error => [403, 404].includes(error.status));
  }
  assert.equal(recordsSnapshot(store), before);
});

test('deleting a genuinely empty property removes only its configuration and retains an audit trail', t => {
  const { store, owner, create, remove } = fixture(t);
  const property = create();
  const unrelatedSettings = store.list('settings', owner.id).filter(row => row.propertyId !== property.id);
  const initialAuditIds = store.list('audits', owner.id).filter(row => row.recordId === property.id).map(row => row.id);
  assert.ok(initialAuditIds.length > 0);
  assert.deepEqual(remove(property.id), { ok: true });
  assert.equal(store.get('properties', property.id), null);
  assert.equal(store.list('settings', owner.id).some(row => row.propertyId === property.id), false);
  assert.deepEqual(store.list('settings', owner.id), unrelatedSettings);
  const audits = store.list('audits', owner.id).filter(row => row.recordId === property.id);
  for (const auditId of initialAuditIds) assert.ok(audits.some(row => row.id === auditId));
  assert.ok(audits.some(row => row.action === 'delete' && row.collection === 'properties'));
});

test('property deletion refuses every linked business collection without cascading or changing history', t => {
  const { store, owner, create, remove } = fixture(t);
  const linkedCollections = COLLECTIONS.filter(name => !['properties', 'settings', 'audits'].includes(name));
  for (const collection of linkedCollections) {
    const property = create({ name: `Có dữ liệu ${collection}` });
    const linked = store.put(collection, { id: `property-link-${collection}`, ownerId: owner.id, propertyId: property.id });
    const before = recordsSnapshot(store);
    assert.throws(() => remove(property.id), error => error.status === 400 && /lưu trữ/.test(error.message), collection);
    assert.equal(recordsSnapshot(store), before, `${collection}: deletion must be mutation-free`);
    assert.equal(store.get(collection, linked.id).propertyId, property.id);
    assert.ok(store.get('properties', property.id));
  }
});

test('property deletion preserves uploaded evidence even when no business records remain', t => {
  const { store, owner, create, remove } = fixture(t);
  const property = create();
  store.db.prepare('INSERT INTO files(id,owner_id,uploader_id,property_id,name,type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('property-evidence-file', owner.id, owner.id, property.id, 'Synthetic evidence.png', 'image/png', Buffer.from([1, 2, 3]), '2026-11-01T00:00:00Z');
  const before = recordsSnapshot(store);
  assert.throws(() => remove(property.id), error => error.status === 400 && /lưu trữ/.test(error.message));
  assert.equal(recordsSnapshot(store), before);
  assert.deepEqual([...store.db.prepare('SELECT bytes FROM files WHERE id=?').get('property-evidence-file').bytes], [1, 2, 3]);
  assert.ok(store.get('properties', property.id));
});

test('archive requires active contracts to end and restore preserves linked history', t => {
  const { store, owner, create } = fixture(t);
  const beforeActive = recordsSnapshot(store);
  assert.throws(() => store.transaction(() => updateRecord(store, owner, 'properties', 'property_01', { archived: true })), rejects(400));
  assert.equal(recordsSnapshot(store), beforeActive);
  const property = create();
  const history = store.put('invoices', {
    id: 'property-history-invoice', ownerId: owner.id, propertyId: property.id, roomId: 'historic-room',
    period: '2025-01', status: 'cancelled', total: 100000, paid: 0,
  });
  const archived = store.transaction(() => updateRecord(store, owner, 'properties', property.id, { archived: true }));
  assert.equal(archived.archived, true);
  assert.deepEqual(store.get('invoices', history.id), history);
  const restored = store.transaction(() => updateRecord(store, owner, 'properties', property.id, { archived: false }));
  assert.equal(restored.archived, false);
  assert.deepEqual(store.get('invoices', history.id), history);
});
