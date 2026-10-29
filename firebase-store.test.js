import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FirebaseStore,firebaseMessage,configured,PHOTO_LIMIT} from './firebase-store.js';
import config from './firebase-config.js';
const id='12345678-1234-4123-8123-123456789abc';

// Minimal in-memory Firebase fake exercising the same SDK calls the store uses.
function fake({member=true,user={uid:'u1',email:'a@example.com'}}={}){
 const docs=new Map();if(member)docs.set('members/u1',{role:'editor'});
 const auth={currentUser:null,authStateReady:async()=>{}};
 const snap=(path)=>({exists:()=>docs.has(path),data:()=>structuredClone(docs.get(path)),id:path.split('/')[1]});
 const sdk={
  getAuth:()=>auth,getFirestore:()=>({}),doc:(_db,c,i)=>`${c}/${i}`,collection:(_db,c)=>c,orderBy:f=>f,query:(c,f)=>({c,f}),
  signInWithEmailAndPassword:async(_a,email,pw)=>{if(pw!=='good'){const e=Error('x');e.code='auth/invalid-credential';throw e;}auth.currentUser={...user,email};},
  signOut:async()=>{auth.currentUser=null;},
  getDoc:async p=>{if(!auth.currentUser){const e=Error('x');e.code='permission-denied';throw e;}return snap(p);},
  getDocs:async({c,f})=>({docs:[...docs.keys()].filter(k=>k.startsWith(c+'/')).map(snap).sort((a,b)=>b.data()[f].localeCompare(a.data()[f]))}),
  runTransaction:async(_db,fn)=>{const writes=[];const tx={get:async p=>snap(p),set:(p,v)=>writes.push(()=>docs.set(p,structuredClone(v))),delete:p=>writes.push(()=>docs.delete(p))};const r=await fn(tx);writes.forEach(w=>w());return r;},
  writeBatch:()=>{const writes=[];return {set:(p,v)=>writes.push(()=>docs.set(p,structuredClone(v))),commit:async()=>writes.forEach(w=>w())};},
 };
 return {store:new FirebaseStore({app:{},sdk}),docs,auth};
}
const card=(extra={})=>({id,name:'測試',company:'研究院',createdAt:'2026-10-01T00:00:00.000Z',...extra});

test('deployed config targets the namecard Firebase project',()=>{assert.equal(config.projectId,'namecard-96e85');assert.equal(config.authDomain,'namecard-96e85.firebaseapp.com');assert.equal(configured({projectId:'p'}),false);});
test('wrong password shows a Chinese message',async()=>{const {store}=fake();await assert.rejects(store.signIn('a@example.com','bad'),/電子郵件或密碼錯誤/);});
test('signed-in user without a member record is refused and signed out',async()=>{const {store,auth}=fake({member:false});await assert.rejects(store.signIn('a@example.com','good'),/尚未獲授權/);assert.equal(auth.currentUser,null);});
test('create, list without photos, get with photo',async()=>{const {store,docs}=fake();await store.signIn('a@example.com','good');const saved=await store.create(card({photo:'data:image/jpeg;base64,AAA'}));assert.equal(saved.version,1);assert.equal(docs.get(`contacts/${id}`).photo,undefined);assert.equal(docs.get(`photos/${id}`).data,'data:image/jpeg;base64,AAA');const [listed]=await store.list();assert.equal(listed.photo,'');assert.equal(listed.hasPhoto,true);assert.equal((await store.get(id)).photo,'data:image/jpeg;base64,AAA');assert.equal((await store.list({includePhotos:true}))[0].photo,'data:image/jpeg;base64,AAA');});
test('star toggle keeps the stored photo; stale version is rejected',async()=>{const {store,docs}=fake();await store.signIn('a@example.com','good');await store.create(card({photo:'data:x'}));const starred=await store.update({id,starred:true},1,{starOnly:true});assert.equal(starred.version,2);assert.equal(docs.get(`photos/${id}`).data,'data:x');await assert.rejects(store.update(card(),1),e=>e.status===409);});
test('full edit keeps created date and removing the photo deletes it',async()=>{const {store,docs}=fake();await store.signIn('a@example.com','good');await store.create(card({photo:'data:x'}));const next=await store.update(card({name:'改名',createdAt:'2099-01-01T00:00:00.000Z',photo:''}),1);assert.equal(next.name,'改名');assert.equal(next.createdAt,'2026-10-01T00:00:00.000Z');assert.ok(!docs.has(`photos/${id}`));});
test('delete checks version and removes the photo',async()=>{const {store,docs}=fake();await store.signIn('a@example.com','good');const c=await store.create(card({photo:'data:x'}));await assert.rejects(store.remove({...c,version:9}),e=>e.status===409);await store.remove(c);assert.equal(docs.size,1);});
test('import skips existing IDs, so repeating it does not duplicate',async()=>{const {store}=fake();await store.signIn('a@example.com','good');const other={...card(),id:crypto.randomUUID()};assert.equal(await store.importContacts([card(),other]),2);assert.equal(await store.importContacts([card(),other]),0);assert.equal((await store.list()).length,2);});
test('oversized photos are rejected before writing',async()=>{const {store,docs}=fake();await store.signIn('a@example.com','good');await assert.rejects(store.create(card({photo:'x'.repeat(PHOTO_LIMIT+1)})),/照片過大/);assert.equal(docs.size,1);});
test('operations require login; permission errors are translated',async()=>{const {store}=fake();await assert.rejects(store.list(),/請先登入/);assert.match(firebaseMessage({code:'permission-denied'}),/沒有存取/);});
