import {auditFields, identityCodec, now} from '../backend/model.mjs';
import {fail, ownerId} from '../backend/domain.mjs';

// Business rules synchronously inspect multiple collections. Load one landlord's
// metadata in a consistent D1 batch and commit only changed rows. Concurrent
// writers must still own the revision they read when the write batch executes.
export async function openOwnerStore(env, user, {includeFiles=true}={}) {
  if (!/^[\da-f]{64}$/i.test(env.TROZY_DATA_KEY || '')) fail(503,'Chưa cấu hình khóa dữ liệu Trozy.');
  const owner = ownerId(user) || user.id;
  const db = env.DB;
  const find = (sql, ...params) => db.prepare(sql).bind(...params);
  const [revision, records, files, accounts] = await db.batch([
    find('SELECT version FROM owner_revisions WHERE owner_id=?', owner),
    find('SELECT collection,id,data FROM records WHERE owner_id=? ORDER BY rowid', owner),
    includeFiles ? find("SELECT * FROM files WHERE owner_id=? AND state='ready'", owner) : find('SELECT id FROM files WHERE 0'),
    find('SELECT id,name,email,role,tenant_id,landlord_id,notification_preferences FROM users WHERE id=? OR landlord_id=?',owner,owner),
  ]);
  const version = revision.results[0]?.version ?? 0;
  const codec = identityCodec(Buffer.from(env.TROZY_DATA_KEY,'hex'));
  const initial = new Map(records.results.map(row=>[row.collection+'/'+row.id, row.data]));
  const collectionKeys = new Map();
  for(const row of records.results){
    if(!collectionKeys.has(row.collection))collectionKeys.set(row.collection,new Set());
    collectionKeys.get(row.collection).add(row.id);
  }
  const fileMap = new Map(files.results.map(row=>[row.id,row]));
  const users = new Map(accounts.results.map(row=>[row.id,row]));
  const decoded = new Map();
  let changes = new Map();

  function get(collection,key) {
    const ref=collection+'/'+key;
    if(changes.has(ref)) return structuredClone(changes.get(ref));
    if(!initial.has(ref)) return null;
    if(!decoded.has(ref)) decoded.set(ref,codec.decode(initial.get(ref)));
    return structuredClone(decoded.get(ref));
  }
  function savepoint(fn, alwaysRollback=false) {
    const before=new Map(changes);
    try { const result=fn(); if(alwaysRollback) changes=before; return result; }
    catch(error) { changes=before; throw error; }
  }
  const store={
    get, version,
    list(collection,requestedOwner) {
      if(requestedOwner && requestedOwner!==owner) return [];
      const keys=new Set(collectionKeys.get(collection));
      const prefix=collection+'/';
      for(const key of changes.keys())if(key.startsWith(prefix))keys.add(key.slice(prefix.length));
      return [...keys].map(key=>get(collection,key)).filter(Boolean);
    },
    put(collection,row) {
      if(row.ownerId!==owner) fail(403,'Không thể thay đổi dữ liệu thuộc chủ trọ khác.');
      const saved={...row,createdAt:row.createdAt||now(),updatedAt:now()};
      changes.set(collection+'/'+row.id,structuredClone(saved));
      return saved;
    },
    remove(collection,key) { changes.set(collection+'/'+key,null); },
    changeFields(collection,key) {
      const ref=collection+'/'+key;
      if(!changes.has(ref)||!auditFields[collection]) return [];
      const before=initial.has(ref)?codec.decode(initial.get(ref)):{};
      const after=changes.get(ref)||{};
      return auditFields[collection].split(' ').filter(k=>JSON.stringify(before[k]??null)!==JSON.stringify(after[k]??null))
        .map(field=>({field,before:before[field]??null,after:after[field]??null}));
    },
    transaction:fn=>savepoint(fn), attempt:fn=>savepoint(fn), preview:fn=>savepoint(fn,true),
    account:key=>users.get(key),
    fileInfo(key) {
      const file=fileMap.get(key);
      return file && (!file.expires_at || file.expires_at>Date.now()/1000) ? file : null;
    },
    hasPropertyFile:(id,property)=>id===owner && files.results.some(f=>f.property_id===property),
    async commit(extra=[]) {
      if(!changes.size&&!extra.length) return;
      const statements=[find(`INSERT INTO owner_revisions(owner_id,version) VALUES(?,1)
        ON CONFLICT(owner_id) DO UPDATE SET version=CASE WHEN version=? THEN version+1 ELSE -1 END`,owner,version)];
      for(const [ref,row] of changes) {
        const slash=ref.indexOf('/'), collection=ref.slice(0,slash), id=ref.slice(slash+1);
        if(!row) {
          if(initial.has(ref)) statements.push(find('DELETE FROM records WHERE owner_id=? AND collection=? AND id=?',owner,collection,id));
        } else {
          const data=JSON.stringify(codec.encode(row));
          statements.push(initial.has(ref)
            ?find('UPDATE records SET property_id=?,tenant_id=?,data=? WHERE owner_id=? AND collection=? AND id=?',row.propertyId||null,row.tenantId||null,data,owner,collection,id)
            :find('INSERT INTO records(collection,id,owner_id,property_id,tenant_id,data) VALUES(?,?,?,?,?,?)',collection,id,owner,row.propertyId||null,row.tenantId||null,data));
        }
      }
      try { await db.batch([...statements,...extra]); }
      catch(error) {
        const detail=[error.message,error.cause?.message].join(' ');
        if(/revision_conflict|UNIQUE constraint/i.test(detail)) fail(409,'Dữ liệu đã thay đổi hoặc bị trùng. Hãy tải lại và thử lại.');
        throw error;
      }
    },
  };
  return store;
}
