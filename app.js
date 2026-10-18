import defaultConfig from './supabase-config.js';
import {CloudStore,validateConfig,prepareLegacy} from './cloud-store.js';
import {loadPhoto,transformPhoto} from './image-tools.js';
import {extractFields,recognizeCard} from './ocr.js';
import {categories,validateContacts,filterContacts} from './contacts.js';
const $=s=>document.querySelector(s), key='de-cang-contacts-v1';
const palettes=[['#edf3e9','#7c946b'],['#eef0f7','#8390b0'],['#f8f0e5','#b89c70'],['#f1edf5','#9b87a9'],['#edf3f2','#779b96']];
let contacts=[],view='all',layout='grid',editing=null,photo='';
let store=null,cloudBusy=false,loaded=false,legacyRaw='',lastSynced='';
try{legacyRaw=localStorage.getItem(key)||'';}catch{}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
async function persist(next,options={}){
 if(!loaded||!store?.session){toast('請先連線並登入雲端名片庫。');return false;}
 if(cloudBusy){toast('雲端同步中，請稍後再試。');return false;}
 cloudBusy=true;setCloudUI();
 try{
  const removed=contacts.filter(c=>!next.some(n=>n.id===c.id));
  const changed=next.filter(c=>!contacts.some(old=>old.id===c.id&&JSON.stringify(old)===JSON.stringify(c)));
  if(removed.length+changed.length!==1)throw Error('一次只能修改一張名片；批次資料請使用匯入功能。');
  if(removed.length){await store.remove(removed[0]);contacts=contacts.filter(c=>c.id!==removed[0].id);}
  else{const previous=contacts.find(c=>c.id===changed[0].id);const saved=previous?await store.update(changed[0],previous.version,options):await store.create(changed[0]);contacts=previous?contacts.map(c=>c.id===saved.id?saved:c):[saved,...contacts];}
  lastSynced=new Date().toLocaleTimeString('zh-TW');render();return true;
 }catch(error){handleCloudError(error);return false;}
 finally{cloudBusy=false;setCloudUI();}
}
function render(){const counts=categories.map(c=>contacts.filter(x=>x.category===c).length);$('#groupNav').innerHTML=categories.map((c,i)=>`<button class="group" data-cat="${c}"><i class="dot" style="--tag-color:${palettes[i][1]}"></i>${c}<b>${counts[i]}</b></button>`).join('');$('#navCount').textContent=contacts.length;$('#total').textContent=contacts.length;$('#stars').textContent=contacts.filter(c=>c.starred).length;const now=new Date();$('#monthly').textContent=contacts.filter(c=>new Date(c.createdAt).getMonth()===now.getMonth()&&new Date(c.createdAt).getFullYear()===now.getFullYear()).length;$('#companies').textContent=new Set(contacts.map(c=>c.company.trim()).filter(Boolean)).size;
const cat=$('#category').value;$('#chips').innerHTML=['',...categories].map((c,i)=>`<button class="chip ${cat===c?'active':''}" data-cat="${c}">${c||'全部名片'} <span>${i?counts[i-1]:contacts.length}</span></button>`).join('');const filtered=filterContacts(contacts,{query:$('#search').value,category:cat,view,sort:$('#sort').value});$('#listTitle').textContent=view==='star'?'重要聯絡人':view==='recent'?'最近 30 天新增':'名片收藏';$('#resultCount').textContent=`${filtered.length} 張`;$('#footerCount').textContent=`顯示 ${filtered.length} 張，共 ${contacts.length} 張名片`;$('#cards').className=`cards ${layout==='list'?'list':''}`;$('#cards').innerHTML=filtered.map(c=>{const p=palettes[categories.indexOf(c.category)]||palettes[4];return `<article class="card" tabindex="0" role="button" aria-label="查看 ${esc(c.name)} 的名片" data-id="${c.id}" style="--tint:${p[0]};--tone:${p[1]}"><button class="star-btn ${c.starred?'on':''}" data-star="${c.id}" aria-label="${c.starred?'取消':'設為'}重要聯絡人" aria-pressed="${c.starred}">${c.starred?'★':'☆'}</button><div class="card-top"><div class="contact-avatar">${esc(c.name[0])}</div><div><div class="contact-name">${esc(c.name)}</div><div class="contact-title">${esc(c.title||'尚未填寫職稱')}</div></div></div><div class="company">${esc(c.company||'尚未填寫機構')}</div><div class="contact-line"><span>♧</span>${esc(c.phone||'尚未填寫電話')}</div><div class="contact-line"><span>✉</span>${esc(c.email||'尚未填寫電子郵件')}</div><div class="card-bottom"><span class="tag">${esc(c.category)}</span><small>${c.demo?'示範資料 · ':''}${new Date(c.createdAt).toLocaleDateString('zh-TW',{month:'2-digit',day:'2-digit'})} 新增</small></div></article>`;}).join('')||'<div class="empty">尚無符合條件的名片<br>試試其他關鍵字，或新增第一位聯絡人。</div>';setCloudUI();}
$('#category').insertAdjacentHTML('beforeend',categories.map(c=>`<option>${c}</option>`).join(''));
$('#search').addEventListener('input',render);$('#category').onchange=render;$('#sort').onchange=render;
document.addEventListener('click',async e=>{const cat=e.target.closest('[data-cat]');if(cat){$('#category').value=cat.dataset.cat;render();}const nav=e.target.closest('[data-view]');if(nav){view=nav.dataset.view;document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x===nav));render();}const star=e.target.closest('[data-star]');if(star){await persist(contacts.map(c=>c.id===star.dataset.star?{...c,starred:!c.starred}:c),{starOnly:true});return;}const card=e.target.closest('[data-id]');if(card)showDetail(card.dataset.id);});
$('#cards').addEventListener('keydown',e=>{if(e.target.classList.contains('card')&&['Enter',' '].includes(e.key)){e.preventDefault();showDetail(e.target.dataset.id);}});
for(const type of ['grid','list'])$('#'+type+'View').onclick=()=>{layout=type;$('#gridView').classList.toggle('selected',type==='grid');$('#listView').classList.toggle('selected',type==='list');render();};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#search').focus();}});
function openEditor(c){if(!loaded||cloudBusy){toast('請先登入並完成雲端資料載入。');return;}$('#ocrStatus').classList.remove('needs-review');autoFields={};ocrResults=[];$('#ocrAlternative').innerHTML='<option value="0">建議辨識結果</option>';$('#cropEditor').hidden=true;ocrVersion++;ocrBusy=false;$('#ocrStatus').textContent='上傳照片即可自動辨識；辨識結果請核對後儲存。';$('#ocrText').value='';editing=c?.id||null;photo=c?.photo||'';$('#cardForm').reset();$('#cardForm').elements.category.value='';$('#modalTitle').textContent=c?'編輯名片':'新增名片';if(c)for(const k of ['name','title','company','category','phone','email','address','notes','starred']){const input=$('#cardForm').elements[k];if(k==='starred')input.checked=c[k];else input.value=c[k]||'';}updatePhoto();$('#editor').showModal();}
function updatePhoto(){for(const id of ['rotateLeft','rotateRight','cropPhoto'])$('#'+id).disabled=!photo||ocrBusy;$('#cardForm').elements.photo.disabled=ocrBusy;$('#cardForm button[type=submit]').disabled=ocrBusy||cloudBusy||!loaded;$('#recognizeBtn').disabled=!photo||ocrBusy;$('#photoPreview').hidden=!photo;$('#removePhoto').hidden=!photo;if(photo)$('#photoPreview').src=photo;else $('#photoPreview').removeAttribute('src');}
$('#removePhoto').onclick=()=>{$('#cropEditor').hidden=true;ocrVersion++;ocrBusy=false;$('#ocrText').value='';$('#ocrStatus').textContent='照片已移除';photo='';$('#cardForm').elements.photo.value='';updatePhoto();};
$('#cardForm').elements.photo.onchange=async e=>{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024){toast('請選擇 3 MB 以下的 PNG、JPEG 或 WebP 圖片。');e.target.value='';return;}const readVersion=++ocrVersion;ocrBusy=false;const reader=new FileReader();reader.onload=()=>{if(readVersion!==ocrVersion)return;photo=reader.result;updatePhoto();runRecognition();};reader.onerror=()=>toast('照片讀取失敗，請重新選擇。');reader.readAsDataURL(file);};
$('#addBtn').onclick=()=>openEditor();document.querySelectorAll('#editor .close').forEach(b=>b.onclick=()=>$('#editor').close());
$('#cardForm').onsubmit=async e=>{e.preventDefault();if(ocrBusy){toast('名片辨識中，請等待完成或關閉後重新開啟。');return;}const data=new FormData(e.target);if(!String(data.get('name')).trim()){toast('請填寫姓名。');return;}const previous=contacts.find(c=>c.id===editing);const c={id:editing||crypto.randomUUID(),createdAt:previous?.createdAt||new Date().toISOString(),photo,starred:data.has('starred'),demo:false};for(const k of ['name','title','company','category','phone','email','address','notes'])c[k]=String(data.get(k)||'').trim();if(!c.category)c.category='其他聯絡';if(await persist(editing?contacts.map(x=>x.id===editing?c:x):[c,...contacts])){$('#editor').close();toast(editing?'名片已更新':'名片已新增');}};
async function showDetail(id){if(cloudBusy||!loaded)return;let c;cloudBusy=true;setCloudUI();try{c=await store.get(id);contacts=contacts.map(item=>item.id===id?c:item);render();}catch(error){handleCloudError(error);return;}finally{cloudBusy=false;setCloudUI();}$('#detailBody').innerHTML=`<div class="modal-head"><small>CONTACT PROFILE</small><button class="close" id="detailClose" aria-label="關閉">×</button></div>${c.demo?'<div class="demo-note">此名片為虛構示範資料，僅用於展示操作。請新增您的實際聯絡人。</div>':''}<div class="detail-person"><div class="contact-avatar">${esc(c.name[0])}</div><div><h2>${esc(c.name)}</h2><p>${esc(c.title)} · ${esc(c.category)}</p></div></div>${[['公司 / 機構',c.company],['電話',c.phone],['電子郵件',c.email],['地址',c.address],['備註 / 交流紀錄',c.notes]].map(([k,v])=>`<div class="detail-row"><small>${k}</small>${esc(v||'尚未填寫')}</div>`).join('')}${c.photo?`<img class="detail-photo" src="${esc(c.photo)}" alt="${esc(c.name)}的名片照片">`:''}<div class="modal-footer"><button class="danger" id="deleteContact">刪除名片</button><button class="secondary" id="vcard">下載 vCard</button><button class="primary" id="editContact">編輯名片</button></div>`;$('#detailClose').onclick=()=>$('#detail').close();$('#editContact').onclick=()=>{$('#detail').close();openEditor(c);};$('#deleteContact').onclick=async()=>{if(confirm(`確定刪除「${c.name}」的名片？此操作無法復原。`)&&await persist(contacts.filter(x=>x.id!==id))){$('#detail').close();toast('名片已刪除');}};$('#vcard').onclick=()=>{const v=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/[,;]/g,'\\$&');download(['BEGIN:VCARD','VERSION:3.0',`FN:${v(c.name)}`,`N:${v(c.name)};;;;`,`ORG:${v(c.company)}`,`TITLE:${v(c.title)}`,`TEL:${v(c.phone)}`,`EMAIL:${v(c.email)}`,`NOTE:${v(c.notes)}`,'END:VCARD'].join('\r\n'),`${c.name}.vcf`,'text/vcard;charset=utf-8');};$('#detail').showModal();}
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#exportBtn').onclick=async()=>{if(!loaded||cloudBusy)return;cloudBusy=true;setCloudUI();try{const backup=await store.list({includePhotos:true});download(JSON.stringify(backup,null,2),`德藏名片備份-${new Date().toLocaleDateString('sv-SE')}.json`,'application/json');toast('已匯出雲端名片及照片備份，請妥善保管。');}catch(error){handleCloudError(error);}finally{cloudBusy=false;setCloudUI();}};$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>20*1024*1024)throw Error('備份檔案不得超過 20 MB。');const incoming=validateContacts(JSON.parse(await f.text()));if(contacts.length+incoming.length>5000)throw Error('匯入後不得超過 5,000 筆名片。');if(!incoming.length)throw Error('此備份沒有名片。');if(confirm(`將新增 ${incoming.length} 張名片至共用雲端庫，保留現有資料。是否繼續？`))await importCloud(incoming);}catch(err){toast(err instanceof SyntaxError?'無法讀取 JSON 備份，請確認檔案格式。':err.message);}finally{e.target.value='';}};
let ocrVersion=0,ocrBusy=false,autoFields={},ocrResults=[];
function applyExtracted(text){
 const fields=extractFields(text);let count=0;
 for(const [key,value] of Object.entries(fields)){
  const input=$('#cardForm').elements[key];
  // Replace earlier OCR guesses, while preserving manual entries and corrections.
  if(value&&(!input.value.trim()||input.value===autoFields[key])){input.value=value;autoFields[key]=value;count++;}
 }
 return count;
}
async function runRecognition(){
 if(!photo||ocrBusy)return;
 const version=++ocrVersion;ocrBusy=true;updatePhoto();
 $('#ocrStatus').textContent='正在載入高精度語言模型，首次載入可能較久…';
 try{
  const result=await recognizeCard(photo,m=>{
   if(version!==ocrVersion)return;
   const labels={'preprocessing':'正在放大小字、調整對比','pass-sparse':'第一輪：分散文字辨識','pass-layout':'第二輪：整體版面辨識','recognizing text':'正在辨識文字','loading language traineddata':'正在載入高精度語言資料','initializing api':'正在初始化','loading tesseract core':'正在載入辨識引擎'};
   $('#ocrStatus').textContent=(labels[m.status]||'正在準備辨識')+' '+Math.round((m.progress||0)*100)+'%';
  });
  if(version!==ocrVersion)return;
  const {text,confidence,alternatives=[]}=result;
  ocrResults=[text,...alternatives];
  $('#ocrAlternative').innerHTML=ocrResults.map((_,i)=>`<option value="${i}">${i?'另一版辨識結果':'建議辨識結果'}</option>`).join('');
  $('#ocrText').value=text;
  const count=applyExtracted(text);
  const recognized=extractFields(text);const incomplete=!recognized.name||!recognized.company;const low=confidence<75||incomplete;
  $('#ocrStatus').classList.toggle('needs-review',low);
  $('#ocrStatus').textContent=text.trim()?`辨識完成，已填入或更新 ${count} 個欄位。${incomplete?'姓名或機構未完整辨識，建議裁切名片後重試。':low?'辨識信心偏低，建議裁切名片、調整方向後重試。':'請核對姓名、電話與其他資訊後儲存。'} 引擎信心分數 ${Math.round(confidence)}/100（非準確率）。`:'未能辨識出文字，請先裁切名片範圍、調整方向或重拍清晰照片。';
 }catch{
  if(version===ocrVersion)$('#ocrStatus').textContent='辨識失敗，請檢查網路及照片格式後重試。仍可手動填寫並儲存名片。';
 }finally{
  if(version===ocrVersion){ocrBusy=false;updatePhoto();}
 }
}
$('#recognizeBtn').onclick=runRecognition;
$('#extractBtn').onclick=()=>{const count=applyExtracted($('#ocrText').value);$('#ocrStatus').textContent=`已從原文填入或更新 ${count} 個欄位，保留手動修正，請核對後儲存。`;};
$('#ocrAlternative').onchange=()=>{$('#ocrText').value=ocrResults[Number($('#ocrAlternative').value)]||'';};
async function changePhoto(options){
 if(!photo||ocrBusy)return;
 try{
  photo=await transformPhoto(photo,options);$('#cropEditor').hidden=true;updatePhoto();await runRecognition();
 }catch(error){toast(error.message);}
}
$('#rotateLeft').onclick=()=>changePhoto({rotation:-90});
$('#rotateRight').onclick=()=>changePhoto({rotation:90});
let cropImage,cropStart,cropRect;
const cropCanvas=$('#cropCanvas'), cropContext=cropCanvas.getContext('2d');
function drawCrop(){
 if(!cropImage)return;
 cropContext.clearRect(0,0,cropCanvas.width,cropCanvas.height);
 cropContext.drawImage(cropImage,0,0,cropCanvas.width,cropCanvas.height);
 if(cropRect){cropContext.strokeStyle='#42ba71';cropContext.lineWidth=3;cropContext.fillStyle='#315c4d30';cropContext.fillRect(cropRect.x,cropRect.y,cropRect.width,cropRect.height);cropContext.strokeRect(cropRect.x,cropRect.y,cropRect.width,cropRect.height);}
}
$('#cropPhoto').onclick=async()=>{
 if(!photo||ocrBusy)return;
 try{cropImage=await loadPhoto(photo);const scale=Math.min(1,900/cropImage.width);cropCanvas.width=Math.round(cropImage.width*scale);cropCanvas.height=Math.round(cropImage.height*scale);cropRect=null;cropStart=null;$('#applyCrop').disabled=true;$('#cropEditor').hidden=false;drawCrop();}catch{toast('圖片讀取失敗，請重新上傳。');}
};
function cropPoint(event){const bounds=cropCanvas.getBoundingClientRect();return {x:Math.max(0,Math.min(cropCanvas.width,(event.clientX-bounds.left)*cropCanvas.width/bounds.width)),y:Math.max(0,Math.min(cropCanvas.height,(event.clientY-bounds.top)*cropCanvas.height/bounds.height))};}
cropCanvas.onpointerdown=event=>{cropStart=cropPoint(event);cropCanvas.setPointerCapture(event.pointerId);cropRect=null;$('#applyCrop').disabled=true;};
cropCanvas.onpointermove=event=>{if(!cropStart)return;const point=cropPoint(event);cropRect={x:Math.min(cropStart.x,point.x),y:Math.min(cropStart.y,point.y),width:Math.abs(point.x-cropStart.x),height:Math.abs(point.y-cropStart.y)};drawCrop();};
cropCanvas.onpointerup=()=>{cropStart=null;$('#applyCrop').disabled=!cropRect||cropRect.width<30||cropRect.height<30;};
cropCanvas.onpointercancel=()=>{cropStart=null;cropRect=null;$('#applyCrop').disabled=true;drawCrop();};
$('#cancelCrop').onclick=()=>{$('#cropEditor').hidden=true;};
$('#applyCrop').onclick=()=>{if(!cropRect||!cropImage)return;const sx=cropImage.width/cropCanvas.width,sy=cropImage.height/cropCanvas.height;changePhoto({crop:{x:cropRect.x*sx,y:cropRect.y*sy,width:cropRect.width*sx,height:cropRect.height*sy}});};


