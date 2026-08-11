/* 第 1 课 A 档闭环 QA：CDP 真实点击走完 8 个活动。
   用法: node qa/cdp-lesson1.mjs [--shots] [-o qa/报告.md]
   前提: 服务器在 8099 跑着，种子是 A 档 / 机器人世界。

   重点验证两条今天改过的教案顺序（周六老师会照着念）：
     · 活动 2：预测排在「检查顺序」之前 —— 反过来预测会被拒
     · 活动 7：先保存、后验证 —— 反过来验证印章会被覆盖掉

   手法沿用 ai-shimo-keeper-course/qa/harness/cdp-qa.mjs（CDP 真实时间，
   不用 --virtual-time-budget --dump-dom，那条路会挂住）。 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { format } from 'node:util';

const BASE = 'http://127.0.0.1:8099';
const CHROME = process.env.CPPLAB_QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = '/tmp/cpplab-qa-l1';
const SHOTS = process.argv.includes('--shots');
const outputArg = process.argv.findIndex(a => a === '-o' || a === '--output');
if (outputArg >= 0 && !process.argv[outputArg + 1]) throw new Error('-o/--output 缺少报告路径');
const REPORT_FILE = outputArg >= 0 ? resolve(process.cwd(), process.argv[outputArg + 1]) : null;
const QA_ROOT = resolve(process.cwd(), 'qa');
if (REPORT_FILE && REPORT_FILE !== QA_ROOT && !REPORT_FILE.startsWith(QA_ROOT + sep)) {
  throw new Error('报告必须写在 qa/ 目录下（硬性修改边界）');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const runOutput = [];
const nativeLog = console.log.bind(console);
console.log = (...args) => {
  runOutput.push(format(...args));
  nativeLog(...args);
};

const activityRows = [];
const activityNames = {
  1: '回到任务世界', 2: '命令排队', 3: '能量盒', 4: '代码透视镜',
  5: '正好到 10', 6: '真实 C++', 7: '我的改造', 8: '讲给机器人听'
};
const activityStart = () => Date.now();
const recordActivity = (number, interactions, state, startedAt) => {
  activityRows.push({
    number, name: activityNames[number], interactions, state,
    elapsedMs: Date.now() - startedAt
  });
};

rmSync(PROFILE, { recursive: true, force: true });
const chromeArgs = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--remote-debugging-port=9335', `--user-data-dir=${PROFILE}`,
  '--window-size=1440,1000', 'about:blank',
];
if (process.env.CPPLAB_QA_SINGLE_PROCESS === '1') chromeArgs.unshift('--single-process', '--no-zygote');
const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:9335/json/list')).json();
    const p = list.find(t => t.type === 'page');
    if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
  } catch { }
  await sleep(250);
}
if (!wsUrl) { console.error('!! DevTools 没起来'); chrome.kill(); process.exit(1); }

let browserVersion = 'unknown';
try {
  const versionInfo = await (await fetch('http://127.0.0.1:9335/json/version')).json();
  browserVersion = versionInfo.Browser || browserVersion;
} catch { /* 后续 CDP 连接仍会给出确定失败 */ }

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

/* ---------- 页面内工具（注入一次，后续直接调用） ---------- */
const HELPERS = `
window.__qa = {
  vis: sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null),
  txt: e => (e.textContent||'').replace(/\\s+/g,' ').trim(),
  btn(re){ return this.vis('button').find(b => re.test(this.txt(b)) && !b.disabled) || null; },
  click(re){ const b=this.btn(re); if(b){ b.click(); return this.txt(b);} return null; },
  state(){
    const s = JSON.parse(localStorage.getItem('cpplab_session_v1')||'{}');
    const st = s.lessons?.lesson1?.activityStates||{};
    const done = Object.keys(st).filter(k=>{const v=st[k];return v&&(v.status==='done'||v.state==='done');});
    return { doneIds: done, doneCount: done.length,
             card: s.lessons?.lesson1?.artifactCard||null,
             finalEnergy: s.lessons?.lesson1?.finalEnergy, path: s.path };
  },
  title(){ const h=document.querySelector('.task-title,h1,h2'); return h?this.txt(h):''; },
  // 从引擎读当前活动的正确答案（QA 用，孩子端不受影响）
  answers(){
    try{
      const E = window.CppLab; if(!E) return null;
      return null;
    }catch(e){ return null; }
  }
};
'ok'`;

