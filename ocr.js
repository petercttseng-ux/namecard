import { preparePhoto } from './image-tools.js';
// Field extraction is heuristic: users review recognition before saving.
export function extractFields(text){
 const lines=text.normalize('NFKC').split(/\r?\n/).map(s=>s.trim().replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1')).filter(Boolean);
 const normalized=text.normalize('NFKC');
 const email=normalized.replace(/[ \t]*([@.])[ \t]*/g,'$1').match(/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0].replace(/\s/g,'')||'';
 const phoneLines=lines.map(l=>l.split(/(?:fax|傳真)\s*[:：]?/i)[0]).filter(l=>!/@|(?:路|街|號)|編號|統編|tax|\bID\b|https?:|www\./i.test(l));
 const phones=[...phoneLines.join('\n').matchAll(/(?:\+?886[- .]*)?(?:\(?0?\d{1,3}\)?[- .]*)\d{3,4}[- .]*\d{3,4}(?:\s*(?:ext\.?|分機|#)\s*\d+)?/gi)].map(m=>m[0].trim());
 const company=lines.find(l=>/^(?:公司|機構|單位|company|organization)\s*[:：]/i.test(l))||lines.find(l=>/(公司|研究院|研究所|事務所|大學|學院|協會|基金會|中心|銀行|醫院|政府|公所|(?:縣|市).*[局處]|corporation|\b(?:inc|ltd|university|institute)\b)/i.test(l)&&!/@|https?:|www\./i.test(l))||'';
 let title=lines.find(l=>/^(?:職稱|title|position)\s*[:：]/i.test(l))||lines.find(l=>/(副所長|所長|董事長|執行長|總經理|副總|經理|主任|教授|研究員|工程師|顧問|專員|處長|局長|director|manager|professor|president|engineer|consultant|CEO|CTO)/i.test(l)&&l!==company&&!/@|https?:/i.test(l))||'';
 const address=lines.find(l=>/(地址|address)/i.test(l)||(/(?:縣|市|區|鄉|鎮)/.test(l)&&/(?:路|街|段|巷|弄|號)/.test(l)))||'';
 const clean=l=>l.replace(/^(?:姓名|name|職稱|title|position|公司|機構|單位|company|organization|地址|address)\s*[:：]\s*/i,'').trim();
 const explicit=lines.find(l=>/^(?:姓名|name)\s*[:：]/i.test(l));
 const inlineName=title.match(/^([\u3400-\u9fff]{2,4}?)(副所長|所長|董事長|執行長|總經理|副總經理|經理|主任|教授|研究員|工程師|顧問|專員|處長|局長)$/);
 const titleFirst=title.match(/^(副所長|所長|董事長|執行長|總經理|副總經理|經理|主任|教授|研究員|工程師|顧問|專員|處長|局長)\s*([\u3400-\u9fff]{2,4})$/);
 const name=explicit?clean(explicit):inlineName?inlineName[1]:titleFirst?titleFirst[2]:lines.find(l=>l!==company&&l!==title&&l!==address&&!/[@\d:：/]|電話|傳真|地址|手機|聯絡|網站|www\./i.test(l)&&(/^[\u3400-\u9fff]{2,4}$/.test(l)||/^[A-Za-z]+(?:[ .'-]+[A-Za-z]+){1,3}$/.test(l)))||'';
 if(inlineName)title=inlineName[2];
 if(titleFirst)title=titleFirst[1];
 let category='';if(/政府|公所|[局處]$/.test(company))category='政府機關';else if(/研究|大學|學院|university|institute/i.test(company))category='學術研究';else if(/事務所|顧問/.test(company))category='專業服務';else if(/公司|corporation|\b(?:inc|ltd)\b/i.test(company))category='產業夥伴';
 return {name,company:clean(company),title:clean(title),phone:[...new Set(phones)].join(' / '),email,address:clean(address),category};
}
let loading;
function loadEngine(){if(globalThis.Tesseract)return Promise.resolve(globalThis.Tesseract);if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('./vendor/ocr/tesseract.min.js',import.meta.url).href;script.onload=()=>resolve(globalThis.Tesseract);script.onerror=()=>{script.remove();loading=null;reject(Error('辨識元件下載失敗，請確認網路後重試。'));};document.head.append(script);});return loading;}
export function candidateScore(candidate) {
 const fields = extractFields(candidate.text || '');
 const populated = ['name', 'company', 'title', 'phone', 'email', 'address'].filter(key => fields[key]).length;
 // Engine confidence is a ranking signal, not a measured accuracy percentage.
 return Math.max(0, Math.min(100, candidate.confidence || 0)) + populated * 3;
}
export function chooseRecognition(candidates) {
 return [...candidates].sort((a, b) => candidateScore(b) - candidateScore(a))[0];
}
export async function recognizeCard(image, onProgress = () => {}) {
 const engine = await loadEngine();
 onProgress({ status: 'preprocessing', progress: 0 });
 const prepared = await preparePhoto(image);
 let worker;
 try {
  worker = await engine.createWorker(['chi_tra', 'eng'], 1, {
   workerPath: new URL('./vendor/ocr/worker.min.js', import.meta.url).href,
   corePath: new URL('./vendor/ocr/tesseract-core-lstm.wasm.js', import.meta.url).href,
   langPath: new URL('./ocr-data/', import.meta.url).href,
   // Prevent an older, lower precision model in IndexedDB from surviving the upgrade.
   cachePath: 'namecard-tessdata-best-4.1.0',
   logger: message => onProgress(message)
  });
  await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' });
  onProgress({ status: 'pass-sparse', progress: 0 });
  const first = (await worker.recognize(prepared.enhanced)).data;
  await worker.setParameters({ tessedit_pageseg_mode: '3' });
  onProgress({ status: 'pass-layout', progress: 0 });
  const second = (await worker.recognize(prepared.color)).data;
  const best = chooseRecognition([first, second]);
  return { text: best.text, confidence: best.confidence, alternatives: [first.text, second.text].filter((text, i, all) => text !== best.text && all.indexOf(text) === i) };
 } finally {
  if (worker) await worker.terminate();
 }
}
