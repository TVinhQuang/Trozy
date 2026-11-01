/** Full local administrator backup, including file blobs and authentication data.
 * Usage: node src/backend/backup.mjs [destination-directory]
 * Keep the resulting database and key private. JSON /api/export remains owner-scoped.
 */
import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync,copyFileSync,writeFileSync,constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {loadEnvFile} from 'node:process';
if(existsSync('.env'))loadEnvFile('.env');
const source=resolve(process.env.TROZY_DB_PATH||'data/trozy.sqlite');
const destination=resolve(process.argv[2]||join('backups','trozy-'+new Date().toISOString().replaceAll(/[:.]/g,'-')));
if(!existsSync(source))throw new Error('Database chưa tồn tại. Khởi động ứng dụng trước khi sao lưu.');
const target=join(destination,'trozy.sqlite');
if(existsSync(target))throw new Error('Thư mục đích đã có bản sao lưu. Chọn thư mục mới để tránh ghi đè.');
mkdirSync(destination,{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,target);}finally{db.close();}
let encryptionKey='external-env';
if(!process.env.TROZY_DATA_KEY){
  const keyPath=join(dirname(source),'.trozy-data-key');
  if(!existsSync(keyPath))throw new Error('Không tìm thấy khóa dữ liệu. Bản sao database cần khóa gốc để khôi phục.');
  copyFileSync(keyPath,join(destination,'.trozy-data-key'),constants.COPYFILE_EXCL);
  encryptionKey='.trozy-data-key';
}
writeFileSync(join(destination,'backup.json'),JSON.stringify({format:'trozy-full-backup-v1',createdAt:new Date().toISOString(),database:'trozy.sqlite',encryptionKey},null,2),{flag:'wx'});
console.log('Đã sao lưu đầy đủ vào '+destination);
if(encryptionKey==='external-env')console.log('Giữ riêng giá trị TROZY_DATA_KEY hiện tại để có thể khôi phục dữ liệu định danh.');