const R = { steps: [], pass: 0, fail: 0 };
const chk = (name, ok, extra) => {
  R[ok ? 'pass' : 'fail']++;
  R.steps.push(`${ok ? '✅' : '❌'} ${name}${extra ? '  << ' + extra : ''}`);
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  << ' + extra : ''}`);
};
let activity7BlockDom = null;
let activity8Dom = null;
let transitionBlocked = false;
let finalCard = null;

console.log('QA 浏览器:', CHROME);
console.log('CDP 浏览器版本:', browserVersion);
console.log('QA 地址:', BASE);
await send('Page.navigate', { url: `${BASE}/index.html` });
await sleep(2600);
await js(HELPERS);

const seed = await js(`JSON.stringify(__qa.state())`);
console.log('起点:', seed);
chk('种子是 A 档', /"path":"A"/.test(seed), seed);

/* 进第 1 课 */
await js(`(()=>{const t=[...document.querySelectorAll('button,.card,a')].find(e=>/机器人能量站/.test(e.textContent||''));if(t)t.click();})()`);
await sleep(1600);
chk('进入第 1 课', /返回任务世界/.test(await js(`__qa.title()`)), await js(`__qa.title()`));

/* ---------- 活动 1：选择题（A 档：盒子只记现在的值） ---------- */
let actStarted = activityStart();
await js(`(()=>{const c=__qa.vis('.chip').find(e=>/只保存现在的值|旧的值会被新的值盖掉/.test(__qa.txt(e))); if(c)c.click();})()`);
await sleep(1200);
let st = await js(`__qa.state()`);
chk('活动 1 完成', st.doneCount >= 1, JSON.stringify(st.doneIds));
recordActivity(1, '点击“只保存现在的值/旧值会被新值盖掉”选项', `done=${st.doneCount}/8`, actStarted);
await js(`__qa.click(/下一个任务/)`); await sleep(1500);

/* ---------- 活动 2：教案改后的顺序 = 先预测、再排序 ---------- */
actStarted = activityStart();
console.log('\n--- 活动 2（验证：预测必须排在检查顺序之前）---');
const predBefore = await js(`(()=>{
  const inp = __qa.vis('input').find(i=>/数字|猜/.test(i.placeholder||'')) || __qa.vis('input[type=number],input[type=text]')[0];
  if(inp){ inp.focus(); inp.value='2'; inp.dispatchEvent(new Event('input',{bubbles:true})); }
  const b = __qa.btn(/就猜这个|确定|提交/);
  if(b){ b.click(); return 'submitted:'+__qa.txt(b); }
  const chip = __qa.vis('.chip')[0];
  if(chip){ chip.click(); return 'chip:'+__qa.txt(chip); }
  return 'NO_PREDICT_UI';
})()`);
console.log('   先提交预测 →', predBefore);
await sleep(900);
chk('排序前能提交预测（教案新顺序成立）', predBefore !== 'NO_PREDICT_UI' && !String(predBefore).includes('__err'), String(predBefore));

/* 排序：按正确顺序做选择排序（建立能量盒 → 能量豆+4 → 探照灯-1 → 报告） */
const ordered = await js(`(async()=>{
  const WANT = [/建立能量盒/, /能量豆/, /探照灯/, /报告/];
  const rows = () => __qa.vis('li.order-item');
  for(let target=0; target<WANT.length; target++){
    for(let guard=0; guard<8; guard++){
      const rs = rows();
      if(!rs.length) return 'NO_ROWS';
      const at = rs.findIndex(r => WANT[target].test(__qa.txt(r)));
      if(at < 0) return 'CARD_NOT_FOUND@'+target;
      if(at === target) break;
      const up = [...rs[at].querySelectorAll('button')].find(b=>/上移/.test(__qa.txt(b)));
      if(!up) return 'NO_UP_BTN';
      up.click();
      await new Promise(r=>setTimeout(r,240));
    }
  }
  const order = rows().map(r=>__qa.txt(r).slice(0,14));
  const chk = __qa.btn(/检查顺序/);
  if(!chk) return 'NO_CHECK_BTN | ' + order.join(' > ');
  chk.click();
  await new Promise(r=>setTimeout(r,900));
  const s = JSON.parse(localStorage.getItem('cpplab_session_v1')||'{}');
  const stt = s.lessons?.lesson1?.activityStates||{};
  const done = Object.keys(stt).some(k=>/lesson1-02/.test(k) && (stt[k].status==='done'||stt[k].state==='done'));
  return (done?'DONE':'NOT_DONE') + ' | ' + order.join(' > ');
})()`);
console.log('   排序 →', ordered);
st = await js(`__qa.state()`);
chk('活动 2 完成', st.doneCount >= 2, `${ordered} / done=${st.doneCount}`);
recordActivity(2, '输入预测 2 → 提交 → 用“上移”排成建立盒子/+4/-1/报告 → 检查顺序', `done=${st.doneCount}/8；${ordered}`, actStarted);
await js(`__qa.click(/下一个任务/)`); await sleep(1500);

