import {ContactDatabase} from '../database.js';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
process.umask(0o077);
const filename=process.env.NAMECARD_DB_PATH||path.resolve('data/namecard.sqlite');
const target=path.resolve(process.argv[2]||`data/backups/namecard-${Date.now()}.sqlite`);
mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
const database=new ContactDatabase(filename);
try{database.db.prepare('VACUUM INTO ?').run(target);chmodSync(target,0o600);console.log('SQLite 一致性備份已完成。');}finally{database.close();}
