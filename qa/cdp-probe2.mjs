/* 探测活动 2 的排序卡片结构 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
const BASE='http://127.0.0.1:8099';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const P='/tmp/cpplab-qa-p2'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
rmSync(P,{recursive:true,force:true});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--mute-audio','--remote-debugging-port=9336',`--user-data-dir=${P}`,'--window-size=1440,1000','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60;i++){ try{ const l=await (await fetch('http://127.0.0.1:9336/json/list')).json(); const p=l.find(t=>t.type==='page'); if(p){wsUrl=p.webSocketDebuggerUrl;break;} }catch{} await sleep(250); }
const ws=new WebSocket(wsUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>new Promise(r=>{const n=++id;pend.set(n,r);ws.send(JSON.stringify({id:n,method:m,params:p}));});
const js=async x=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.exception?.description}; return r.result?.result?.value;};
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate',{url:`${BASE}/index.html`}); await sleep(2600);

await js(`(()=>{const t=[...document.querySelectorAll('button,.card,a')].find(e=>/机器人能量站/.test(e.textContent||''));if(t)t.click();})()`);
await sleep(1500);
// 活动1
await js(`(()=>{const c=[...document.querySelectorAll('.chip')].find(e=>/只保存现在的值|盖掉/.test(e.textContent||'')); if(c)c.click();})()`);
await sleep(1000);
await js(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>/下一个任务/.test(e.textContent||'')); if(b)b.click();})()`);
await sleep(1800);

console.log('=== 活动 2 引擎侧的正确顺序 ===');
console.log(await js(`(()=>{
  try{
    const L = CppLab.content.lesson1;
    const acts = L.activities || L.tasks || [];
    const a = acts[1];
    const v = a.variants ? (a.variants.A || a.variants.S) : a;
    const it = v.interaction || v;
    return JSON.stringify({ id:a.id, type:a.type||v.type, correctOrder: it.correctOrder, items:(it.items||it.cards||[]).map(x=>({id:x.id,label:(x.label||x.text||'').slice(0,22)})) },null,1);
  }catch(e){ return 'ERR '+e.message; }
})()`));

console.log('\n=== 活动 2 DOM 里的卡片 ===');
console.log(await js(`(()=>{
  const norm=s=>(s||'').replace(/\\s+/g,' ').trim();
  const rows=[...document.querySelectorAll('li,.order-item,.card-row,.seq-item')].filter(e=>e.offsetParent&&/⬆|上移|⬇/.test(e.textContent||''));
  return JSON.stringify(rows.map((r,i)=>({
    i, tag:r.tagName, cls:r.className,
    text: norm(r.textContent).slice(0,44),
    data: Object.assign({}, r.dataset),
    ups: [...r.querySelectorAll('button')].map(b=>norm(b.textContent))
  })),null,1);
})()`));
ws.close(); chrome.kill(); process.exit(0);