/* ---------- 活动 3–6：通用推进（预测 → 运行/单步 → 答检查点） ---------- */
for (const n of [3, 4, 5, 6]) {
  actStarted = activityStart();
  console.log(`\n--- 活动 ${n} ---`);
  const before = (await js(`__qa.state()`)).doneCount;
  const trace = await js(`(async()=>{
    const log=[];
    for(let i=0;i<60;i++){
      // 0) 预测面板默认是收起的，要先点底部的「🤔 先预测」把它展开
      const openPredict = __qa.btn(/先预测/);
      if(openPredict && !__qa.btn(/就猜这个/)){
        openPredict.click(); log.push('open-predict');
        await new Promise(r=>setTimeout(r,450)); continue;
      }
      // 1) 预测面板
      const inp = __qa.vis('input').find(x=>/数字|猜/.test(x.placeholder||'')) || __qa.vis('input[type=number],input[type=text]')[0];
      const gb  = __qa.btn(/就猜这个/);
      if(gb){
        if(inp){ inp.focus(); inp.value=String([0,0,0,5,2,8,6][${n}]||'6'); inp.dispatchEvent(new Event('input',{bubbles:true})); }
        else { const c=__qa.vis('.chip')[0]; if(c) c.click(); }
        gb.click(); log.push('predict'); await new Promise(r=>setTimeout(r,500)); continue;
      }
      // 2) 检查点提问（选项或输入 + 回答）
      const ansBtn = __qa.btn(/^回答$|确定回答/);
      if(ansBtn){
        const ai = __qa.vis('input').find(x=>x.offsetParent);
        if(ai){ ai.focus(); ai.value='0'; ai.dispatchEvent(new Event('input',{bubbles:true})); }
        ansBtn.click(); log.push('answer'); await new Promise(r=>setTimeout(r,500)); continue;
      }
      const cps = __qa.vis('.chip');
      if(cps.length && !__qa.btn(/下一个任务/)){ cps[0].click(); log.push('chip'); await new Promise(r=>setTimeout(r,500)); continue; }
      // 3) 改槽位（活动 5）：A 档正解是把 boost（加速器/倍率）从 1 改成 2 → 正好 10
      if(${n}===5 && !__qa.btn(/下一个任务/) && !window.__qaSlotDone){
        const slots = __qa.vis('.chip,.slot-chip,.slot');
        const target = slots.find(x=>/加速|boost|倍率|快充/i.test(__qa.txt(x))) || slots.find(x=>/：|:/.test(__qa.txt(x)));
        if(target){
          log.push('slot:'+__qa.txt(target).slice(0,12));
          target.click(); await new Promise(r=>setTimeout(r,420));
          const si=__qa.vis('input')[0];
          if(si){ si.focus(); si.value='2'; si.dispatchEvent(new Event('input',{bubbles:true})); }
          const ok=__qa.btn(/改好了/);
          if(ok){ ok.click(); window.__qaSlotDone=true; log.push('slot-ok'); await new Promise(r=>setTimeout(r,600)); continue; }
        }
      }
      // 4) 单步 / 运行
      const step = __qa.btn(/单步/); const run = __qa.btn(/▶ 运行|^运行/);
      if(step){ step.click(); log.push('step'); await new Promise(r=>setTimeout(r,420)); continue; }
      if(run){ run.click(); log.push('run'); await new Promise(r=>setTimeout(r,900)); continue; }
      // 5) 完成？
      if(__qa.btn(/下一个任务|去领我的徽章/)) return log.join(',')+' => READY';
      await new Promise(r=>setTimeout(r,400));
    }
    return log.join(',')+' => TIMEOUT';
  })()`);
  console.log('   ', String(trace).slice(0, 160));
  st = await js(`__qa.state()`);
  if (st.doneCount === before) {
    // 卡住了：把现场 dump 出来，省一轮往返
    const scene = await js(`(()=>{
      const n=s=>(s||'').replace(/\\s+/g,' ').trim();
      return JSON.stringify({
        按钮: [...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>n(b.textContent).slice(0,22)),
        面板: [...document.querySelectorAll('.panel')].filter(p=>p.offsetParent).map(p=>n(p.querySelector('.panel-title')?.textContent)).filter(Boolean),
        互动区: n([...document.querySelectorAll('.panel')].filter(p=>p.offsetParent).map(p=>n(p.textContent)).find(t=>/调一调|先想|预测|真实|验证/.test(t))||'').slice(0,220),
        输入框: [...document.querySelectorAll('input')].filter(i=>i.offsetParent).map(i=>({ph:i.placeholder,v:i.value}))
      },null,1);
    })()`);
    console.log(`   [活动 ${n} 卡住现场]`, scene);
  }
  chk(`活动 ${n} 完成`, st.doneCount > before, `done=${st.doneCount} ${String(trace).slice(-40)}`);
  recordActivity(n, `预测 → 单步执行 → 回答检查点（轨迹：${trace}）`, `done=${st.doneCount}/8`, actStarted);
  await js(`__qa.click(/下一个任务/)`); await sleep(1500);
}

