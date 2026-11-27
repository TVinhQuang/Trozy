import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {openOwnerStore} from '../src/cloudflare/store.mjs';
import worker from '../src/cloudflare/worker.mjs';
import {meterPhotoExpiry} from '../src/shared/file-policy.mjs';

test('meter photos expire one calendar month after upload, clamped to the last day in Vietnam', () => {
  assert.equal(new Date(meterPhotoExpiry('2027-01-31T12:20:00+07:00') * 1000).toISOString(), '2027-02-28T05:20:00.000Z');
  assert.equal(new Date(meterPhotoExpiry('2028-01-31T00:15:00+07:00') * 1000).toISOString(), '2028-02-28T17:15:00.000Z');
});

// Run exactly the D1 migration and SQL locally; KV intentionally stores no file in SQL.
function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL('../cloudflare/migrations/0001_trozy.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../cloudflare/migrations/0002_scheduled_work.sql', import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../cloudflare/migrations/0003_landlord_signups.sql', import.meta.url),'utf8'));
  const result = (query, args) => {
    const results=sql.prepare(query).all(...args);
    return {results,meta:{changes:sql.prepare('SELECT changes() AS n').get().n}};
  };
  const db = {
    prepare(query) {
      function statement(args) {
        return {query, args, bind: (...params) => statement(params),
          first: async () => sql.prepare(query).get(...args) ?? null,
          all: async () => result(query, args),
          run: async () => ({meta: sql.prepare(query).run(...args)})};
      }
      return statement([]);
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = statements.map(s => result(s.query,s.args)); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const blobs = new Map();
  const env = {DB:db, FILES:{
    async put(key,bytes,options){blobs.set(key,{bytes:Buffer.from(bytes),options});},
    async get(key){return blobs.get(key)?.bytes ?? null;},
    async delete(key){blobs.delete(key);},
  }, TROZY_DATA_KEY:'12'.repeat(32)};
  for (const [id,role,tenant,owner] of [['o','landlord',null,null],['t','tenant','tenant','o'],['other','landlord',null,null],['neighbor','tenant','n','o']]) {
    sql.prepare('INSERT INTO users(id,name,email,password_hash,role,tenant_id,landlord_id,verified,created_at) VALUES(?,?,?,?,?,?,?,1,?)').run(id,id,id+'@test.example','unused',role,tenant,owner,new Date().toISOString());
    sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(createHash('sha256').update(id).digest('hex'),id,Date.now()+600000);
  }
  for (const [collection,id,extra] of [['properties','p',{}],['rooms','r',{code:'101',propertyId:'p'}],['tenants','tenant',{roomId:'r',propertyId:'p',status:'active',userId:'t'}],['rooms','next',{code:'102',propertyId:'p'}],['tenants','n',{roomId:'next',propertyId:'p',status:'active',userId:'neighbor'}],['contracts','c',{roomId:'r',tenantId:'tenant',propertyId:'p',status:'active',startDate:'2020-01-01',endDate:'2099-12-31'}]]) {
    sql.prepare('INSERT INTO records(collection,id,owner_id,property_id,tenant_id,data) VALUES(?,?,?,?,?,?)').run(collection,id,'o',extra.propertyId??null,extra.tenantId??null,JSON.stringify({id,ownerId:'o',...extra}));
  }
  function request(user,path,body) {
    return worker.fetch(new Request('https://trozy.example/api'+path,{method:body?'POST':'GET',
      headers:{cookie:'trozy_session='+user,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env,{});
  }
  return {sql,blobs,request,env};
}

test('UC67 Worker scopes linked requests, preserves account email and commits a reviewed partial deletion once',async t=>{
  const {sql,env,request}=fixture(t);
  const store=await openOwnerStore(env,{id:'o',role:'landlord'});
  store.put('tenants',{...store.get('tenants','tenant'),name:'Test tenant',status:'left',moveOutDate:'2026-01-01',email:'profile@example.test'});
  store.put('contracts',{...store.get('contracts','c'),status:'ended'});await store.commit();
  const step=(actor,name,body)=>request(actor,'/actions/privacy-'+name,body);
  const response=await step('t','submit',{fields:['email','loginEmail','invoices']});assert.equal(response.status,200);
  const row=await response.json();
  assert.equal((await request('neighbor','/privacyRequests/'+row.id)).status,404);
  assert.equal((await request('other','/privacyRequests/'+row.id)).status,404);
  assert.equal((await step('t','preview',{id:row.id})).status,403);
  const preview=await (await step('o','preview',{id:row.id,settled:true,neededFields:[]})).json();
  assert.equal(preview.decisions.filter(d=>d.eligible).length,1);
  const confirmation={id:row.id,previewId:preview.previewId,fields:['email'],confirmed:true};
  assert.equal((await step('other','confirm',confirmation)).status,404);
  assert.equal((await (await step('o','confirm',confirmation)).json()).status,'partial');
  assert.equal((await step('o','confirm',confirmation)).status,200);
  const result=await (await request('t','/privacyRequests/'+row.id)).json();
  assert.equal(result.fingerprint,undefined);assert.equal(result.previewId,undefined);
  assert.equal((await (await request('t','/tenants/tenant')).json()).email,'');
  assert.equal(sql.prepare('SELECT email FROM users WHERE id=?').get('t').email,'t@test.example');
  assert.equal((await (await request('t','/bootstrap')).json()).data.privacyRequests.length,1);
});

test('cloud receipt correction, authorized PDF and all-device logout use the same confirmed figures', async t=>{
  const {request,env}=fixture(t);
  const store=await openOwnerStore(env,{id:'o',role:'landlord'});
  store.put('invoices',{id:'bill',ownerId:'o',propertyId:'p',roomId:'r',tenantId:'tenant',status:'issued',total:200000,paid:0,period:'2026-11'});await store.commit();
  const receipt=await (await request('o','/actions/payment-record',{invoiceId:'bill',amount:40000,method:'cash'})).json();
  const correction={id:receipt.id,requestId:'cloud-correction',reason:'Đã kiểm tra số tiền mặt',amount:60000,date:'2026-11-27',expectedRevision:0,expectedPaid:40000,expectedTotal:200000};
  assert.equal((await request('o','/actions/payment-correct',correction)).status,200);
  const path='/payments/'+receipt.id+'/pdf?definition=1';
  const pdf=await (await request('t',path)).json();
  assert.match(pdf.filename,/-v2\.pdf$/);assert.match(JSON.stringify(pdf.definition),/60\.000/);
  assert.equal((await request('neighbor',path)).status,404);
  assert.equal((await request('o','/auth/logout',{allDevices:true})).status,200);
  assert.equal((await request('o','/bootstrap')).status,401);
  assert.equal((await request('t','/bootstrap')).status,200);
});

test('cloud tenant submits a 4 MiB image, owner reviews, unrelated owner cannot read; expiry preserves history', async t => {
  const {sql,blobs,request}=fixture(t);
  const bytes=Buffer.alloc(4*1024*1024); bytes.set([255,216,255]);
  const upload=await request('t','/files',{name:'meter.jpg',type:'image/jpeg',purpose:'meter',roomId:'r',data:bytes.toString('base64')});
  assert.equal(upload.status,201);
  const file=await upload.json();
  assert.ok(blobs.get(file.id).options.expiration>Date.now()/1000);
  assert.equal((await request('other','/files/'+file.id)).status,404);
  assert.equal((await request('neighbor','/files/'+file.id)).status,404);
  const image=await request('o','/files/'+file.id+'?inline=1');
  assert.equal(image.status,200); assert.equal((await image.arrayBuffer()).byteLength,bytes.length);
  const body={roomId:'r',period:'2026-11',utility:'electric',photos:[{fileId:file.id}]};
  assert.equal((await request('t','/meter/submissions',{...body,value:123})).status,400);
  const sent=await request('t','/meter/submissions',body);
  assert.equal(sent.status,202); const sub=await sent.json();
  assert.equal(sub.photos[0].expiresAt,file.expiresAt);
  const ownerInbox=await (await request('o','/meter/submissions')).json();
  const review={decision:'approve',version:ownerInbox.records.find(r=>r.id===sub.id).version,value:123,imageChecked:true,note:'Đã đối chiếu ảnh gốc.'};
  assert.equal((await request('t','/meter/submissions/'+sub.id+'/review',review)).status,403);
  assert.equal((await request('o','/meter/submissions/'+sub.id+'/review',{...review,imageChecked:false})).status,400);
  assert.equal((await request('o','/meter/submissions/'+sub.id+'/review',review)).status,200);
  sql.prepare('UPDATE files SET expires_at=1 WHERE id=?').run(file.id);
  assert.equal((await request('o','/files/'+file.id)).status,410);
  const bootstrap=await (await request('o','/bootstrap')).json();
  assert.equal(bootstrap.data.readings[0].electricNew,123);
  assert.equal(bootstrap.data.meterSubmissions[0].status,'approved');
  const attachment=await (await request('o','/files',{name:'note.txt',type:'text/plain',data:'b2s='})).json();
  assert.equal(blobs.get(attachment.id).options?.expiration,undefined);
});

test('expired evidence blocks approval, allows a retake and retains the receipt', async t => {
  const {sql,request}=fixture(t);
  const file=await (await request('t','/files',{name:'photo.jpg',type:'image/jpeg',purpose:'meter',roomId:'r',data:'/9j/'})).json();
  const sub=await (await request('t','/meter/submissions',{roomId:'r',period:'2026-11',utility:'water',photos:[{fileId:file.id}]})).json();
  sql.prepare('UPDATE files SET expires_at=1 WHERE id=?').run(file.id);
  const url='/meter/submissions/'+sub.id+'/review';
  assert.equal((await request('o',url,{decision:'approve',version:1,imageChecked:true,value:20,note:'Đã xem công tơ nước.'})).status,410);
  assert.equal((await request('o',url,{decision:'reject',version:1,note:'Ảnh hết hạn, vui lòng chụp lại.'})).status,200);
  const data=(await (await request('t','/bootstrap')).json()).data;
  assert.equal(data.meterSubmissions[0].status,'rejected');
  assert.equal(data.readings.length,0);
});

test('stale D1 write rolls back its entire batch', async t => {
  const {env,sql}=fixture(t), owner=sql.prepare("SELECT * FROM users WHERE id='o'").get();
  const first=await openOwnerStore(env,owner), older=await openOwnerStore(env,owner);
  first.put('rooms',{...first.get('rooms','r'),code:'103'});
  older.put('rooms',{...older.get('rooms','r'),code:'104'});
  older.put('rooms',{id:'extra',ownerId:'o',propertyId:'p',code:'105'});
  await first.commit(); await assert.rejects(older.commit(),{status:409});
  const saved=await openOwnerStore(env,owner);
  assert.equal(saved.get('rooms','r').code,'103');
  assert.equal(saved.get('rooms','extra'),null);
});

test('mail verification uses a private delivery binding; OTP and reset grant are single use', async t=>{
  const {env,request}=fixture(t);
  const sent=[];
  env.MAILER={async fetch(_url,opts){sent.push(JSON.parse(opts.body));return new Response(null,{status:202});}};
  const email='demo@trozy.example', creds={email,password:'demo-pass-in-test'};
  assert.equal((await request('','/auth/register',{...creds,name:'Diệu Linh',phone:'0900000000',consent:true,role:'landlord'})).status,201);
  assert.equal((await request('','/auth/login',creds)).status,403);
  const token=new URL(sent.at(-1).url).searchParams.get('token');
  assert.equal((await request('','/auth/verify-email',{token})).status,200);
  assert.equal((await request('','/auth/verify-email',{token})).status,400);
  assert.equal((await request('','/auth/login',creds)).status,200);
  assert.equal((await request('','/auth/forgot-password',{email})).status,200);
  const otp=sent.at(-1).otp;
  const grant=await request('','/auth/verify-reset-otp',{email,otp});
  assert.equal(grant.status,200);
  assert.equal((await request('','/auth/verify-reset-otp',{email,otp})).status,400);
  const reset={password:'a-new-demo-pass',confirmation:'a-new-demo-pass',token:(await grant.json()).resetToken};
  assert.equal((await request('','/auth/reset-password',reset)).status,200);
  assert.equal((await request('','/auth/reset-password',reset)).status,400);
  assert.equal((await request('','/auth/login',creds)).status,401);
});

test('landlord signup waits for mail, verifies the inbox once and opens an isolated workspace', async t=>{
  const {env,request,sql}=fixture(t);
  const email='new-owner@example.test';
  const details={name:'Chủ trọ mới',phone:'0912345678',password:'owner-password',consent:true};
  const start=await request('','/auth/landlord-signup',{email});
  assert.equal(start.status,202);
  assert.equal((await start.json()).delivery,'pending');
  assert.equal(sql.prepare('SELECT count(*) AS n FROM users WHERE email=?').get(email).n,0);
  assert.equal((await request('','/auth/login',{email,password:details.password})).status,401);
  const sent=[];
  env.TROZY_PUBLIC_URL='https://trozy.example';
  env.MAILER={async fetch(_url,opts){sent.push(JSON.parse(opts.body));return new Response(null,{status:202});}};
  await worker.scheduled({},env);
  await worker.scheduled({},env);
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,email);
  const link=new URL(sent[0].url);
  assert.equal(link.origin,env.TROZY_PUBLIC_URL);
  assert.equal(link.searchParams.get('action'),'create-landlord');
  const token=new URLSearchParams(link.hash.slice(1)).get('token');
  assert.ok(token);
  assert.equal((await request('','/auth/landlord-activate',{...details,token,consent:false})).status,400);
  const activated=await request('','/auth/landlord-activate',{...details,token,role:'tenant',email:'other@test.example',landlord_id:'o'});
  assert.equal(activated.status,201);
  assert.equal(activated.headers.get('Set-Cookie'),null);
  assert.equal((await request('','/auth/landlord-activate',{...details,token})).status,400);
  const login=await request('','/auth/login',{email,password:details.password});
  assert.equal(login.status,200);
  const session=login.headers.get('Set-Cookie').split(';')[0].slice('trozy_session='.length);
  const bootstrap=await (await request(session,'/bootstrap')).json();
  assert.equal(bootstrap.user.role,'landlord');
  assert.equal(bootstrap.user.email,email);
  assert.deepEqual(bootstrap.data.properties,[]);
  assert.deepEqual(bootstrap.data.rooms,[]);
});

test('a signup request never replaces an existing account or discloses a verification link',async t=>{
  const {env,request,sql}=fixture(t);
  const sent=[];
  env.MAILER={async fetch(_url,opts){sent.push(JSON.parse(opts.body));return new Response(null,{status:202});}};
  const start=await request('','/auth/landlord-signup',{email:'o@test.example'});
  assert.equal(start.status,202);
  assert.equal(sent.length,0);
  const fresh=await request('','/auth/landlord-signup',{email:'fresh@example.test'});
  assert.equal(fresh.status,202);
  assert.equal(sent.length,1);
  assert.deepEqual(await start.json(),await fresh.json());
  const token=new URLSearchParams(new URL(sent[0].url).hash.slice(1)).get('token');
  sql.prepare('UPDATE landlord_signups SET expires_at=1').run();
  const expired=await request('','/auth/landlord-activate',{token,name:'Họ tên',phone:'0987654321',password:'expired-pass',consent:true});
  assert.equal(expired.status,400);
});

test('delivery failure retries later and resend works for an unfinished landlord signup',async t=>{
  const {env,request,sql}=fixture(t);
  const email='retry@example.test';
  env.TROZY_PUBLIC_URL='https://trozy.example';
  env.MAILER={async fetch(){return new Response(null,{status:503});}};
  assert.equal((await request('','/auth/landlord-signup',{email})).status,202);
  assert.ok(sql.prepare('SELECT next_send_at FROM landlord_signups WHERE email=?').get(email).next_send_at);
  sql.prepare('UPDATE landlord_signups SET next_send_at=0').run();
  const sent=[];
  env.MAILER={async fetch(_url,opts){sent.push(JSON.parse(opts.body));return new Response(null,{status:202});}};
  await worker.scheduled({},env);
  assert.equal(sent.length,1);
  await request('','/auth/resend-registration',{email});
  assert.equal(sent.length,1);
  sql.prepare('UPDATE landlord_signups SET requested_at=requested_at-600001').run();
  await request('','/auth/resend-registration',{email});
  assert.equal(sent.length,2);
  assert.notEqual(sent[0].url,sent[1].url);
  sql.prepare('UPDATE landlord_signups SET requested_at=0').run();
  await worker.scheduled({},env);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM landlord_signups').get().n,0);
});

test('notification dispatch uses the authorized recipient list and persists delivery',async t=>{
  const {env,request,sql}=fixture(t),sent=[];
  env.MAILER={async fetch(_url,opts){sent.push(JSON.parse(opts.body));return new Response(null,{status:202});}};
  const r=await request('o','/actions/notification-send',{propertyId:'p',scope:'tenant',tenantId:'tenant',title:'Lịch bảo trì',body:'Bảo trì vào sáng mai.'});
  assert.equal(r.status,200);assert.equal((await r.json()).emailQueued,1);
  await worker.scheduled({},env);
  await worker.scheduled({},env);
  assert.equal(sent.length,1);assert.equal(sent[0].to,'t@test.example');
  assert.equal(sql.prepare('SELECT status FROM notification_mail_outbox').get().status,'sent');
});

test('UC54 cloud reminders go to the linked tenant and owner once per phase and respect channel preferences',async t=>{
  const {env,sql}=fixture(t),sent=[];
  env.MAILER={async fetch(_url,opts){sent.push(JSON.parse(opts.body));return new Response(null,{status:202});}};
  const owner={role:'landlord',id:'o'};
  async function bill(dueDate){
    const store=await openOwnerStore(env,owner);
    store.put('invoices',{id:'due',ownerId:'o',propertyId:'p',roomId:'r',tenantId:'tenant',period:dueDate.slice(0,7),dueDate,total:100,paid:0,status:'issued'});
    await store.commit();
  }
  await bill(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date()));
  for(let i=0;i<3;i++)await worker.scheduled({},env);
  assert.deepEqual(sent.map(m=>m.to).sort(),['o@test.example','t@test.example']);
  sql.prepare('UPDATE users SET notification_preferences=? WHERE id=?').run(JSON.stringify({email_invoices:false}),'t');
  await bill('2020-01-01');
  for(let i=0;i<3;i++)await worker.scheduled({},env);
  assert.equal(sent.length,3);assert.equal(sent[2].to,'o@test.example');assert.match(sent[2].subject,/quá hạn/);
});

test('public binary upload enforces size and capacity before any KV write',async t=>{
  const {request,sql,env,blobs}=fixture(t);
  const bytes=Buffer.alloc(5*1024*1024+1);
  const huge=await worker.fetch(new Request('https://trozy.example/api/files',{method:'POST',
    headers:{cookie:'trozy_session=o','Content-Type':'application/octet-stream','X-Trozy-Upload':encodeURIComponent(JSON.stringify({type:'image/png',name:'large.png',purpose:'meter',roomId:'r'}))},
    body:bytes}),env);
  assert.equal(huge.status,413);assert.equal(blobs.size,0);
  const ok=await (await request('o','/files',{name:'text.txt',type:'text/plain',data:'eA=='})).json();
  // Model the full 1 GB namespace with 200 valid 5 MB metadata rows.
  sql.prepare('UPDATE files SET size=5000000 WHERE id=?').run(ok.id);
  const insert=sql.prepare(`INSERT INTO files(id,owner_id,uploader_id,name,type,content_hash,size,purpose,created_at,state)
    SELECT ?,owner_id,uploader_id,name,type,content_hash,size,purpose,created_at,state FROM files WHERE id=?`);
  for(let i=1;i<200;i++)insert.run('quota-'+i,ok.id);
  assert.equal((await request('t','/files',{name:'image.jpg',type:'image/jpeg',purpose:'meter',roomId:'r',data:'/9j/'})).status,507);
  assert.equal(blobs.size,1);
});
