import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/backend/server.mjs';
import { createRecord, updateRecord, calculateInvoice, performAction } from '../src/backend/domain.mjs';

function fixture(t) {
  const app = createApp({ dbPath: ':memory:', seed: true });
  t.after(() => app.close());
  const { store } = app;
  const owner = { id: 'owner_demo', role: 'landlord' };
  // A synthetic, confirmed November period with high monthly usage. The app's
  // real business database and historical seed records are never opened/edited.
  const prior = store.put('readings', {
    id: 'consumption-prior', ownerId: owner.id, propertyId: 'property_01', roomId: 'room_101',
    period: '2026-11', electricOld: 1000, electricNew: 9000, waterOld: 110, waterNew: 120, confirmed: true,
  });
  const current = {
    propertyId: 'property_01', roomId: 'room_101', period: '2026-12',
    electricOld: prior.electricNew, electricNew: prior.electricNew + 1200,
    waterOld: prior.waterNew, waterNew: prior.waterNew + 3, confirmed: true,
  };
  return { store, owner, prior, current };
}

test('lower monthly usage retains cumulative readings and bills the actual 1200 kWh', t => {
  const { store, owner, prior, current } = fixture(t);
  assert.equal(prior.electricNew - prior.electricOld, 8000);
  const reading = createRecord(store, owner, 'readings', current);
  assert.equal(reading.electricOld, 9000);
  assert.equal(reading.electricNew, 10200);
  const preview = calculateInvoice(store, owner, { roomId: current.roomId, period: current.period });
  const electric = preview.items.find(item => item.name === 'Điện');
  const water = preview.items.find(item => item.name === 'Nước');
  assert.equal(electric.quantity, 1200);
  assert.equal(electric.amount, 1200 * 3500);
  assert.equal(water.quantity, 3);
  assert.equal(water.amount, 3 * 15000);
  const issued = performAction(store, owner, 'invoice-issue', { roomId: current.roomId, period: current.period });
  assert.equal(issued.total, preview.total);
  assert.equal(issued.items.find(item => item.name === 'Điện').quantity, 1200);
  assert.equal(store.get('readings', reading.id).electricNew, 10200);
  assert.throws(() => updateRecord(store, owner, 'readings', reading.id, { electricNew: 10201 }), error => error.status === 409);
  const next = createRecord(store, owner, 'readings', {
    ...current, period: '2027-01', electricOld: 10200, electricNew: 10200 + 100,
    waterOld: 123, waterNew: 124,
  });
  assert.equal(next.electricNew - next.electricOld, 100);
  const nextBill = calculateInvoice(store, owner, { roomId: next.roomId, period: next.period });
  assert.equal(nextBill.items.find(item => item.name === 'Điện').quantity, 100);
});

test('monthly entry never bypasses cumulative baseline and negative-usage guards', t => {
  const { store, owner, current } = fixture(t);
  const before = JSON.stringify([store.list('readings'), store.list('invoices')]);
  for (const invalid of [
    { ...current, electricNew: 1200 },
    { ...current, electricOld: 0, electricNew: 1200 },
  ]) {
    assert.throws(() => createRecord(store, owner, 'readings', invalid), error => error.status === 400);
    assert.throws(() => calculateInvoice(store, owner, invalid), error => error.status === 400);
  }
  assert.equal(JSON.stringify([store.list('readings'), store.list('invoices')]), before);
  assert.throws(() => createRecord(store, { id: 'user_tenant', role: 'tenant', landlord_id: owner.id, tenant_id: 'tenant_01' }, 'readings', current), error => error.status === 403);
});