/* ---------- 活动 7：先保存、后验证（教案改后的顺序） ---------- */
actStarted = activityStart();
console.log('\n--- 活动 7（验证：先保存后验证，印章不被覆盖）---');
const buildSelection = await js(`(async()=>{
  const groups = __qa.vis('.build-group');
  const title = g => __qa.txt(g.querySelector('.bg-title') || g);
  const clicks = [];
  async function pick(groupRe, optionRe){
    const g = groups.find(x => groupRe.test(title(x)));
    if(!g) return 'NO_GROUP:'+groupRe;
    const b = [...g.querySelectorAll('button')].find(x => optionRe.test(__qa.txt(x)));
    if(!b) return 'NO_OPTION:'+optionRe;
    b.click(); clicks.push(__qa.txt(b));
    await new Promise(r=>setTimeout(r,300));
    return 'OK';
  }
  const results = [];
  results.push(await pick(/机器人伙伴/, /^蓝色圆滚滚$/));
  results.push(await pick(/出发能量/, /^2$/));
  // A 档参考解严格按执行顺序点击；乘法必须最后加入 events 数组。
  results.push(await pick(/故事事件/, /吃到能量豆/));
  results.push(await pick(/故事事件/, /打开探照灯/));
  results.push(await pick(/故事事件/, /太阳能加倍/));
  const exp = __qa.vis('input.text-input').find(i=>/作品卡|老师帮你打字/.test(i.placeholder||''));
  if(exp){
    exp.focus();
    exp.value='从 2 出发，先加 4、再减 1，最后乘 2，正好是 10。';
    exp.dispatchEvent(new Event('input',{bubbles:true}));
  }
  return JSON.stringify({
    results, clicks,
    selected: groups.map(g=>({group:title(g), values:[...g.querySelectorAll('.chip.selected')].map(__qa.txt)})),
    preview: __qa.txt(document.querySelector('.build-preview'))
  });
})()`);
console.log('   A 档选项 →', buildSelection);
chk('活动 7 真正选中 A 档参考解', !String(buildSelection).includes('NO_') && /最后的能量是 10 格/.test(String(buildSelection)), String(buildSelection));
await sleep(800);
const saveFirst = await js(`__qa.click(/保存我的作品卡/)`);
await sleep(1400);
let card = (await js(`__qa.state()`)).card;
chk('活动 7 先保存成功且尚未盖验证章', !!card && card.verified === false,
  saveFirst ? `点了「${saveFirst}」verified=${card && card.verified}` : '没找到保存按钮');
