import {openStore,id,now} from '../../src/backend/db.mjs';
import {seedDemo} from '../../src/backend/seed.mjs';
import {createMeterSubmissionService} from '../../src/backend/meter-submissions.mjs';
export const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
export const status=code=>error=>error.status===code;
export const note='Đã mở ảnh gốc và đối chiếu đầy đủ chỉ số công tơ.';
export function fixture(t){
 const store=openStore(':memory:');seedDemo(store);t.after(()=>store.close());
 const user=key=>store.db.prepare('SELECT * FROM users WHERE id=?').get(key),owner=user('owner_demo'),tenant=user('user_tenant'),other=user('owner_other'),service=createMeterSubmissionService(store);
 const file=(extra={})=>{const key=id('file');store.db.prepare('INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,name,type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(key,extra.ownerId||owner.id,extra.uploaderId||tenant.id,'property_01','tenant_01',extra.roomId||'room_101','meter.png','image/png',extra.bytes||image,now());return key;};
 const request=(utility='electric',fileId=file())=>({roomId:'room_101',period:'2026-11',utility,photos:[{fileId}]});
 const prior=store.list('readings',owner.id).filter(row=>row.roomId==='room_101'&&row.confirmed).sort((a,b)=>b.period.localeCompare(a.period))[0];
 return {store,owner,tenant,other,service,file,request,prior};
}
