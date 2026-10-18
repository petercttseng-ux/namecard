import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContactDatabase,HttpError} from './database.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const staticFiles=new Set(['index.html','app.js','style.css','contacts.js','ocr.js','image-tools.js','cloud-store.js','backend-config.js']);
async function readBody(req,maxBytes=22*1024*1024){let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>maxBytes)throw new HttpError(413,'資料超過 22 MB，請分批匯入。');chunks.push(chunk);}try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{throw new HttpError(400,'JSON 格式不正確。');}}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
export async function createServer({dbPath=process.env.NAMECARD_DB_PATH||path.join(root,'data/namecard.sqlite'),adminEmail=process.env.NAMECARD_ADMIN_EMAIL,adminPassword=process.env.NAMECARD_ADMIN_PASSWORD,allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean)}={}){
 const db=new ContactDatabase(dbPath);try{if(!db.hasUsers()&&adminEmail&&adminPassword)await db.createUser(adminEmail,adminPassword);}catch(error){db.close();throw error;}
 const attempts=new Map();let activeLogins=0;
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
   if(pathname.startsWith('/api/')){
    const origin=req.headers.origin;const sameOrigin=origin&&new URL(origin).host===req.headers.host;
    if(origin&&!sameOrigin&&!allowedOrigins.includes(origin))throw new HttpError(403,'此網站尚未獲允許連接名片伺服器。');
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');}
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(pathname==='/api/health'&&req.method==='GET'){json(res,200,{ok:true,initialized:db.hasUsers()});return;}
    if(pathname==='/api/auth/login'&&req.method==='POST'){
     if(!db.hasUsers())throw new HttpError(503,'管理者尚未建立登入帳號，請先在伺服器完成初始化。');
     const ip=req.socket.remoteAddress,now=Date.now();for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
     const attempt=attempts.get(ip)||{count:0,until:now+15*60e3};if(attempt.count>=10||attempts.size>=10000)throw new HttpError(429,'登入嘗試過多，請 15 分鐘後重試。');attempt.count++;attempts.set(ip,attempt);
     if(activeLogins>=4)throw new HttpError(429,'登入服務忙碌，請稍後重試。');activeLogins++;try{const body=await readBody(req,4096);const session=await db.signIn(body.email,body.password);attempts.delete(ip);json(res,200,session);return;}finally{activeLogins--;}
    }
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');const user=db.authenticate(token);
    if(pathname==='/api/auth/me'&&req.method==='GET'){json(res,200,user);return;}
    if(pathname==='/api/auth/logout'&&req.method==='POST'){db.signOut(token);json(res,200,{ok:true});return;}
    if(pathname==='/api/contacts/import'&&req.method==='POST'){const body=await readBody(req);json(res,200,db.importContacts(body.items));return;}
    if(pathname==='/api/contacts'){
     if(req.method==='GET'){const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw new HttpError(400,'分頁格式不正確。');json(res,200,db.list({offset,limit,includePhotos:url.searchParams.get('photos')==='1'}));return;}
     if(req.method==='POST'){json(res,201,db.create(await readBody(req)));return;}
    }
    const match=pathname.match(/^\/api\/contacts\/([0-9a-f-]{36})$/i);
    if(match){const id=match[1];if(req.method==='GET'){json(res,200,db.get(id));return;}const version=Number(url.searchParams.get('version'));if(!Number.isInteger(version)||version<1)throw new HttpError(400,'缺少名片版本，請重新整理。');if(req.method==='PATCH'){json(res,200,db.update(id,version,await readBody(req)));return;}if(req.method==='DELETE'){db.remove(id,version);json(res,200,{ok:true});return;}}
    throw new HttpError(404,'找不到此 API。');
   }
   if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'不支援此操作。');
   const relative=decodeURIComponent(pathname).replace(/^\//,'')||'index.html';
   if(!staticFiles.has(relative)&&!(/^(?:vendor\/ocr|ocr-data)\/[A-Za-z0-9_.-]+\.(?:js|wasm|gz)$/.test(relative)))throw new HttpError(404,'Not found');
   const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw new HttpError(404,'Not found');
   const data=await readFile(file);const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.gz':'application/gzip','.wasm':'application/wasm'};res.setHeader('Content-Type',mime[path.extname(file)]);res.setHeader('Cache-Control','no-cache');res.end(req.method==='HEAD'?undefined:data);
  }catch(error){if(!res.headersSent)json(res,error.status||500,{message:error.status?error.message:'伺服器處理失敗，請稍後重試。'});else res.end();}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;server.on('close',()=>db.close());return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);
 const server=await createServer();server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Namecard SQLite server ready'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
