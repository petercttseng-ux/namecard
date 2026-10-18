import {ContactDatabase} from '../database.js';
import path from 'node:path';
process.umask(0o077);
const database=new ContactDatabase(process.env.NAMECARD_DB_PATH||path.resolve('data/namecard.sqlite'));
try{await database.createUser(process.env.NAMECARD_ADMIN_EMAIL,process.env.NAMECARD_ADMIN_PASSWORD);console.log('登入帳號已建立。');}finally{database.close();}
