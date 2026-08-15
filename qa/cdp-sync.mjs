/* 同步链路 QA：证明「课堂进度回写服务器」端到端成立（或复现断链）。
   用法: node qa/cdp-sync.mjs
   前提: 服务器已起（默认 http://127.0.0.1:8101，可用 CPPLAB_SYNC_BASE 覆盖），
         种子为「trial 已完成 / lesson1 未完成」的课堂态。

   与 cdp-lesson1-theater.mjs 的分工：那份验剧场交互闭环（只读 localStorage），
   这份专门验 student 页 → PUT /api/state → latest.json 这条同步链：
     A) 页面加载后初始 PUT（version 至少 +1）
     B) 完成一个活动后进度 PUT（version 再 +1，且服务器侧 session 里出现 activityStates）
   两级失败分开报：本地没落库（引擎/完成路径问题） vs 本地落库但服务器没收到（同步问题）。
*/
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const BASE = process.env.CPPLAB_SYNC_BASE || 'http://127.0.0.1:8101';
const CHROME = process.env.CPPLAB_QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = '/tmp/cpplab-qa-sync';
const DEBUG_PORT = 9337;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const apiState = async () => {
  const r = await (await fetch(`${BASE}/api/state`)).json();
  const l1 = (r.session && r.session.lessons && r.session.lessons.lesson1) || {};
  return {
    version: r.version,
    l1States: Object.keys(l1.activityStates || {}).length,
    l1Done: !!l1.completed
  };
};

rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,1000', 'about:blank'
], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch { } };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    const p = list.find(t => t.type === 'page');
    if (p) wsUrl = p.webSocketDebuggerUrl;
  } catch { }
  if (!wsUrl) await sleep(250);
}
if (!wsUrl) { console.error('!! DevTools 没起来'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (m, p = {}) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const js = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description || 'exception' };
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
const pageErrors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') {
    pageErrors.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0] || 'exception');
  }
});

const HELPERS = `
window.__qa = {
  vis(sel){
    return [...document.querySelectorAll(sel)].filter(e => {
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      if (r.left >= window.innerWidth - 1) return false;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return true;
    });
  },
  txt: e => (e.textContent||'').replace(/\\s+/g,' ').trim(),
  btn(re){ return this.vis('button').find(b => re.test(this.txt(b)) && !b.disabled) || null; },
  click(re){ const b=this.btn(re); if(b){ b.click(); return this.txt(b);} return null; },
  cta(){ const c=this.vis('.cta-main')[0]; return c||null; },
  ctaText(){ const c=this.cta(); return c?this.txt(c):null; },
  kicker(){ return this.txt(document.querySelector('.ah-kicker')||{textContent:''}); },
  localState(){
    const s = JSON.parse(localStorage.getItem('cpplab_session_v1')||'{}');
    const st = (s.lessons&&s.lessons.lesson1&&s.lessons.lesson1.activityStates)||{};
    return { localDone: Object.keys(st).length, lastVisited: s.lastVisited||null };
  },
  syncStatus(){ try { return JSON.stringify((window.CppLab&&CppLab.Sync&&CppLab.Sync.status())||null); } catch(e){ return 'ERR:'+e.message; } },
  async order(wantSrcList){
    const WANT = wantSrcList.map(s=>new RegExp(s));
    const rows = () => this.vis('li.order-item');
    for(let target=0; target<WANT.length; target++){
      for(let guard=0; guard<12; guard++){
        const rs = rows();
        if(!rs.length) return 'NO_ROWS';
        const at = rs.findIndex(r => WANT[target].test(this.txt(r)));
        if(at < 0) return 'CARD_NOT_FOUND@'+target;
        if(at === target) break;
        const up = [...rs[at].querySelectorAll('button')].find(b=>/上移/.test(this.txt(b)));
        if(!up) return 'NO_UP_BTN';
        up.click();
        await new Promise(r=>setTimeout(r,240));
      }
    }
    const chkBtn = this.btn(/检查顺序/);
    if(!chkBtn) return 'NO_CHECK_BTN';
    chkBtn.click();
    return 'CHECKED';
  }
};
'ok'`;

const R = {};
const log = (k, v) => { R[k] = v; console.log(k.padEnd(28), '=', v); };

/* ---------- A. 加载即初始 PUT ---------- */
const before = await apiState();
log('server_before', JSON.stringify(before));

await send('Page.navigate', { url: `${BASE}/index.html` });
await sleep(3000);            // boot + 种子采纳 + PUT 防抖 1s + 余量
await js(HELPERS);
log('page_sync_status', await js(`__qa.syncStatus()`));
log('page_local', JSON.stringify(await js(`__qa.localState()`)));

const afterLoad = await apiState();
log('server_after_load', JSON.stringify(afterLoad));

/* ---------- B. 完成一个活动 → 进度 PUT ---------- */
await js(`(()=>{const t=[...document.querySelectorAll('button,.card,a')].find(e=>/机器人能量站/.test(e.textContent||''));if(t)t.click();})()`);
await sleep(1600);
await js(`__qa.click(/开始探险/)`);
await sleep(1400);
log('kicker', await js(`__qa.kicker()`));

// 登机仪式（A 档）：choice 预测 → 5 步排序 → 检查顺序
const predict = await js(`(()=>{
  const panel = document.getElementById('predict-panel');
  if(!panel) return 'NO_PREDICT_PANEL';
  const chip = [...panel.querySelectorAll('button.chip')].find(b=>/它是一个地址/.test(__qa.txt(b)));
  if(!chip) return 'NO_ADDRESS_CHIP';
  chip.click(); return 'clicked';
})()`);
log('boarding_predict', predict);
await sleep(900);
const ordered = await js(`__qa.order(['电源键','登录自己的账户','Wi-Fi','Dock','地址栏'])`);
log('boarding_order', ordered);
await sleep(2200);            // playSequenceDemo + 完成落库
const localAfterComplete = await js(`__qa.localState()`);
log('local_after_complete', JSON.stringify(localAfterComplete));

// 给同步留时间：轮询 2s + 防抖 1s + 网络余量
let afterComplete = null;
for (let i = 0; i < 10; i++) {
  await sleep(1000);
  afterComplete = await apiState();
  if (afterComplete.version > afterLoad.version && afterComplete.l1States > 0) break;
}
log('server_after_complete', JSON.stringify(afterComplete));
log('page_errors', pageErrors.length ? pageErrors.slice(0, 5).join(' | ') : '(none)');

/* ---------- 判定 ---------- */
const loadPut = afterLoad.version > before.version;
const localPersisted = !!(localAfterComplete && localAfterComplete.localDone >= 1);
const progressPut = afterComplete.version > afterLoad.version && afterComplete.l1States > 0;

console.log('');
console.log(`[A] 页面加载初始 PUT        : ${loadPut ? '✅ version ' + before.version + '→' + afterLoad.version : '❌ version 停 ' + before.version}`);
console.log(`[B] 完成活动本地落库        : ${localPersisted ? '✅ localDone=' + localAfterComplete.localDone : '❌ localStorage 无 activityStates'}`);
console.log(`[C] 完成活动进度回写服务器  : ${progressPut ? '✅ version ' + afterLoad.version + '→' + afterComplete.version + ', l1States=' + afterComplete.l1States : '❌ version 停 ' + afterLoad.version + ', l1States=' + afterComplete.l1States}`);
console.log('');
console.log('SUMMARY ' + JSON.stringify({ before, afterLoad, afterComplete, loadPut, localPersisted, progressPut }));

ws.close();
chrome.kill();
process.exit(loadPut && localPersisted && progressPut ? 0 : 1);
