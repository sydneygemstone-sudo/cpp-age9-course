/* 探测第 1 课各活动的真实 DOM 交互元素（A 档）。
   用法: node qa/cdp-probe.mjs [起始活动序号]
   前提: 课件服务器已在 8099 跑着（node server/server.js --port 8099 --seed server/seed.json）
   手法沿用 ai-shimo-keeper-course/qa/harness/cdp-qa.mjs：CDP 真实时间驱动，
   不用 --virtual-time-budget --dump-dom（那条路会挂住）。 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8099';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = '/tmp/cpplab-qa-profile';
const sleep = ms => new Promise(r => setTimeout(r, ms));

rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--remote-debugging-port=9334', `--user-data-dir=${PROFILE}`,
  '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:9334/json/list')).json();
    const page = list.find(t => t.type === 'page');
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch { }
  await sleep(250);
}
if (!wsUrl) { console.error('!! DevTools 没起来'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise(res => {
  const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params }));
});
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description || 'exception' };
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
const errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description || 'exception');
  }
});

await send('Page.navigate', { url: `${BASE}/index.html` });
await sleep(2500);

/* 首页 → 进第 1 课 */
console.log('=== 首页 ===');
console.log(await evalJS(`(()=>{
  const s = JSON.parse(localStorage.getItem('cpplab_session_v1')||'{}');
  return JSON.stringify({昵称:s.nickname, 档位:s.path, 主题:s.theme, 试听:s.lessons?.trial?.completed});
})()`));

const entered = await evalJS(`(()=>{
  const cards=[...document.querySelectorAll('button,.card,[role=button],a')];
  const t=cards.find(e=>/机器人能量站/.test(e.textContent||''));
  if(!t) return 'NOT_FOUND';
  t.click(); return 'CLICKED';
})()`);
console.log('进入第 1 课:', entered);
await sleep(1800);

/* 逐活动 dump 结构 */
const start = parseInt(process.argv[2] || '1', 10);
for (let n = start; n <= 8; n++) {
  const info = await evalJS(`(()=>{
    const norm = s => (s||'').replace(/\\s+/g,' ').trim().slice(0,60);
    const btns = [...document.querySelectorAll('button')]
      .filter(b=>b.offsetParent!==null)
      .map(b=>({t:norm(b.textContent), cls:b.className, dis:b.disabled}));
    const h = document.querySelector('h1,h2,.task-title');
    const panels = [...document.querySelectorAll('.card,.panel')]
      .map(p=>norm(p.querySelector('h2,h3,.card-title')?.textContent)).filter(Boolean);
    const inputs = [...document.querySelectorAll('input,textarea')]
      .filter(i=>i.offsetParent!==null)
      .map(i=>({type:i.type||'textarea', ph:norm(i.placeholder)}));
    const s = JSON.parse(localStorage.getItem('cpplab_session_v1')||'{}');
    const st = s.lessons?.lesson1?.activityStates||{};
    return JSON.stringify({
      标题: norm(h?.textContent),
      面板: panels.slice(0,6),
      按钮: btns,
      输入框: inputs,
      已完成活动数: Object.values(st).filter(x=>x&&(x.status==='done'||x.state==='done')).length
    }, null, 1);
  })()`);
  console.log(`\n===== 活动 ${n} =====`);
  console.log(info);
  break; // 先只看当前这一屏
}

if (errors.length) console.log('\n=== 页面异常 ===\n' + errors.join('\n'));
ws.close(); chrome.kill();
process.exit(0);
