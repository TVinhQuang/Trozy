import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync,mkdtempSync,writeFileSync,rmSync,rmdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {projectRoot} from '../src/shared/project-paths.mjs';
import {prepareProjectRuntime} from './project-runtime.mjs';

const root=resolve(projectRoot),cleanup=prepareProjectRuntime();
const cli=join(root,'node_modules/wrangler/bin/wrangler.js');
const localState=join(root,'data/cloudflare-local');
const cache=join(root,'.cache/cloudflare');
const env={...process.env,WRANGLER_SEND_METRICS:'false',XDG_CONFIG_HOME:cache,
  XDG_CACHE_HOME:cache,WRANGLER_LOG_PATH:join(cache,'logs'),CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false'};
mkdirSync(cache,{recursive:true});
function wrangler(args) {
  // Local emulation originally stored its data under the binding names DB and FILES.
  // Select those stable bindings even after production resource IDs are configured.
  let targetArgs=args;
  const explicitEnv=args.some(arg=>arg==='-e'||arg==='--env'||arg.startsWith('--env='));
  if(!explicitEnv){
    if(args.includes('--local'))targetArgs=[...args,'--env','local'];
    else if(args[0]==='deploy'&&!env.CLOUDFLARE_ENV)targetArgs=[...args,'--env',''];
  }
  const child=spawnSync(process.execPath,[cli,...targetArgs],{cwd:root,stdio:'inherit',env});
  if(child.error)throw child.error;
  if(child.status!==0)throw Error('Wrangler exited with '+child.status);
}
function devKey(){
  const file=join(root,'.dev.vars');
  if(!existsSync(file))writeFileSync(file,'TROZY_DATA_KEY='+randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o600});
}
async function seed(args) {
  if(args.length!==1||!['--local','--remote'].includes(args[0])) throw Error('Choose --local or --remote for the demo seed.');
  const local=args[0]==='--local';
  const {openStore}=await import('../src/backend/db.mjs');
  const {seedDemo}=await import('../src/backend/seed.mjs');
  const {passwordDigest}=await import('../src/cloudflare/auth.mjs');
  // Only synthetic fixture records from a fresh in-memory database are eligible.
  const store=openStore(':memory:');seedDemo(store);
  const privateDir=join(root,'.secrets');mkdirSync(privateDir,{recursive:true});
  const accountFile=join(privateDir,'cloudflare-demo-'+(local?'local':'remote')+'-'+randomUUID()+'.json');
  const accounts=[],sql=[];
  const quote=value=>value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
  try{
    for(const u of store.db.prepare('SELECT * FROM users').all()){
      const password=randomBytes(18).toString('base64url');accounts.push({email:u.email,password,role:u.role});
      const cols=['id','name','email','password_hash','role','tenant_id','landlord_id','verified','phone','created_at'];
      u.password_hash=await passwordDigest(password);
      sql.push('INSERT INTO users('+cols.join(',')+') VALUES('+cols.map(k=>quote(u[k])).join(',')+');');
    }
    for(const row of store.db.prepare('SELECT * FROM records').all()){
      // Fixture records may include synthetic identity data encrypted with the
      // in-memory key. Remove those fields before seeding a separate installation.
      const value=store.get(row.collection,row.id);delete value.identityNumber;
      for(const member of value.memberProfiles||[])delete member.identityNumber;
      row.data=JSON.stringify(value);
      const cols=['collection','id','owner_id','property_id','tenant_id','data'];
      sql.push('INSERT INTO records('+cols.join(',')+') VALUES('+cols.map(k=>quote(row[k])).join(',')+');');
    }
    const scratch=mkdtempSync(join(process.env.TEMP,'seed-'));
    const file=join(scratch,'demo.sql');
    try{
      writeFileSync(file,sql.join('\n'),{flag:'wx'});
      writeFileSync(accountFile,JSON.stringify(accounts,null,2),{flag:'wx',mode:0o600});
      wrangler(['d1','execute','DB',args[0],'--file',file,...(local?['--persist-to',localState]:[])]);
      console.log('Demo account credentials: '+accountFile);
    }catch(error){console.error('Seed did not complete. Credential file from this attempt: '+accountFile);throw error;}
    finally{rmSync(file,{force:true});rmdirSync(scratch);}
  }finally{store.close();}
}
const [command,...args]=process.argv.slice(2);
try{
  if(command==='init'){devKey();wrangler(['d1','migrations','apply','DB','--local','--persist-to',localState]);}
  else if(command==='dev'){devKey();wrangler(['dev','--local','--persist-to',localState,...args]);}
  else if(command==='seed')await seed(args);
  else if(command==='check')wrangler(['deploy','--dry-run','--outdir',join(cache,'bundle')]);
  else if(command==='cli')wrangler(args);
  else throw Error('Use init, dev, seed, check or cli.');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{cleanup();}
