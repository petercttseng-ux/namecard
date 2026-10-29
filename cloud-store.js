// Shared contact row mapping and legacy-browser-data migration helpers.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function toRow(c) {
 const row={id:c.id,name:c.name,title:c.title||'',company:c.company||'',phone:c.phone||'',email:c.email||'',address:c.address||'',notes:c.notes||'',category:c.category||'其他聯絡',starred:!!c.starred,photo:c.photo||'',created_at:c.createdAt};
 if(!UUID.test(row.id))throw Error('名片識別碼格式錯誤。');
 return row;
}
export function fromRow(r) {
 return {id:r.id,name:r.name,title:r.title,company:r.company,phone:r.phone,email:r.email,address:r.address,notes:r.notes,category:r.category,starred:r.starred,photo:r.photo||'',hasPhoto:r.has_photo??!!r.photo,createdAt:r.created_at,version:r.version,demo:false};
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
