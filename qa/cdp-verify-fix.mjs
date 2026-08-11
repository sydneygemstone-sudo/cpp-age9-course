/* 精准验证两件事（不依赖其他 QA 脚本的逻辑）：
   1) 活动 7「先保存、后验证」之后，「下一个任务！」按钮是否仍在（今天修的洞）
   2) 活动 8 完成后，「🏅 去领我的徽章！」是否出现、课末页是否能进
   做法：直接注入"前 6 关已完成"的会话，让引擎停在活动 7，省去前面的点击。 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8099';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = '/tmp/cpplab-verify-fix';
const sleep = ms => new Promise(r => setTimeout(r, ms));

rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--remote-debugging-port=9340', `--user-data-dir=${PROFILE}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try { const l = await (await fetch('http://127.0.0.1:9340/json/list')).json();
        const p = l.find(t => t.type === 'page'); if (p) { wsUrl = p.webSocketDebuggerUrl; break; } } catch { }
  await sleep(250);
}
if (!wsUrl) { console.error('!! DevTools 没起来'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (m, p = {}) => new Promise(r => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const js = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description?.split('\n')[0] };
  return r.result?.result?.value; };
await send('Page.enable'); await send('Runtime.enable');
const errs = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0]); });

let pass = 0, fail = 0;
const chk = (n, c, extra) => { c ? (pass++, console.log('✅ ' + n + (extra ? '  ' + extra : '')))
                                 : (fail++, console.log('❌ ' + n + (extra ? '  << ' + extra : ''))); };

await send('Page.navigate', { url: `${BASE}/index.html` });
await sleep(2500);

/* 注入"前 6 关已完成"，刷新后引擎应停在活动 7 */
await js(`(()=>{
  const K='cpplab_session_v1';
  const s=JSON.parse(localStorage.getItem(K)||'{}');
  s.lessons=s.lessons||{}; s.lessons.lesson1=s.lessons.lesson1||{completed:false,activityStates:{}};
  const ids=['lesson1-01-return-world','lesson1-02-command-queue','lesson1-03-energy-box',
             'lesson1-04-code-xray','lesson1-05-reach-ten','lesson1-06-real-cpp'];
  ids.forEach(i=>{ s.lessons.lesson1.activityStates[i]={status:'done',outcome:2,attempts:1}; });
  localStorage.setItem(K, JSON.stringify(s));
  return Object.keys(s.lessons.lesson1.activityStates).length;
})()`);
await send('Page.navigate', { url: `${BASE}/index.html` });
await sleep(2200);
await js(`(()=>{const t=[...document.querySelectorAll('button,.card,a')].find(e=>/机器人能量站|继续我的任务/.test(e.textContent||''));if(t)t.click();})()`);
await sleep(2000);

const B = `(()=>{const n=s=>(s||'').replace(/\\s+/g,' ').trim();
  return [...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>n(b.textContent));})()`;
const title = await js(`(()=>{const h=document.querySelector('.task-title,h1,h2');return h?h.textContent.replace(/\\s+/g,' ').trim():'';})()`);
console.log('停在：', title);
chk('引擎停在活动 7「我的改造」', /我的改造/.test(String(title)), String(title));

/* 组装作品：皮肤 + 出发能量 2 + 事件 +4 / -1 / ×2 = 10 */
await js(`(async()=>{
  const n=s=>(s||'').replace(/\\s+/g,' ').trim();
  const vis=sel=>[...document.querySelectorAll(sel)].filter(e=>e.offsetParent);
  const pick=re=>{const b=vis('button').find(x=>re.test(n(x.textContent))); if(b){b.click();return true;} return false;};
  pick(/蓝色圆滚滚/); await new Promise(r=>setTimeout(r,300));
  pick(/^2$/);        await new Promise(r=>setTimeout(r,300));
  pick(/能量豆/);      await new Promise(r=>setTimeout(r,300));
  pick(/探照灯/);      await new Promise(r=>setTimeout(r,300));
  pick(/太阳能加倍/);  await new Promise(r=>setTimeout(r,300));
  const ta=vis('textarea')[0]||vis('input[type=text]').find(i=>/解释|一句话/.test(i.placeholder||''));
  if(ta){ta.focus();ta.value='从 2 出发，先加 4、再减 1，最后乘 2，正好是 10。';ta.dispatchEvent(new Event('input',{bubbles:true}));}
})()`);
await sleep(900);

