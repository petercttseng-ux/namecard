const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateConfig({url=''}={}) {
 let parsed;try{parsed=new URL(url||globalThis.location?.origin);}catch{throw Error('請填寫名片後端伺服器網址。');}
 if(parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw Error('請使用伺服器根網址。');
 if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))throw Error('正式伺服器必須使用 HTTPS。');
 return {url:parsed.origin};
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
  this.config=validateConfig(config);this.fetcher=fetcher.bind(globalThis);this.storage=storage;this.sessionKey=`de-cang-sqlite-session:${this.config.url}`;
  try{this.session=JSON.parse(storage.getItem(this.sessionKey)||'null');}catch{this.session=null;}
 }
 setSession(session){this.session=session;if(session)this.storage.setItem(this.sessionKey,JSON.stringify(session));else this.storage.removeItem(this.sessionKey);}
 async raw(path,{method='GET',body,token}={}) {
  let response;try{response=await this.fetcher(this.config.url+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});}catch{throw Error('無法連線至名片伺服器，請確認後端網址及網路。');}
  let data;try{data=await response.json();}catch{throw Error('此網址未提供名片 API；GitHub Pages 只能放前端，請指定已部署的後端網址。');}
  if(!response.ok){const error=Error(data.message||'伺服器操作失敗，請稍後重試。');error.status=response.status;throw error;}return data;
 }
 async signIn(email,password){this.setSession(await this.raw('/api/auth/login',{method:'POST',body:{email,password}}));this.user=this.session.user;}
 async request(path,options={}){if(!this.session)throw Error('請先登入名片庫。');try{return await this.raw(path,{...options,token:this.session.access_token});}catch(error){if(error.status===401)this.setSession(null);throw error;}}
 async checkMembership(){this.user=await this.request('/api/auth/me');return this.user;}
 async signOut(){try{if(this.session)await this.request('/api/auth/logout',{method:'POST'});}finally{this.setSession(null);this.user=null;}}
 async list({includePhotos=false}={}){const result=[];const size=includePhotos?20:100;for(let offset=0;;offset+=size){const rows=await this.request(`/api/contacts?limit=${size}&offset=${offset}&photos=${includePhotos?1:0}`);result.push(...rows.map(fromRow));if(rows.length<size)break;}return result;}
 async get(id){return fromRow(await this.request(`/api/contacts/${encodeURIComponent(id)}`));}
 async create(c){return fromRow(await this.request('/api/contacts',{method:'POST',body:toRow(c)}));}
 async update(c,version,{starOnly=false}={}){const body=starOnly?{starred:!!c.starred}:toRow(c);return fromRow(await this.request(`/api/contacts/${encodeURIComponent(c.id)}?version=${Number(version)}`,{method:'PATCH',body}));}
 async remove(c){await this.request(`/api/contacts/${encodeURIComponent(c.id)}?version=${Number(c.version)}`,{method:'DELETE'});}
 async importContacts(contacts){return this.request('/api/contacts/import',{method:'POST',body:{items:contacts.map(toRow)}});}
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
