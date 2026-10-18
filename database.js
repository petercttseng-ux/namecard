import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {categories} from './contacts.js';
const scrypt=promisify(scryptCallback);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export function normalizeContact(input){
 if(!input||typeof input!=='object'||!uuid.test(input.id||''))throw new HttpError(400,'名片識別碼格式錯誤。');
 const contact={id:input.id};
 for(const key of ['name','title','company','phone','email','address','notes']){const value=input[key]??'';if(typeof value!=='string'||value.length>(key==='notes'?3000:240))throw new HttpError(400,'名片欄位格式或長度不正確。');contact[key]=value.trim();}
 if(!contact.name)throw new HttpError(400,'請填寫姓名。');
 contact.category=input.category||'其他聯絡';if(!categories.includes(contact.category))throw new HttpError(400,'分類格式不正確。');
 if(input.starred!==undefined&&typeof input.starred!=='boolean')throw new HttpError(400,'收藏格式不正確。');contact.starred=!!input.starred;
 contact.photo=input.photo||'';if(typeof contact.photo!=='string'||contact.photo.length>=4200000||(contact.photo&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(contact.photo)))throw new HttpError(400,'照片格式不正確或超過大小限制。');
 contact.created_at=input.created_at||new Date().toISOString();if(!Number.isFinite(Date.parse(contact.created_at)))throw new HttpError(400,'日期格式不正確。');
 return contact;
}
const hashToken=value=>createHash('sha256').update(value).digest('hex');
export class ContactDatabase {
 constructor(filename){
  if(filename!==':memory:'){mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});}
  this.db=new DatabaseSync(filename);if(filename!==':memory:')chmodSync(filename,0o600);
  this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY, password_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,data TEXT NOT NULL CHECK(json_valid(data)),created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
 }
 close(){this.db.close();}
 hasUsers(){return this.db.prepare('SELECT count(*) AS n FROM users').get().n>0;}
 async createUser(email,password){
  email=String(email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>240)throw new Error('請設定有效的管理員電子郵件。');
  if(typeof password!=='string'||password.length<12||password.length>1024)throw new Error('管理員密碼需為 12 至 1024 字元。');
  const salt=randomBytes(16).toString('hex'),hash=await scrypt(password,salt,64);
  this.db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(email,`${salt}:${hash.toString('hex')}`);
 }
 async signIn(email,password){
  if(typeof email!=='string'||typeof password!=='string'||password.length>1024)throw new HttpError(401,'帳號或密碼不正確。');
  email=email.trim().toLowerCase();const user=this.db.prepare('SELECT password_hash FROM users WHERE email=?').get(email);
  const [salt,expected]=(user?.password_hash||`${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');const actual=await scrypt(password,salt,64);
  if(!user||!timingSafeEqual(actual,Buffer.from(expected,'hex')))throw new HttpError(401,'帳號或密碼不正確。');
  const token=randomBytes(32).toString('base64url'),expires=Math.floor(Date.now()/1000)+7*86400;
  this.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Math.floor(Date.now()/1000));
  this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(token),email,expires);
  return {access_token:token,expires_at:expires,user:{email}};
 }
 authenticate(token){const row=this.db.prepare('SELECT email FROM sessions WHERE token_hash=? AND expires_at>?').get(hashToken(token||''),Math.floor(Date.now()/1000));if(!row)throw new HttpError(401,'登入已失效，請重新登入。');return {email:row.email};}
 signOut(token){this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));}
 fromRow(row){if(!row)return null;return {...JSON.parse(row.data),id:row.id,created_at:row.created_at,version:row.version,has_photo:row.has_photo??!!JSON.parse(row.data).photo};}
 list({offset=0,limit=100,includePhotos=false}={}){
  const data=includePhotos?'data':"json_remove(data,'$.photo') AS data";
  return this.db.prepare(`SELECT id,${data},created_at,version,(json_extract(data,'$.photo')<>'') AS has_photo FROM contacts ORDER BY id LIMIT ? OFFSET ?`).all(limit,offset).map(r=>this.fromRow(r));
 }
 get(id){const row=this.fromRow(this.db.prepare('SELECT * FROM contacts WHERE id=?').get(id));if(!row)throw new HttpError(404,'此名片已被刪除或無法存取，請重新整理。');return row;}
 create(input){const c=normalizeContact(input);if(this.db.prepare('SELECT id FROM contacts WHERE id=?').get(c.id))throw new HttpError(409,'名片已存在，請重新整理。');this.db.prepare('INSERT INTO contacts(id,data,created_at) VALUES(?,?,?)').run(c.id,JSON.stringify(c),c.created_at);return this.get(c.id);}
 update(id,version,input){
  const previous=this.get(id);if(previous.version!==version)throw new HttpError(409,'此名片已被其他裝置修改。請關閉編輯並重新整理後再試。');
  const starOnly=Object.keys(input).length===1&&typeof input.starred==='boolean';
  const c=normalizeContact({...(starOnly?{...previous,starred:input.starred}:input),id,created_at:previous.created_at});
  const result=this.db.prepare('UPDATE contacts SET data=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(c),id,version);
  if(!result.changes)throw new HttpError(409,'此名片已被其他裝置修改，請重新整理。');return this.get(id);
 }
 remove(id,version){const result=this.db.prepare('DELETE FROM contacts WHERE id=? AND version=?').run(id,version);if(!result.changes)throw new HttpError(409,'此名片已被其他裝置修改或刪除，請重新整理。');}
 importContacts(items){
  if(!Array.isArray(items)||items.length>5000)throw new HttpError(400,'每次匯入最多 5,000 張名片。');const records=items.map(normalizeContact);let count=0;
  this.db.exec('BEGIN IMMEDIATE');try{const insert=this.db.prepare('INSERT OR IGNORE INTO contacts(id,data,created_at) VALUES(?,?,?)');for(const c of records)count+=Number(insert.run(c.id,JSON.stringify(c),c.created_at).changes);this.db.exec('COMMIT');return count;}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
}
