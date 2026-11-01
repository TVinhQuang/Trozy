import test from 'node:test';
import assert from 'node:assert/strict';
import {dataFor,createRecord,updateRecord,deleteRecord} from '../src/backend/domain.mjs';
import {fixture,status} from './fixtures/manual-meter-fixture.mjs';

test('historical meter configuration is preserved and cannot authorize an automatic reading',t=>{
 const f=fixture(t),profile={id:'historical_profile',ownerId:f.owner.id,roomId:'room_101',utility:'electric',integerDigitsCount:5,fractionalDigitsCount:1};
 f.store.put('meterProfiles',profile);const before=structuredClone(f.store.get('meterProfiles',profile.id));
 const receipt=f.service.submitPhotos(f.tenant,f.request());assert.equal(receipt.status,'pending');
 assert.deepEqual(f.store.get('meterProfiles',profile.id),before);assert.deepEqual(dataFor(f.store,f.tenant).meterProfiles,[]);
 for(const action of [()=>createRecord(f.store,f.owner,'meterProfiles',profile),()=>updateRecord(f.store,f.owner,'meterProfiles',profile.id,{integerDigitsCount:1}),()=>deleteRecord(f.store,f.owner,'meterProfiles',profile.id)])assert.throws(action,status(403));
 assert.equal(f.service.saveProfile,undefined);assert.equal(f.service.jobInput,undefined);
});