// Supabase is the sole source of truth. Old browser data is only read for explicit migration.
const configKey='de-cang-supabase-config-v1';
function setCloudUI(){
 const ready=loaded&&!!store?.session;
 for(const id of ['addBtn','importBtn','exportBtn','migrateBtn','syncBtn'])$('#'+id).disabled=!ready||cloudBusy;
 document.querySelectorAll('.star-btn').forEach(button=>button.disabled=!ready||cloudBusy);
 $('#cardForm button[type=submit]').disabled=!ready||cloudBusy||ocrBusy;
 $('#connectionLabel').textContent=ready?'Supabase 共用資料庫':store?.session?'正在載入雲端資料':'尚未登入共用資料庫';
 $('#accountBtn').disabled=cloudBusy;$('#logoutBtn').disabled=cloudBusy;
 $('#accountBtn').textContent=ready?'☁ 已登入 · 管理連線':'登入雲端名片庫';
 $('#cloudNotice').textContent=cloudBusy?'正在與共用名片庫同步…':ready?`名片及照片集中儲存於 Supabase。上次同步 ${lastSynced}；其他裝置更新會於重新整理後顯示。`:'尚未連線至共用名片庫。請登入；原本機資料會保留，可於登入後搬移。';
 $('#migrateBtn').hidden=!legacyRaw;
 $('#legacySection').hidden=!legacyRaw;
 $('#loginForm').hidden=!!store?.session;
 $('#signedIn').hidden=!store?.session;
 $('#signedInEmail').textContent=store?.user?.email||store?.session?.user?.email||'';
}
function clearCloudView(){loaded=false;contacts=[];photo='';editing=null;ocrVersion++;ocrBusy=false;autoFields={};ocrResults=[];$('#cardForm').reset();$('#ocrText').value='';$('#detailBody').replaceChildren();$('#photoPreview').removeAttribute('src');$('#photoPreview').hidden=true;$('#editor').close();$('#detail').close();render();}
function handleCloudError(error){
 if(!store?.session)clearCloudView();
 toast(error.message);$('#cloudError').textContent=error.message;
}
function readConfig(){
 if(defaultConfig.url&&defaultConfig.publishableKey)return defaultConfig;
 try{return JSON.parse(localStorage.getItem(configKey)||'null');}catch{return null;}
}
async function loadCloud(){
 if(cloudBusy||!store?.session)return;
 cloudBusy=true;setCloudUI();
 try{contacts=await store.list();loaded=true;lastSynced=new Date().toLocaleTimeString('zh-TW');$('#cloudError').textContent='';render();}
 catch(error){handleCloudError(error);}
 finally{cloudBusy=false;setCloudUI();}
}
async function importCloud(incoming){
 if(!loaded||cloudBusy)return;
 cloudBusy=true;setCloudUI();
 let count;
 try{count=await store.importContacts(incoming);try{contacts=await store.list();lastSynced=new Date().toLocaleTimeString('zh-TW');render();}catch(error){toast(`已儲存 ${count} 張名片，但更新畫面失敗，請按重新整理。`);return;}toast(`已將 ${count} 張名片儲存至共用雲端庫；相同識別碼不會重複搬移。`);}
 catch(error){handleCloudError(error);}
 finally{cloudBusy=false;setCloudUI();}
}
async function initializeCloud(){
 const config=readConfig();const form=$('#configForm');
 if(config){form.elements.url.value=config.url||'';form.elements.publishableKey.value=config.publishableKey||'';try{store=new CloudStore(config);}catch(error){$('#cloudError').textContent=error.message;}}
 const fixed=!!(defaultConfig.url&&defaultConfig.publishableKey);
 form.elements.url.readOnly=fixed;form.elements.publishableKey.readOnly=fixed;form.querySelector('button').disabled=fixed;
 if(fixed)$('#configHelp').textContent='所有裝置使用部署時統一指定的同一個 Supabase 專案；連線資訊由管理員設定。';
 $('#configDetails').open=!store;
 setCloudUI();
 if(store?.session){try{await store.checkMembership();await loadCloud();}catch(error){store.setSession(null);handleCloudError(error);}}
 if(!loaded&&!$('#cloudDialog').open)$('#cloudDialog').showModal();
}
$('#accountBtn').onclick=()=>{$('#cloudError').textContent='';setCloudUI();$('#cloudDialog').showModal();};
$('#closeCloud').onclick=()=>$('#cloudDialog').close();
$('#configForm').onsubmit=async event=>{
 event.preventDefault();if(defaultConfig.url&&defaultConfig.publishableKey)return;
 try{const config=validateConfig(Object.fromEntries(new FormData(event.target)));if(store?.session){toast('請先登出再變更資料庫連線。');return;}localStorage.setItem(configKey,JSON.stringify(config));store=new CloudStore(config);loaded=false;contacts=[];render();$('#cloudError').textContent='連線設定已儲存，請使用獲授權帳號登入。';$('#configDetails').open=false;}
 catch(error){$('#cloudError').textContent=error.message;}
};
$('#loginForm').onsubmit=async event=>{
 event.preventDefault();if(!store){$('#cloudError').textContent='請先完成資料庫連線設定。';$('#configDetails').open=true;return;}
 const button=event.target.querySelector('button');button.disabled=true;$('#cloudError').textContent='正在登入…';
 try{await store.signIn(event.target.elements.email.value.trim(),event.target.elements.password.value);await loadCloud();if(loaded)$('#cloudDialog').close();}
 catch(error){handleCloudError(error);}
 finally{event.target.elements.password.value='';button.disabled=false;setCloudUI();}
};
$('#logoutBtn').onclick=async()=>{try{await store?.signOut();}catch{toast('已清除此裝置登入狀態；伺服器登出未確認。');}finally{clearCloudView();$('#cloudError').textContent='已登出此裝置。';}};
$('#syncBtn').onclick=loadCloud;
$('#legacyExport').onclick=()=>{if(legacyRaw)download(legacyRaw,'德藏原本機資料備份.json','application/json');};
$('#migrateBtn').onclick=async()=>{try{const incoming=await prepareLegacy(legacyRaw,validateContacts);if(!incoming.length){toast('本機只有示範資料或沒有可搬移的實際名片。');return;}if(confirm(`將 ${incoming.length} 張本機名片搬移至共用雲端庫？原本機資料會保留，示範名片不會上傳。`))await importCloud(incoming);}catch(error){toast('本機資料無法搬移，請先下載原本機備份：'+error.message);}};
setInterval(()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]')&&loaded&&!cloudBusy)loadCloud();},30000);
render();
initializeCloud();
