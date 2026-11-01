import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,status,image} from './fixtures/manual-meter-fixture.mjs';

test('photo capture requires the active tenancy and room-bound evidence without accepting crop instructions',t=>{
 const f=fixture(t),request=f.request();
 assert.throws(()=>f.service.authorizePhotos(f.owner,request),status(403));
 assert.throws(()=>f.service.authorizePhotos(f.tenant,f.request('electric',f.file({roomId:'room_102'}))),status(403));
 assert.throws(()=>f.service.authorizePhotos(f.tenant,f.request('electric',f.file({uploaderId:f.owner.id}))),status(403));
 assert.throws(()=>f.service.authorizePhotos(f.tenant,{...request,photos:[{...request.photos[0],rectangle:{left:0,top:0,width:1,height:1}}]}),status(400));
 const tenant=f.store.get('tenants','tenant_01');f.store.put('tenants',{...tenant,status:'checked_out'});assert.throws(()=>f.service.authorizePhotos(f.tenant,request),status(403));
});

test('capture rejects duplicate contents and fake image signatures while keeping original photo bytes',t=>{
 const f=fixture(t),request=f.request();
 assert.throws(()=>f.service.authorizePhotos(f.tenant,{...request,photos:[...request.photos,{fileId:f.file()}]}),status(400));
 assert.throws(()=>f.service.authorizePhotos(f.tenant,f.request('electric',f.file({bytes:Buffer.from('not an image')}))),status(400));
 const receipt=f.service.submitPhotos(f.tenant,request);assert.deepEqual(Buffer.from(f.store.db.prepare('SELECT bytes FROM files WHERE id=?').get(receipt.photos[0].fileId).bytes),image);
});
