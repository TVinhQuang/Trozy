/** Local development mail transport. Run: node src/backend/outbox.mjs [email].
 * Tokens are printed only by an explicit local CLI, never by public HTTP routes.
 */
import {openStore} from './db.mjs';
import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
if(existsSync('.env'))loadEnvFile('.env');
const store=openStore(process.env.TROZY_DB_PATH||'data/trozy.sqlite');
const email=process.argv[2];
const rows=email?store.db.prepare('SELECT email,kind,token,created_at FROM mail_outbox WHERE email=? ORDER BY created_at DESC LIMIT 10').all(email):store.db.prepare('SELECT email,kind,token,created_at FROM mail_outbox ORDER BY created_at DESC LIMIT 10').all();
for(const row of rows){const action=row.kind==='reset'?'reset':'verify';console.log(row.created_at+' | '+row.email+' | '+row.kind+'\nhttp://127.0.0.1:5173/?action='+action+'&token='+row.token+'\nMã: '+row.token+'\n');}
if(!rows.length)console.log('Hộp thư phát triển chưa có thư.');store.close();