const savedEvents = card && Array.isArray(card.events) ? card.events : [];
const referenceCardOk = !!card && card.finalEnergy === 10 && savedEvents.length === 3 &&
  /能量豆/.test(savedEvents[0]) && /探照灯/.test(savedEvents[1]) && /太阳能加倍/.test(savedEvents[2]);
chk('活动 7 保存内容是 10 能量 / 3 事件 / 加倍最后', referenceCardOk,
  card ? JSON.stringify({ 最终能量: card.finalEnergy, 已验证: card.verified, 事件: savedEvents }) : 'card=null');
const nextBeforeVerify = await js(`(()=>{const b=__qa.btn(/下一个任务/);return b?__qa.txt(b):null;})()`);
console.log('   保存后下一关按钮 →', nextBeforeVerify || 'NO_NEXT_BUTTON');

const verifyClicked = await js(`__qa.click(/真实C\\+\\+验证我的故事|真实C\\+\\+验证/)`);
console.log('   点验证 →', verifyClicked);
await sleep(9000); // 真实编译要几秒
card = (await js(`__qa.state()`)).card;
if (card) {
  chk('验证后作品卡仍在且印章为 true', card.verified === true, `verified=${card.verified}`);
  finalCard = card;
  console.log('   作品卡:', JSON.stringify({ 最终能量: card.finalEnergy, 已验证: card.verified, 事件数: (card.events || []).length, 事件: card.events }));
} else {
  chk('验证后作品卡仍在', false, 'card=null');
}
activity7BlockDom = await js(`(()=>{
  const norm=s=>(s||'').replace(/\\s+/g,' ').trim();
  const visible=e=>e.offsetParent!==null;
  return JSON.stringify({
    当前任务:norm(document.querySelector('.ah-kicker')?.textContent),
    页面标题:norm(document.querySelector('.activity-head h2')?.textContent),
    反馈区:norm(document.querySelector('#feedback-area')?.textContent),
    可见按钮:[...document.querySelectorAll('button')].filter(visible).map(b=>norm(b.textContent)),
    下一个任务按钮数:[...document.querySelectorAll('button')].filter(b=>/下一个任务/.test(norm(b.textContent))).length
  },null,2);
})()`);
console.log('[活动 7→8 验证后真实 DOM dump]\n' + activity7BlockDom);
const nextAfterVerify = await js(`__qa.click(/下一个任务/)`);
console.log('   验证后点下一关 →', nextAfterVerify || 'NO_NEXT_BUTTON');
transitionBlocked = !nextAfterVerify;
chk('活动 7 保存→验证后仍有正常下一关路径（产品门禁）', !transitionBlocked,
  transitionBlocked ? '保存后曾出现，但验证反馈后 NO_NEXT_BUTTON' : `点了「${nextAfterVerify}」`);
let resumed = null;
if (!nextAfterVerify) {
  // 诊断恢复：保存后出现的「下一个任务」会被验证结果反馈覆盖。
  // 刷新后首页会按已完成状态提供「继续我的任务」，从第一个未完成活动恢复。
  console.log('   [恢复取证] 刷新并从「继续我的任务」进入第一个未完成活动');
  await send('Page.reload', { ignoreCache: true });
  await sleep(2800);
  await js(HELPERS);
  resumed = await js(`(()=>{
    const t=__qa.vis('button.home-card').find(e=>/继续我的任务/.test(__qa.txt(e))) ||
      __qa.vis('button.home-card').find(e=>/机器人能量站/.test(__qa.txt(e)));
    if(!t) return null;
    const label=__qa.txt(t); t.click(); return label;
  })()`);
  console.log('   [恢复取证] 点了 →', resumed || 'NO_RESUME_CARD');
}
await sleep(1800);
const activity8Entry = await js(`JSON.stringify({task:document.querySelector('.ah-kicker')?.textContent||'',title:document.querySelector('.activity-head h2')?.textContent||''})`);
chk('进入真实活动 8', /任务 8 \/ 8/.test(String(activity8Entry)) && /讲给机器人听/.test(String(activity8Entry)), String(activity8Entry));
recordActivity(7,
  '选蓝色圆滚滚 → 出发能量 2 → 依次选 +4、-1、×2 → 保存 → 真实 C++ 验证' +
    (transitionBlocked ? ' → 因产品丢失下一关按钮而刷新/继续恢复' : ' → 下一关'),
  `card=${finalCard ? `${finalCard.finalEnergy}/verified=${finalCard.verified}/events=${(finalCard.events || []).length}` : 'null'}；` +
    `transition=${transitionBlocked ? 'BLOCKED_THEN_RECOVERED' : 'OK'}`,
  actStarted);