/* 先保存 */
await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/保存我的作品卡/.test(x.textContent||''));if(b)b.click();})()`);
await sleep(1500);
const afterSave = await js(B);
chk('保存后出现「下一个任务！」', afterSave.some(t => /下一个任务/.test(t)), JSON.stringify(afterSave.filter(t=>/下一个|徽章/.test(t))));

/* 再验证（这一步以前会把上面那个按钮擦掉） */
await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/真实C\\+\\+验证/.test(x.textContent||''));if(b)b.click();})()`);
await sleep(10000);
const afterVerify = await js(B);
const fb = await js(`(()=>{const f=document.getElementById('feedback-area');return f?f.textContent.replace(/\\s+/g,' ').trim().slice(0,80):'';})()`);
console.log('验证后反馈：', fb);
chk('★ 验证后「下一个任务！」仍在（今天修的洞）',
    afterVerify.some(t => /下一个任务/.test(t)),
    JSON.stringify(afterVerify.filter(t=>/下一个|徽章/.test(t))));
const card = await js(`(()=>{const s=JSON.parse(localStorage.getItem('cpplab_session_v1')||'{}');const c=s.lessons?.lesson1?.artifactCard;return c?JSON.stringify({finalEnergy:c.finalEnergy,verified:c.verified,events:(c.events||[]).length}):'null';})()`);
console.log('作品卡：', card);
chk('作品卡最终能量 10 且已盖章', /"finalEnergy":10/.test(String(card)) && /"verified":true/.test(String(card)), String(card));

/* 进活动 8 并完成 */
await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/下一个任务/.test(x.textContent||''));if(b)b.click();})()`);
await sleep(1800);
const t8 = await js(`(()=>{const h=document.querySelector('.task-title,h1,h2');return h?h.textContent.replace(/\\s+/g,' ').trim():'';})()`);
chk('能进入活动 8', /讲给机器人听|讲明白/.test(String(t8)) || /任务 8/.test(await js(`document.body.innerText.slice(0,200)`)), String(t8));

await js(`(()=>{
  const vis=sel=>[...document.querySelectorAll(sel)].filter(e=>e.offsetParent);
  const ta=vis('textarea')[0];
  if(ta){ta.focus();ta.value='第二行先读盒子里的旧能量，再算出新的数，最后把新数装回盒子；shield 只被看了一眼，没被改。';ta.dispatchEvent(new Event('input',{bubbles:true}));}
  const b=vis('button').find(x=>/我讲完啦/.test(x.textContent||''));if(b)b.click();
})()`);
await sleep(2000);
const after8 = await js(B);
console.log('活动 8 完成后按钮：', JSON.stringify(after8.filter(t=>/徽章|下一个|完啦/.test(t))));
chk('★ 活动 8 完成后出现「🏅 去领我的徽章！」', after8.some(t => /去领我的徽章/.test(t)), JSON.stringify(after8.slice(-5)));

await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/去领我的徽章/.test(x.textContent||''));if(b)b.click();})()`);
await sleep(1800);
const endPage = await js(`document.body.innerText.replace(/\\s+/g,' ').slice(0,120)`);
console.log('课末页：', endPage);
chk('能进课末徽章页', /探险完成|今天我学会|徽章/.test(String(endPage)), String(endPage).slice(0,60));

const real = [...new Set(errs.filter(e => e && !/favicon|ERR_/.test(e)))];
console.log('\n页面异常：', real.length ? real.join(' | ') : '无');
console.log(`\n===== ${pass} 通过 / ${fail} 失败 =====`);
ws.close(); chrome.kill();
process.exit(fail ? 1 : 0);
