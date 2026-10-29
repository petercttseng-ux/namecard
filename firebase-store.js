// Firebase (Auth + Firestore) data store. Same interface as the former SQLite CloudStore,
// so app.js keeps working unchanged. The SDK is injected to keep this module testable.
import {toRow,fromRow} from './cloud-store.js';

export const PHOTO_LIMIT = 900_000; // Firestore documents are capped at 1 MiB.
const CONTACTS = 'contacts', PHOTOS = 'photos', MEMBERS = 'members';

export function firebaseMessage(error) {
 const code = String(error?.code || '').replace(/^firestore\//, '');
 const map = {
  'auth/invalid-credential': '電子郵件或密碼錯誤。',
  'auth/invalid-login-credentials': '電子郵件或密碼錯誤。',
  'auth/wrong-password': '電子郵件或密碼錯誤。',
  'auth/user-not-found': '電子郵件或密碼錯誤。',
  'auth/invalid-email': '電子郵件格式錯誤。',
  'auth/user-disabled': '此帳號已停用，請聯絡管理員。',
  'auth/too-many-requests': '登入嘗試次數過多，請稍後再試。',
  'auth/network-request-failed': '無法連線至 Firebase，請檢查網路。',
  'auth/invalid-api-key': 'Firebase 設定錯誤（apiKey），請聯絡管理員。',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase 設定錯誤（apiKey），請聯絡管理員。',
  'auth/operation-not-allowed': 'Firebase 尚未啟用「電子郵件/密碼」登入，請聯絡管理員。',
  'permission-denied': '此帳號沒有存取名片庫的權限，請聯絡管理員。',
  'unauthenticated': '登入已失效，請重新登入。',
  'unavailable': '無法連線至 Firebase，請檢查網路。',
  'deadline-exceeded': 'Firebase 回應逾時，請稍後重試。',
  'resource-exhausted': 'Firebase 免費額度已用完或請求過多，請稍後再試。',
  'failed-precondition': 'Firestore 資料庫尚未建立，請聯絡管理員。',
  'not-found': 'Firestore 資料庫尚未建立，請聯絡管理員。',
 };
 return map[code] || error?.message || 'Firebase 操作失敗，請稍後重試。';
}
function wrap(error) {
 if (error?.status) return error;
 const result = Error(firebaseMessage(error));
 const code = String(error?.code || '').replace(/^firestore\//, '');
 result.status = code === 'unauthenticated' ? 401 : code === 'permission-denied' ? 403 : undefined;
 return result;
}
function conflict(message = '此名片已被其他裝置修改，請重新整理後再編輯。') { const e = Error(message); e.status = 409; return e; }
function gone() { const e = Error('此名片已被其他裝置刪除，請重新整理。'); e.status = 404; return e; }
function checkPhoto(photo, name) {
 if (photo && photo.length > PHOTO_LIMIT) throw Error(`「${name}」的名片照片過大（Firebase 單筆上限約 900 KB），請重新上傳或裁切。`);
}

export class FirebaseStore {
 constructor({app, sdk}) {
  this.sdk = sdk; this.auth = sdk.getAuth(app); this.db = sdk.getFirestore(app); this.user = null;
 }
 get session() { const u = this.auth.currentUser; return u ? {user: {email: u.email, uid: u.uid}} : null; }
 setSession(session) { if (!session) { this.user = null; this.sdk.signOut(this.auth).catch(() => {}); } }
 async ready() { await this.auth.authStateReady?.(); }
 ref(collection, id) { return this.sdk.doc(this.db, collection, id); }
 async run(task) { try { return await task(); } catch (error) { const e = wrap(error); if (e.status === 401) this.setSession(null); throw e; } }
 async signIn(email, password) {
  try { await this.sdk.signInWithEmailAndPassword(this.auth, email, password); } catch (error) { throw wrap(error); }
  await this.checkMembership();
 }
 async checkMembership() {
  const u = this.auth.currentUser;
  if (!u) throw Error('請先登入名片庫。');
  const snap = await this.run(() => this.sdk.getDoc(this.ref(MEMBERS, u.uid)));
  if (!snap.exists()) {
   await this.sdk.signOut(this.auth).catch(() => {});
   this.user = null;
   const e = Error(`此帳號（${u.email}）尚未獲授權使用名片庫，請聯絡管理員。`); e.status = 403; throw e;
  }
  this.user = {email: u.email, uid: u.uid};
  return this.user;
 }
 async signOut() { try { await this.sdk.signOut(this.auth); } finally { this.user = null; } }
 requireLogin() { if (!this.auth.currentUser) throw Error('請先登入名片庫。'); }
 async loadPhotos(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 20) {
   out.push(...await Promise.all(rows.slice(i, i + 20).map(async r => {
    if (!r.has_photo) return {...r, photo: ''};
    const p = await this.sdk.getDoc(this.ref(PHOTOS, r.id));
    return {...r, photo: p.exists() ? p.data().data || '' : ''};
   })));
  }
  return out;
 }
 async list({includePhotos = false} = {}) {
  this.requireLogin();
  return this.run(async () => {
   const snap = await this.sdk.getDocs(this.sdk.query(this.sdk.collection(this.db, CONTACTS), this.sdk.orderBy('created_at', 'desc')));
   let rows = snap.docs.map(d => ({...d.data(), id: d.id}));
   if (includePhotos) rows = await this.loadPhotos(rows);
   return rows.map(fromRow);
  });
 }
 async get(id) {
  this.requireLogin();
  return this.run(async () => {
   const snap = await this.sdk.getDoc(this.ref(CONTACTS, id));
   if (!snap.exists()) throw gone();
   const [row] = await this.loadPhotos([{...snap.data(), id}]);
   return fromRow(row);
  });
 }
 async create(c) {
  this.requireLogin();
  const {photo, ...row} = toRow(c); checkPhoto(photo, row.name);
  const data = {...row, has_photo: !!photo, version: 1, updated_at: new Date().toISOString()};
  return this.run(() => this.sdk.runTransaction(this.db, async tx => {
   const existing = await tx.get(this.ref(CONTACTS, row.id));
   if (existing.exists()) throw conflict('此名片識別碼已存在，請重新整理。');
   tx.set(this.ref(CONTACTS, row.id), data);
   if (photo) tx.set(this.ref(PHOTOS, row.id), {data: photo});
   return fromRow({...data, photo});
  }));
 }
 async update(c, version, {starOnly = false} = {}) {
  this.requireLogin();
  return this.run(() => this.sdk.runTransaction(this.db, async tx => {
   const ref = this.ref(CONTACTS, c.id), snap = await tx.get(ref);
   if (!snap.exists()) throw gone();
   const current = snap.data();
   if (current.version !== Number(version)) throw conflict();
   const stamp = {version: current.version + 1, updated_at: new Date().toISOString()};
   if (starOnly) {
    const next = {...current, starred: !!c.starred, ...stamp};
    tx.set(ref, next);
    return fromRow({...next, id: c.id, photo: c.photo || ''});
   }
   const {photo, ...row} = toRow(c); checkPhoto(photo, row.name);
   const next = {...row, created_at: current.created_at, has_photo: !!photo, ...stamp};
   tx.set(ref, next);
   if (photo) tx.set(this.ref(PHOTOS, c.id), {data: photo}); else tx.delete(this.ref(PHOTOS, c.id));
   return fromRow({...next, photo});
  }));
 }
 async remove(c) {
  this.requireLogin();
  return this.run(() => this.sdk.runTransaction(this.db, async tx => {
   const ref = this.ref(CONTACTS, c.id), snap = await tx.get(ref);
   if (!snap.exists()) return;
   if (snap.data().version !== Number(c.version)) throw conflict('此名片已被其他裝置修改，請重新整理後再刪除。');
   tx.delete(ref); tx.delete(this.ref(PHOTOS, c.id));
  }));
 }
 // Adds new contacts only; records whose ID already exists are skipped (no duplicates on re-import).
 async importContacts(contacts) {
  this.requireLogin();
  const rows = contacts.map(toRow);
  rows.forEach(r => checkPhoto(r.photo, r.name));
  return this.run(async () => {
   const fresh = [];
   for (let i = 0; i < rows.length; i += 20) {
    const exists = await Promise.all(rows.slice(i, i + 20).map(r => this.sdk.getDoc(this.ref(CONTACTS, r.id)).then(s => s.exists())));
    rows.slice(i, i + 20).forEach((r, j) => { if (!exists[j]) fresh.push(r); });
   }
   const now = new Date().toISOString();
   for (let i = 0; i < fresh.length; i += 200) {
    const batch = this.sdk.writeBatch(this.db);
    for (const {photo, ...row} of fresh.slice(i, i + 200)) {
     batch.set(this.ref(CONTACTS, row.id), {...row, has_photo: !!photo, version: 1, updated_at: now});
     if (photo) batch.set(this.ref(PHOTOS, row.id), {data: photo});
    }
    await batch.commit();
   }
   return fresh.length;
  });
 }
}

export function configured(config) { return !!(config?.apiKey && config?.appId && config?.projectId); }