/* ---------- 活动 8：讲解 ---------- */
actStarted = activityStart();
console.log('\n--- 活动 8 ---');
activity8Dom = await js(`(()=>{
  const norm = s => (s||'').replace(/\\s+/g,' ').trim();
  const visible = e => e.offsetParent !== null;
  const panels = [...document.querySelectorAll('.panel')].filter(visible);
  const talkPanel = panels.find(p => /讲明白/.test(norm(p.textContent)));
  return JSON.stringify({
    当前任务: norm(document.querySelector('.ah-kicker')?.textContent),
    页面标题: norm(document.querySelector('.activity-head h2')?.textContent),
    面板标题: panels.map(p => norm(p.querySelector('.panel-title,h2,h3')?.textContent)).filter(Boolean),
    可见按钮: [...document.querySelectorAll('button')].filter(visible).map(b => ({
      全文: norm(b.textContent), disabled: b.disabled, class: b.className
    })),
    输入控件: [...document.querySelectorAll('input,textarea')].filter(visible).map(el => ({
      tag: el.tagName.toLowerCase(), type: el.type || null,
      placeholder: el.placeholder || '', value: el.value || '', class: el.className
    })),
    讲明白面板HTML: talkPanel ? talkPanel.outerHTML : null
  }, null, 2);
})()`);
console.log('[活动 8 真实 DOM dump]\n' + activity8Dom);
const explainAction = await js(`(()=>{
  const panel=__qa.vis('.panel').find(p=>/讲明白/.test(__qa.txt(p)));
  const starter=panel ? [...panel.querySelectorAll('button.chip')].find(b=>/等号的右边先/.test(__qa.txt(b))) : null;
  if(starter) starter.click();
  const ta=panel ? panel.querySelector('textarea') : null;
  if(!ta) return 'NO_TEXTAREA';
  ta.focus();
  ta.value='等号的右边先读取 energy 和 shield，算出 shield × 2 后加到旧 energy；左边的 energy 盒子最后才写入新值。shield 只被读取，没有被改。energy += 2 和 energy = energy + 2 意思相同。';
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  return JSON.stringify({starter:starter?__qa.txt(starter):null,textarea:ta.value});
})()`);
console.log('   句子开头 + A 档解释 →', explainAction);
await sleep(600);
const explainDone = await js(`__qa.click(/我讲完啦/)`);
console.log('   提交讲解 →', explainDone || 'NO_DONE_BUTTON');
await sleep(1600);
st = await js(`__qa.state()`);
const badgeReady = await js(`(()=>{const b=__qa.btn(/去领我的徽章/);return b?__qa.txt(b):null;})()`);
chk('活动 8 完成', st.doneCount >= 8, `done=${st.doneCount}/${8}`);
chk('活动 8 完成按钮变为徽章按钮', /去领我的徽章/.test(String(badgeReady)), badgeReady || 'NO_BADGE_BUTTON');
chk('全 8 关闭环', st.doneCount >= 8, JSON.stringify(st.doneIds));
const badgeClicked = await js(`__qa.click(/去领我的徽章/)`);
await sleep(1000);
const endPage = await js(`document.querySelector('.end-page h1')?.textContent||''`);
chk('进入课末徽章页', /今天的探险完成啦/.test(String(endPage)), `${badgeClicked || 'NO_CLICK'} / ${endPage || 'NO_END_PAGE'}`);
recordActivity(8,
  'dump 真实 DOM → 点击“等号的右边先…”句子开头 → 输入 A 档双变量解释 → “我讲完啦” → “去领我的徽章”',
  `done=${st.doneCount}/8；badge=${badgeReady || 'missing'}；end=${endPage || 'missing'}`,
  actStarted);

