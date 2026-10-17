// Field extraction is heuristic: users review recognition before saving.
export function extractFields(text){
 const lines=text.normalize('NFKC').split(/\r?\n/).map(s=>s.trim().replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1')).filter(Boolean);
 const email=text.match(/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0].replace(/\s/g,'')||'';
 const phoneLines=lines.filter(l=>!/(?:fax|傳真)/i.test(l));
 const phones=[...phoneLines.join('\n').matchAll(/(?:\+?886[- .]?)?(?:\(?0?\d{1,3}\)?[- .]?)\d{3,4}[- .]?\d{3,4}(?:\s*(?:ext\.?|分機|#)\s*\d+)?/gi)].map(m=>m[0].trim());
 const company=lines.find(l=>/(公司|研究院|研究所|事務所|大學|學院|協會|基金會|中心|銀行|醫院|政府|公所|(?:縣|市).*[局處]|corporation|\b(?:inc|ltd|university|institute)\b)/i.test(l)&&!/@|https?:|www\./i.test(l))||'';
 let title=lines.find(l=>/(副所長|所長|董事長|執行長|總經理|副總|經理|主任|教授|研究員|工程師|顧問|專員|處長|局長|director|manager|professor|president|engineer|consultant|CEO|CTO)/i.test(l)&&l!==company&&!/@|https?:/i.test(l))||'';
 const address=lines.find(l=>/(地址|address)/i.test(l)||(/(?:縣|市|區|鄉|鎮)/.test(l)&&/(?:路|街|段|巷|弄|號)/.test(l)))||'';
 const clean=l=>l.replace(/^(?:姓名|name|職稱|title|公司|company|地址|address)\s*[:：]\s*/i,'').trim();
 const explicit=lines.find(l=>/^(?:姓名|name)\s*[:：]/i.test(l));
 const inlineName=title.match(/^([\u3400-\u9fff]{2,4}?)(副所長|所長|董事長|執行長|總經理|副總經理|經理|主任|教授|研究員|工程師|顧問|專員|處長|局長)$/);
 const name=explicit?clean(explicit):inlineName?inlineName[1]:lines.find(l=>l!==company&&l!==title&&l!==address&&!/[@\d:：/]|電話|傳真|地址|手機|聯絡|網站|www\./i.test(l)&&(/^[\u3400-\u9fff]{2,4}$/.test(l)||/^[A-Za-z]+(?:[ .'-]+[A-Za-z]+){1,3}$/.test(l)))||'';
 if(inlineName)title=inlineName[2];
 let category='';if(/政府|公所|[局處]$/.test(company))category='政府機關';else if(/研究|大學|學院|university|institute/i.test(company))category='學術研究';else if(/事務所|顧問/.test(company))category='專業服務';else if(/公司|corporation|\b(?:inc|ltd)\b/i.test(company))category='產業夥伴';
 return {name,company:clean(company),title:clean(title),phone:[...new Set(phones)].join(' / '),email,address:clean(address),category};
}
let loading;
function loadEngine(){if(globalThis.Tesseract)return Promise.resolve(globalThis.Tesseract);if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/ocr/tesseract.min.js',import.meta.url).href;script.onload=()=>resolve(globalThis.Tesseract);script.onerror=()=>{script.remove();loading=null;reject(Error('辨識元件下載失敗，請確認網路後重試。'));};document.head.append(script);});return loading;}
export async function recognizeCard(image,onProgress){const engine=await loadEngine();let worker;try{worker=await engine.createWorker(['chi_tra','eng'],1,{workerPath:new URL('./vendor/ocr/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/ocr/tesseract-core-lstm.wasm.js',import.meta.url).href,langPath:new URL('./ocr-data/',import.meta.url).href,logger:m=>onProgress(m)});const result=await worker.recognize(image);return result.data.text;}finally{if(worker)await worker.terminate();}}
