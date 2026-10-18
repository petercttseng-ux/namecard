const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateConfig({url='',publishableKey=''}={}) {
 let parsed;try{parsed=new URL(url);}catch{throw Error('請填寫 Supabase Project URL，例如 https://專案代碼.supabase.co；GitHub 儲存庫名稱不是資料庫網址。');}
 if(parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw Error('請使用 Supabase 專案根網址。');
 if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)))throw Error('資料庫連線必須使用 HTTPS。');
 if(publishableKey.startsWith('sb_secret_'))throw Error('不可使用 secret 或 service_role 金鑰。請使用 publishable／anon 公開金鑰。');
 if(!publishableKey.startsWith('sb_publishable_')) {
  try { const payload=JSON.parse(atob(publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw Error(); }
  catch { throw Error('請填寫有效的 publishable／anon 公開金鑰，不可使用 service_role。'); }
 }
 return {url:parsed.origin,publishableKey};
}
export function toRow(c) {
 const row={id:c.id,name:c.name,title:c.title||'',company:c.company||'',phone:c.phone||'',email:c.email||'',address:c.address||'',notes:c.notes||'',category:c.category||'其他聯絡',starred:!!c.starred,photo:c.photo||'',created_at:c.createdAt};
 if(!UUID.test(row.id))throw Error('名片識別碼格式錯誤。');
 return row;
}
export function fromRow(r) {
 return {id:r.id,name:r.name,title:r.title,company:r.company,phone:r.phone,email:r.email,address:r.address,notes:r.notes,category:r.category,starred:r.starred,photo:r.photo||'',hasPhoto:r.has_photo??!!r.photo,createdAt:r.created_at,version:r.version,demo:false};
}
export class CloudStore {
 constructor(config,{fetcher=globalThis.fetch,storage=globalThis.localStorage}={}) {
  this.config=validateConfig(config);this.fetcher=fetcher.bind(globalThis);this.storage=storage;this.sessionKey=`de-cang-session:${this.config.url}`;
  try{this.session=JSON.parse(storage.getItem(this.sessionKey)||'null');}catch{this.session=null;}
 }
 setSession(session) {this.session=session;if(session)this.storage.setItem(this.sessionKey,JSON.stringify(session));else this.storage.removeItem(this.sessionKey);}
 async raw(path,{method='GET',body,token,headers={}}={}) {
  let response;
  try{response=await this.fetcher(this.config.url+path,{method,headers:{apikey:this.config.publishableKey,...(token?{Authorization:`Bearer ${token}`} :{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
  catch{throw Error('無法連線至雲端資料庫，請確認網路後重試。');}
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{throw Error('資料庫回應格式異常，請稍後重試。');}
  if(!response.ok){const error=Error(response.status===401?'登入已失效，請重新登入。':response.status===403?'此帳號沒有名片資料庫存取權限。':response.status===409?'名片已存在或資料衝突，請重新整理。':response.status===404?'找不到名片資料表，請先執行 Supabase 建表 SQL。':path.startsWith('/auth/')?'登入或更新登入狀態失敗，請確認帳號密碼及專案設定。':'雲端操作失敗，請確認資料表、權限與網路後重試。');error.status=response.status;error.code=data?.code;throw error;}
  return data;
 }
 async signIn(email,password) {
  const result=await this.raw('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  this.setSession({...result,expires_at:Math.floor(Date.now()/1000)+result.expires_in});
  try{await this.checkMembership();}catch(error){this.setSession(null);throw error;}
 }
 async refreshToken() {
  if(this.refreshing)return this.refreshing;
  if(!this.session?.refresh_token)throw Error('請先登入名片資料庫。');
  this.refreshing=(async()=>{try{const result=await this.raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:this.session.refresh_token}});this.setSession({...result,expires_at:Math.floor(Date.now()/1000)+result.expires_in});}catch(error){if(error.status===400||error.status===401)this.setSession(null);throw error;}finally{this.refreshing=null;}})();
  return this.refreshing;
 }
 async request(path,options={},retry=true) {
  if(!this.session)throw Error('請先登入名片資料庫。');
  if((this.session.expires_at||0)<Date.now()/1000+60)await this.refreshToken();
  try{return await this.raw(path,{...options,token:this.session.access_token});}
  catch(error){if(error.status===401&&retry){await this.refreshToken();return this.request(path,options,false);}if(error.status===401)this.setSession(null);throw error;}
 }
 async checkMembership() {
  const user=await this.request('/auth/v1/user');
  const members=await this.request(`/rest/v1/namecard_members?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`);
  if(!members?.length)throw Error('此帳號尚未獲授權，請由管理員加入共用名片庫成員。');
  this.user=user;return user;
 }
 async signOut() {try{if(this.session)await this.request('/auth/v1/logout',{method:'POST'});}finally{this.setSession(null);this.user=null;}}
 async list({includePhotos=false}={}) {
  const rows=[];const size=includePhotos?20:100;const select=includePhotos?'*':'id,name,title,company,phone,email,address,notes,category,starred,has_photo,created_at,version';
  for(let offset=0;;offset+=size){const batch=await this.request(`/rest/v1/namecard_contacts?select=${select}&order=id.asc&limit=${size}&offset=${offset}`);rows.push(...batch.map(fromRow));if(batch.length<size)break;}
  return rows;
 }
 async get(id) {
  const rows=await this.request(`/rest/v1/namecard_contacts?select=*&id=eq.${encodeURIComponent(id)}`);
  if(!rows?.length)throw Error('此名片已被刪除或無法存取，請重新整理。');return fromRow(rows[0]);
 }
 async create(contact) {
  const rows=await this.request('/rest/v1/namecard_contacts',{method:'POST',headers:{Prefer:'return=representation'},body:toRow(contact)});
  if(!rows?.length)throw Error('名片未儲存，請確認帳號權限。');return fromRow(rows[0]);
 }
 async update(contact,version,{starOnly=false}={}) {
  const body=starOnly?{starred:!!contact.starred}:toRow(contact);delete body.id;delete body.created_at;
  const rows=await this.request(`/rest/v1/namecard_contacts?id=eq.${encodeURIComponent(contact.id)}&version=eq.${Number(version)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body});
  if(!rows?.length)throw Error('此名片已被其他裝置修改或刪除。請關閉編輯並重新整理後再試。');return fromRow(rows[0]);
 }
 async remove(contact) {
  const rows=await this.request(`/rest/v1/namecard_contacts?id=eq.${encodeURIComponent(contact.id)}&version=eq.${Number(contact.version)}`,{method:'DELETE',headers:{Prefer:'return=representation'}});
  if(!rows?.length)throw Error('此名片已被其他裝置修改或刪除，請重新整理後再試。');
 }
 async importContacts(contacts) {return this.request('/rest/v1/rpc/namecard_import',{method:'POST',body:{items:contacts.map(toRow)}});}
}
export async function prepareLegacy(raw,validate) {
 const values=JSON.parse(raw);const contacts=validate(values);const result=[];
 for(let i=0;i<contacts.length;i++) {
  if(contacts[i].demo)continue;
  if(UUID.test(values[i].id||''))contacts[i].id=values[i].id;
  else {const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(values[i]))));bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('');contacts[i].id=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
  result.push(contacts[i]);
 }
 return result;
}