const closeState = await js(`__qa.state()`);
if (closeState && closeState.card) finalCard = closeState.card;
console.log('\n===== A 档第 1 课逐活动结果 =====');
activityRows.forEach(row => {
  console.log(`${row.number}. ${row.name} / ${row.interactions} / ${row.state} / ${(row.elapsedMs / 1000).toFixed(2)} 秒`);
});
console.log('\n===== 8 关完成清单 =====');
(closeState.doneIds || []).forEach((activityId, index) => {
  console.log(`${index + 1}. ✅ ${activityId}`);
});
console.log('最终作品卡:', JSON.stringify(finalCard ? {
  标题: finalCard.title,
  皮肤: finalCard.skin,
  出发能量: finalCard.initialEnergy,
  事件: finalCard.events,
  最终能量: finalCard.finalEnergy,
  解释: finalCard.explanation,
  已验证: finalCard.verified
} : null));

if (SHOTS) {
  mkdirSync('/Users/gemstone/cpp-course/qa/shots', { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  if (r.result?.data) writeFileSync('/Users/gemstone/cpp-course/qa/shots/lesson1-end.png', Buffer.from(r.result.data, 'base64'));
}

console.log('\n===== 闭环 QA：' + R.pass + ' 通过 / ' + R.fail + ' 失败 =====');
const realErrors = pageErrors.filter(e => !/favicon|net::ERR_/.test(e));
if (realErrors.length) console.log('\n=== 页面抛出的异常 ===\n' + [...new Set(realErrors)].join('\n'));
else console.log('页面无未捕获异常。');

ws.close();
const gracefulExit = chrome.exitCode !== null
  ? Promise.resolve(true)
  : new Promise(resolveExit => chrome.once('exit', () => resolveExit(true)));
chrome.kill();
let chromeExited = await Promise.race([gracefulExit, sleep(3000).then(() => false)]);
if (!chromeExited) {
  const forcedExit = chrome.exitCode !== null
    ? Promise.resolve(true)
    : new Promise(resolveExit => chrome.once('exit', () => resolveExit(true)));
  chrome.kill('SIGKILL');
  chromeExited = await Promise.race([forcedExit, sleep(1000).then(() => false)]);
}
rmSync(PROFILE, { recursive: true, force: true });
const profileRemoved = !existsSync(PROFILE);
console.log(`浏览器清理：processExited=${chromeExited} profileRemoved=${profileRemoved}`);

if (REPORT_FILE) {
  const seconds = ms => (ms / 1000).toFixed(2) + ' 秒';
  const activityLines = activityRows.map(row =>
    `${row.number}. **${row.name}** / ${row.interactions} / ${row.state} / ${seconds(row.elapsedMs)}`
  ).join('\n');
  const doneLines = (closeState.doneIds || []).map((activityId, index) =>
    `${index + 1}. ✅ \`${activityId}\``
  ).join('\n');
  const conclusion = transitionBlocked
    ? '**(b) 产品/内容问题。** 活动 8 本身可完成；真正阻断发生在活动 7 的“先保存、后真实验证”路径：保存后原本存在的“下一个任务！”被验证结果反馈清空，孩子无法用正常页面交互进入活动 8。QA 通过刷新并点击“继续我的任务”做了显式恢复，才继续验证活动 8。'
    : '**(a) QA 脚本问题。** 当前产品正常路径保留了下一关按钮，脚本已按真实 DOM 修正选择器与等待。';
  const reportResult = transitionBlocked
    ? '不通过：产品正常路径存在严重阻断；恢复后状态达到 8/8'
    : (R.fail ? '不通过：仍有 QA 断言失败' : '通过：正常路径 8/8');
  const environmentNotes = process.env.CPPLAB_QA_SINGLE_PROCESS === '1'
    ? '- 本次 Codex 执行沙箱禁止 GUI Chrome 注册 macOS Mach 服务，因此实际取证使用 `/private/tmp` 下的 Chrome Headless Shell 145，并加 `--single-process --no-zygote`；脚本默认值仍是用户指定的 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。\n- 沙箱无权终止已有的 8099 服务器进程；每轮仍删除 `server/data`，并通过生产服务器自带的 `/api/reset` + `/api/state` 重新注入 `server/seed.json`。脚本起点再次断言 `path=A, done=0, card=null`，避免残留进度。'
    : '- 使用用户指定的 Google Chrome 与重启后的 8099 服务器。';
  const baselineExcerpt = [
    '✅ 活动 7 先保存成功  << 点了「💾 保存我的作品卡」card=true',
    '✅ 验证后作品卡仍在  << verified=true',
    '作品卡: {"最终能量":2,"已验证":true,"事件数":0}',
    '❌ 活动 8 完成  << done=7/8'
  ].join('\n');
  const report = `# A 档第 1 课闭环 QA 报告

- 结果：${reportResult}
- 档位 / 主题：A 加速档 / 机器人世界
- 运行时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Australia/Sydney' })}（Australia/Sydney）
- 浏览器执行器：\`${CHROME}\`
- CDP 浏览器版本：\`${browserVersion}\`

## 逐活动结果

${activityLines}

## 8 关完成清单与作品卡

${doneLines}

\`\`\`json
${JSON.stringify(finalCard, null, 2)}
\`\`\`

## 1. 活动 8 结论与证据

${conclusion}

正常路径的直接证据：保存后输出为 \`${nextBeforeVerify || 'NO_NEXT_BUTTON'}\`，真实验证结束后为 \`${nextAfterVerify || 'NO_NEXT_BUTTON'}\`。验证后页面真实 DOM：

\`\`\`json
${activity7BlockDom}
\`\`\`

显式恢复后，真正的 A 档活动 8 DOM（可见按钮全文、面板标题、input/textarea 列表及“讲明白”面板 HTML）：

\`\`\`json
${activity8Dom}
\`\`\`

活动 8 的 textarea 能接受 A 档双变量解释；点击“🎤 我讲完啦”后，状态变为 \`done=8/8\`，按钮变为“🏅 去领我的徽章！”，随后可进入课末徽章页。因此活动 8 表单/内容本身可完成。

## 2. qa/ 修改内容

- \`qa/cdp-lesson1.mjs\`：按活动 7 分组标题和按钮全文精确选择 A 档参考解；保留“先保存、后验证”；新增活动 7→8 产品门禁断言与显式刷新恢复；dump 真正活动 8 DOM；填写 A 档双变量解释并核验徽章按钮；记录逐活动耗时；支持 \`-o/--output\` 写报告；保留指定 Chrome 为默认路径并提供本次受限环境的 QA 执行器覆盖参数；有界等待测试 Chrome 退出并删除隔离 profile。
- \`${REPORT_FILE}\`：本次生成的闭环 QA 报告。
- 未修改 \`js/\`、\`docs/\`、\`server/\` 源文件、\`index.html\`、\`teacher.html\` 或 \`tools/\`。

## 3. 最终 QA 完整运行输出

\`\`\`text
${runOutput.join('\n')}
\`\`\`

## 4. 发现但未修改的产品问题

1. **严重：活动 7→8 正常路径被真实验证反馈封死。** “保存我的作品卡”先完成活动并生成“下一个任务！”，但验证成功后的反馈替换同一个 \`#feedback-area\` 且 actions 为空，按钮消失；\`ui.completed\` 已为 true，再次保存只提示“作品卡更新好啦”，不会重建下一关按钮。最小修复建议：验证完成时若 \`ui.completed\` 为 true，保留/重建“下一个任务！” action，或把编译结果写到独立 \`#compile-area\`，不要覆盖完成反馈。
2. **高风险：A 档活动 7 的完成条件未被产品 UI 强制。** 未修 QA 的基线真实点击只选到皮肤和出发能量，0 个事件、最终能量 2 仍被标为活动完成并可获得真实验证章：

   \`\`\`text
${baselineExcerpt}
   \`\`\`

   最小修复建议：保存前按当前变体校验 A 档 \`events.length >= 3\` 且预演最终能量为 10；更稳妥的是把成功条件做成内容驱动的机器可判定规则。
3. **低优先级可疑：句子开头的省略号重复。** A 档内容本身已以“……”结尾，渲染器又统一追加“…”；真实 DOM 中出现“才………”、“所以它………”等不整齐文案。建议渲染前判断末尾是否已有省略号。

## 执行环境说明

${environmentNotes}
`;
  mkdirSync(dirname(REPORT_FILE), { recursive: true });
  writeFileSync(REPORT_FILE, report, 'utf8');
  nativeLog('QA 报告已写入:', REPORT_FILE);
}

process.exit(R.fail ? 1 : 0);
