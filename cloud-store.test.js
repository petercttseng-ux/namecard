import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toRow,fromRow,prepareLegacy} from './cloud-store.js';
import {validateContacts} from './contacts.js';
const id='12345678-1234-4123-8123-123456789abc';
test('row mapping round-trips and rejects malformed IDs',()=>{const row=toRow({id,name:'測試',createdAt:'2026-01-01T00:00:00.000Z',starred:1});assert.equal(row.starred,true);assert.equal(row.category,'其他聯絡');assert.equal(fromRow({...row,version:3}).createdAt,row.created_at);assert.throws(()=>toRow({id:'bad',name:'x'}),/識別碼/);});
test('legacy migration skips demos and keeps stable IDs',async()=>{const raw=JSON.stringify([{id,name:'實際聯絡人'},{name:'缺少舊識別碼'},{id:crypto.randomUUID(),name:'示範',demo:true}]);const a=await prepareLegacy(raw,validateContacts),b=await prepareLegacy(raw,validateContacts);assert.equal(a.length,2);assert.equal(a[0].id,id);assert.deepEqual(a.map(c=>c.id),b.map(c=>c.id));});
