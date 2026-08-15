/* 第 1 课 A 档闭环 QA · 剧场模式版（theater-mode 分支）。
   用法: node qa/cdp-lesson1-theater.mjs
   前提: 服务器在 8100 跑着（--fresh + A 档种子 / 机器人世界）。

   由 qa/cdp-lesson1.mjs 适配而来（原件不动）。适配点：
     · BASE 8099 → 8100（8099 是今天的课堂端口，严禁触碰）
     · 第 1 课现在共 9 个任务：任务 1 是新增「登机仪式」（ordering，
       id lesson1-00-boarding-ritual，A 档带 choice 预测 + 5 步排序）；
       原活动 1–8 顺延为任务 2–9，done 阈值全体 +1
     · 按钮改名：单步→单步执行、重置→重新再来；次要按钮收进右缘
       「🧰 工具」抽屉（先点 .tool-handle 才能点到）
     · 可见性不用 offsetParent（抽屉在 position:fixed 里恒为 null），
       改用 getBoundingClientRect + computedStyle，并把移出视口右缘的
       收起抽屉判为不可见
     · 主操作是单个大 CTA（.cta-main），状态机：先预测→运行→
       真实C++验证→下一个任务/去领我的徽章

   原 19 项检查 → 新编号映射（意图不减弱，一项没删）：
     原1 种子A档→#1 · 原2 进第1课→#2 · 原3 活动1完成→#10
     原4 排序前预测→#11 · 原5 活动2完成→#12 · 原6~9 活动3-6→#15~18
     原10 A档参考解→#19 · 原11 先保存未盖章→#20 · 原12 卡内容→#21
     原13 验证后verified→#22 · 原14 下一关门禁→#23 · 原15 进活动8→#24
     原16 活动8完成→#25 · 原17 徽章按钮→#26 · 原18 全闭环→#27
     原19 徽章页→#28
   新增 3 项（任务要求）：#9 工具抽屉开合 · #14 双语术语 chip ·
     #6/#7 活动切换幕布出现并自动移除
   另加剧场自查（不占新增名额）：#3~#5 登机仪式（CTA=先预测/排序前
     预测可交/完成）· #8 幕布后落到任务 2 · #13 CTA 状态机 先预测→运行 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { format } from 'node:util';

const BASE = 'http://127.0.0.1:8100';
const CHROME = process.env.CPPLAB_QA_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = '/tmp/cpplab-qa-l1-theater';
const DEBUG_PORT = 9336;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const runOutput = [];
const nativeLog = console.log.bind(console);
console.log = (...args) => { runOutput.push(format(...args)); nativeLog(...args); };

rmSync(PROFILE, { recursive: true, force: true });
const chromeArgs = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,1000', 'about:blank',
];
const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    const p = list.find(t => t.type === 'page');
    if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
  } catch { }
  await sleep(250);
}
if (!wsUrl) { console.error('!! DevTools 没起来'); chrome.kill(); process.exit(1); }

let browserVersion = 'unknown';
try {
  const v = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
  browserVersion = v.Browser || browserVersion;
} catch { }

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

/* ---------- 页面内工具（剧场版可见性：rect + computedStyle） ---------- */
const HELPERS = `
window.__qa = {
  vis(sel){
    return [...document.querySelectorAll(sel)].filter(e => {
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      if (r.left >= window.innerWidth - 1) return false; // 收起的抽屉整体移出右缘
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
  head(){ return this.txt(document.querySelector('.activity-head h2')||{textContent:''}); },
  state(){
    const s = JSON.parse(localStorage.getItem('cpplab_session_v1')||'{}');
    const st = s.lessons?.lesson1?.activityStates||{};
    const done = Object.keys(st).filter(k=>{const v=st[k];return v&&(v.status==='done'||v.state==='done');});
    return { doneIds: done, doneCount: done.length,
             card: s.lessons?.lesson1?.artifactCard||null,
             finalEnergy: s.lessons?.lesson1?.finalEnergy, path: s.path };
  },
  // 排序通用：按 WANT 正则序列用「上移」冒泡到位，再点「检查顺序」
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
    const order = rows().map(r=>this.txt(r).slice(0,16));
    const chkBtn = this.btn(/检查顺序/);
    if(!chkBtn) return 'NO_CHECK_BTN | ' + order.join(' > ');
    chkBtn.click();
    return 'CHECKED | ' + order.join(' > ');
  },
  scene(){
    const n=s=>(s||'').replace(/\\s+/g,' ').trim();
    return JSON.stringify({
      kicker: this.kicker(), head: this.head(), cta: this.ctaText(),
      按钮: this.vis('button').map(b=>n(b.textContent).slice(0,22)),
      输入框: this.vis('input,textarea').map(i=>({tag:i.tagName,ph:i.placeholder||'',v:(i.value||'').slice(0,20)})),
      反馈区: n(document.querySelector('#feedback-area')?.textContent||'').slice(0,200)
    },null,1);
  }
};
'ok'`;

const R = { steps: [], pass: 0, fail: 0 };
const chk = (name, ok, extra) => {
  R[ok ? 'pass' : 'fail']++;
  R.steps.push(`${ok ? '✅' : '❌'} ${name}${extra ? '  << ' + extra : ''}`);
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  << ' + extra : ''}`);
};

console.log('QA 浏览器:', CHROME);
console.log('CDP 浏览器版本:', browserVersion);
console.log('QA 地址:', BASE);
await send('Page.navigate', { url: `${BASE}/index.html` });
await sleep(2600);
await js(HELPERS);

// 幕布失败时用于分类「环境 vs app bug」的现场信息
console.log('动效环境:', await js(`JSON.stringify({
  reducedMotion: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  noAnim: document.body.classList.contains('no-anim')
})`));

const seed = await js(`JSON.stringify(__qa.state())`);
console.log('起点:', seed);
chk('#1 种子是 A 档', /"path":"A"/.test(seed), seed);

/* 进第 1 课（若出现课程 intro 页则点「开始探险」） */
await js(`(()=>{const t=[...document.querySelectorAll('button,.card,a')].find(e=>/机器人能量站/.test(e.textContent||''));if(t)t.click();})()`);
await sleep(1600);
await js(`__qa.click(/开始探险/)`); // 无 intro 页时为 no-op
await sleep(1400);
let kicker = await js(`__qa.kicker()`);
let head = await js(`__qa.head()`);
chk('#2 进入第 1 课，首个任务是登机仪式（任务 1 / 9）',
  /任务 1 \/ 9/.test(String(kicker)) && /登机仪式/.test(String(head)), `${kicker} | ${head}`);

/* ---------- 任务 1 · 登机仪式（新增 ordering，A 档：choice 预测 + 5 步排序） ---------- */
console.log('\n--- 任务 1 登机仪式（A 档：先预测，再排 5 步，CTA 状态机起点）---');
const ctaAtBoarding = await js(`__qa.ctaText()`);
chk('#3 登机仪式未预测时 CTA=先预测（剧场状态机）', /先预测/.test(String(ctaAtBoarding)), String(ctaAtBoarding));

const boardingPredict = await js(`(()=>{
  const panel = document.getElementById('predict-panel');
  if(!panel) return 'NO_PREDICT_PANEL';
  const chip = [...panel.querySelectorAll('button.chip')].find(b=>/它是一个地址/.test(__qa.txt(b)));
  if(!chip) return 'NO_ADDRESS_CHIP';
  chip.click(); return 'clicked:'+__qa.txt(chip).slice(0,20);
})()`);
console.log('   预测(choice) →', boardingPredict);
await sleep(900);
chk('#4 登机仪式排序前能提交预测（choice 点击即提交）', String(boardingPredict).startsWith('clicked:'), String(boardingPredict));

const boardingOrder = await js(`__qa.order(['电源键','登录自己的账户','Wi-Fi','Dock','地址栏'])`);
console.log('   排序 →', boardingOrder);
await sleep(2000); // 排对后 playSequenceDemo 播动作序列
let st = await js(`__qa.state()`);
chk('#5 登机仪式完成', st.doneCount >= 1 && st.doneIds.includes('lesson1-00-boarding-ritual'),
  `${boardingOrder} / done=${JSON.stringify(st.doneIds)}`);

/* ---------- 新增：活动切换幕布（同一 evaluate 内点 CTA 并立刻查幕布） ---------- */
const veilNow = await js(`(()=>{
  const c=__qa.cta();
  if(!c || !/下一个任务/.test(__qa.txt(c))) return 'NO_NEXT_CTA:'+__qa.ctaText();
  c.click();
  return document.querySelector('.ritual-veil') ? 'VEIL_PRESENT' : 'VEIL_MISSING';
})()`);
chk('#6 点下一个任务后幕布 .ritual-veil 出现', veilNow === 'VEIL_PRESENT', String(veilNow));
await sleep(1300); // 700ms 幕布 + 缓冲
const veilGone = await js(`!document.querySelector('.ritual-veil')`);
chk('#7 幕布自动移除（不留在 DOM）', veilGone === true, `veilGone=${veilGone}`);
kicker = await js(`__qa.kicker()`); head = await js(`__qa.head()`);
chk('#8 幕布后落到任务 2（返回任务世界）', /任务 2 \/ 9/.test(String(kicker)), `${kicker} | ${head}`);

/* ---------- 新增：工具抽屉开合（在任务 2 上验证，独立于内容） ---------- */
console.log('\n--- 任务 2（先验抽屉开合，再做选择题）---');
const drawerOpen = await js(`(async()=>{
  const before = document.body.classList.contains('tools-open');
  const handle = document.querySelector('.tool-handle');
  if(!handle) return 'NO_HANDLE';
  const drawerHiddenBefore = __qa.vis('.tool-drawer').length === 0;
  handle.click();
  await new Promise(r=>setTimeout(r,600));
  const opened = document.body.classList.contains('tools-open');
  const aria = handle.getAttribute('aria-expanded');
  const drawerVisible = __qa.vis('.tool-drawer').length === 1;
  const toolBtns = __qa.vis('.tool-drawer button').map(b=>__qa.txt(b));
  const closeBtn = __qa.btn(/收起/);
  if(closeBtn) closeBtn.click();
  await new Promise(r=>setTimeout(r,600));
  const closed = !document.body.classList.contains('tools-open');
  const drawerHiddenAfter = __qa.vis('.tool-drawer').length === 0;
  return JSON.stringify({before, drawerHiddenBefore, opened, aria, drawerVisible, closed, drawerHiddenAfter, toolBtns});
})()`);
console.log('   抽屉 →', drawerOpen);
let dj = {};
try { dj = JSON.parse(drawerOpen); } catch { }
chk('#9 工具抽屉能开合（tools-open/aria/可见性往返）',
  dj && dj.before === false && dj.drawerHiddenBefore === true && dj.opened === true &&
  dj.aria === 'true' && dj.drawerVisible === true && dj.closed === true && dj.drawerHiddenAfter === true,
  String(drawerOpen).slice(0, 220));

/* ---------- 任务 2 · 原活动 1（选择题） ---------- */
await js(`(()=>{const c=__qa.vis('.chip').find(e=>/只保存现在的值|旧的值会被新的值盖掉/.test(__qa.txt(e))); if(c)c.click();})()`);
await sleep(1200);
st = await js(`__qa.state()`);
chk('#10 活动 1（任务 2）完成', st.doneCount >= 2, JSON.stringify(st.doneIds));
await js(`__qa.click(/下一个任务/)`); await sleep(1600);

/* ---------- 任务 3 · 原活动 2：先预测、再排序（教案顺序门禁） ---------- */
console.log('\n--- 任务 3 命令排队（验证：预测必须排在检查顺序之前）---');
const predBefore = await js(`(()=>{
  const panel = document.getElementById('predict-panel');
  const inp = panel ? panel.querySelector('input') : null;
  if(inp){ inp.focus(); inp.value='2'; inp.dispatchEvent(new Event('input',{bubbles:true})); }
  const b = __qa.btn(/就猜这个|确定|提交/);
  if(b){ b.click(); return 'submitted:'+__qa.txt(b); }
  const chip = panel ? [...panel.querySelectorAll('button.chip')][0] : null;
  if(chip){ chip.click(); return 'chip:'+__qa.txt(chip); }
  return 'NO_PREDICT_UI';
})()`);
console.log('   先提交预测 →', predBefore);
await sleep(900);
chk('#11 排序前能提交预测（教案新顺序成立）', predBefore !== 'NO_PREDICT_UI' && !String(predBefore).includes('__err'), String(predBefore));

const ordered = await js(`__qa.order(['建立能量盒','能量豆','探照灯','报告'])`);
console.log('   排序 →', ordered);
await sleep(2000);
st = await js(`__qa.state()`);
chk('#12 活动 2（任务 3）完成', st.doneCount >= 3, `${ordered} / done=${st.doneCount}`);
await js(`__qa.click(/下一个任务/)`); await sleep(1600);

/* ---------- 任务 4–7 · 原活动 3–6：CTA 驱动（预测→运行→答检查点→…） ---------- */
let termChipInfo = null;
for (const origN of [3, 4, 5, 6]) {
  const taskNo = origN + 1;
  console.log(`\n--- 任务 ${taskNo}（原活动 ${origN}）---`);
  const before = (await js(`__qa.state()`)).doneCount;

  if (origN === 3) {
    // 新增：双语术语 chip（能量盒 childPrompt 带 [[变量|variable]]）
    termChipInfo = await js(`(()=>{
      const chips=[...document.querySelectorAll('.cpp-term-chip')];
      return JSON.stringify(chips.map(c=>({t:__qa.txt(c), code:(c.querySelector('code')||{}).textContent||''})));
    })()`);
    console.log('   术语 chip →', termChipInfo);
    chk('#14 双语术语 chip 出现（变量|variable）',
      /variable/.test(String(termChipInfo)) && /变量/.test(String(termChipInfo)), String(termChipInfo));
    // 新增剧场自查：CTA 状态机 先预测 → 运行
    const ctaBefore = await js(`__qa.ctaText()`);
    const machineOk = /先预测/.test(String(ctaBefore));
    // 预测在下面的通用循环里提交；提交后再看 CTA
    if (!machineOk) chk('#13 CTA 状态机：未预测=先预测 → 预测后=运行', false, `预测前 CTA=${ctaBefore}`);
    else {
      await js(`(()=>{
        const panel=document.getElementById('predict-panel');
        const inp=panel?panel.querySelector('input'):null;
        if(inp){ inp.focus(); inp.value='5'; inp.dispatchEvent(new Event('input',{bubbles:true})); }
        const b=__qa.btn(/就猜这个/); if(b) b.click();
      })()`);
      await sleep(800);
      const ctaAfter = await js(`__qa.ctaText()`);
      chk('#13 CTA 状态机：未预测=先预测 → 预测后=运行',
        /运行/.test(String(ctaAfter)), `预测前=${ctaBefore} 预测后=${ctaAfter}`);
    }
  }

  const trace = await js(`(async()=>{
    const log=[];
    window.__qaSlotDone = window.__qaSlotDone || false;
    for(let i=0;i<70;i++){
      // 1) 预测面板（剧场：面板内联可见，数字型填值+就猜这个，choice 型点 chip）
      const panel = document.getElementById('predict-panel');
      const gb = __qa.btn(/就猜这个/);
      if(gb){
        const inp = panel ? panel.querySelector('input') : null;
        if(inp){ inp.focus(); inp.value=String([0,0,0,5,2,8,6][${origN}]||'6'); inp.dispatchEvent(new Event('input',{bubbles:true})); }
        gb.click(); log.push('predict'); await new Promise(r=>setTimeout(r,600)); continue;
      }
      // 2) 检查点/主问题：输入 + 回答
      const ansBtn = __qa.btn(/^回答$|确定回答/);
      if(ansBtn){
        const ai = __qa.vis('input')[0];
        if(ai){ ai.focus(); ai.value='0'; ai.dispatchEvent(new Event('input',{bubbles:true})); }
        ansBtn.click(); log.push('answer'); await new Promise(r=>setTimeout(r,600)); continue;
      }
      // 3) 检查点/主问题的选项 chip（预测 chip 已在 1 处理；禁用的跳过）
      const cps = __qa.vis('.chip').filter(c=>!c.disabled && c.tagName==='BUTTON');
      const ctaNow = __qa.ctaText();
      if(cps.length && !(ctaNow && /下一个任务|去领我的徽章/.test(ctaNow))){
        cps[0].click(); log.push('chip:'+__qa.txt(cps[0]).slice(0,10));
        await new Promise(r=>setTimeout(r,600)); continue;
      }
      // 4) 改槽位（任务 6=原活动 5）：把 boost 从 1 改成 2 → 正好 10
      if(${origN}===5 && !window.__qaSlotDone && !(ctaNow && /下一个任务/.test(ctaNow))){
        const slots = __qa.vis('.slot-chip');
        const target = slots.find(x=>/加速|boost|倍率|快充/i.test(__qa.txt(x))) || slots[0];
        if(target){
          log.push('slot:'+__qa.txt(target).slice(0,12));
          target.click(); await new Promise(r=>setTimeout(r,450));
          const ed=document.querySelector('.slot-editor');
          const si=ed?ed.querySelector('input'):null;
          if(si){ si.focus(); si.value='2'; si.dispatchEvent(new Event('input',{bubbles:true})); }
          const okb=__qa.btn(/改好了/);
          if(okb){ okb.click(); window.__qaSlotDone=true; log.push('slot-ok'); await new Promise(r=>setTimeout(r,600)); continue; }
        }
      }
      // 5) CTA 主按钮（剧场状态机：运行 / 真实C++验证）
      const cta = __qa.cta();
      if(cta && !cta.disabled){
        const t = __qa.txt(cta);
        if(/下一个任务|去领我的徽章/.test(t)) return log.join(',')+' => READY';
        if(/运行/.test(t)){ cta.click(); log.push('cta-run'); await new Promise(r=>setTimeout(r,1400)); continue; }
        if(/真实C\\+\\+验证/.test(t)){ cta.click(); log.push('cta-verify'); await new Promise(r=>setTimeout(r,2500)); continue; }
        if(/先预测/.test(t)){ cta.click(); log.push('cta-predict'); await new Promise(r=>setTimeout(r,500)); continue; }
      }
      // 6) 兜底：开工具抽屉用「单步执行」推进（抽屉即使开着也不挡 JS 点击）
      const stepBtn = __qa.btn(/单步执行/);
      if(!cta && stepBtn){ stepBtn.click(); log.push('step'); await new Promise(r=>setTimeout(r,450)); continue; }
      if(!cta && !stepBtn && !document.body.classList.contains('tools-open')){
        const h=document.querySelector('.tool-handle'); if(h){ h.click(); log.push('open-tools'); await new Promise(r=>setTimeout(r,500)); continue; }
      }
      await new Promise(r=>setTimeout(r,450));
    }
    return log.join(',')+' => TIMEOUT';
  })()`);
  console.log('   ', String(trace).slice(0, 200));
  // 抽屉若被兜底打开过，关掉再判分
  await js(`(()=>{ if(document.body.classList.contains('tools-open')){ const b=__qa.btn(/收起/); if(b) b.click(); } })()`);
  await sleep(400);
  st = await js(`__qa.state()`);
  if (st.doneCount === before) {
    console.log(`   [任务 ${taskNo} 卡住现场]`, await js(`__qa.scene()`));
  }
  chk(`#${12 + origN} 活动 ${origN}（任务 ${taskNo}）完成`, st.doneCount > before, `done=${st.doneCount} ${String(trace).slice(-50)}`);
  await js(`__qa.click(/下一个任务/)`); await sleep(1800);
}

/* ---------- 任务 8 · 原活动 7：先保存、后验证（验证按钮在抽屉里） ---------- */
console.log('\n--- 任务 8 我的改造（验证：先保存后验证，印章不被覆盖）---');
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
    preview: __qa.txt(document.querySelector('.build-preview')||{textContent:''})
  });
})()`);
console.log('   A 档选项 →', buildSelection);
chk('#19 活动 7 真正选中 A 档参考解', !String(buildSelection).includes('NO_') && /最后的能量是 10 格/.test(String(buildSelection)), String(buildSelection).slice(0, 260));
await sleep(800);
const saveFirst = await js(`__qa.click(/保存我的作品卡/)`);
await sleep(1400);
let card = (await js(`__qa.state()`)).card;
chk('#20 活动 7 先保存成功且尚未盖验证章', !!card && card.verified === false,
  saveFirst ? `点了「${saveFirst}」verified=${card && card.verified}` : '没找到保存按钮');
const savedEvents = card && Array.isArray(card.events) ? card.events : [];
const referenceCardOk = !!card && card.finalEnergy === 10 && savedEvents.length === 3 &&
  /能量豆/.test(savedEvents[0]) && /探照灯/.test(savedEvents[1]) && /太阳能加倍/.test(savedEvents[2]);
chk('#21 活动 7 保存内容是 10 能量 / 3 事件 / 加倍最后', referenceCardOk,
  card ? JSON.stringify({ 最终能量: card.finalEnergy, 已验证: card.verified, 事件: savedEvents }) : 'card=null');
const nextBeforeVerify = await js(`__qa.ctaText()`);
console.log('   保存后 CTA →', nextBeforeVerify || 'NO_CTA');

// 剧场模式：验证按钮收在工具抽屉里（点它会自动关抽屉）
const verifyClicked = await js(`(async()=>{
  let b = __qa.btn(/真实C\\+\\+验证/);
  if(!b){
    const h=document.querySelector('.tool-handle'); if(h){ h.click(); await new Promise(r=>setTimeout(r,600)); }
    b = __qa.btn(/真实C\\+\\+验证/);
  }
  if(!b) return 'NO_VERIFY_BUTTON';
  const label=__qa.txt(b); b.click(); return label;
})()`);
console.log('   点验证（抽屉）→', verifyClicked);
await sleep(9000); // 真实编译要几秒
card = (await js(`__qa.state()`)).card;
if (card) {
  chk('#22 验证后作品卡仍在且印章为 true', card.verified === true, `verified=${card.verified}`);
  console.log('   作品卡:', JSON.stringify({ 最终能量: card.finalEnergy, 已验证: card.verified, 事件数: (card.events || []).length, 事件: card.events }));
} else {
  chk('#22 验证后作品卡仍在', false, 'card=null');
}
const nextAfterVerify = await js(`__qa.click(/下一个任务/)`);
console.log('   验证后点下一关 →', nextAfterVerify || 'NO_NEXT_BUTTON');
let transitionBlocked = !nextAfterVerify;
chk('#23 活动 7 保存→验证后仍有正常下一关路径（产品门禁）', !transitionBlocked,
  transitionBlocked ? `保存后 CTA=${nextBeforeVerify}，验证后 NO_NEXT_BUTTON` : `点了「${nextAfterVerify}」`);
if (!nextAfterVerify) {
  // 诊断恢复：刷新后从首页「继续我的任务」回到第一个未完成活动（沿用原脚本取证路径）
  console.log('   [恢复取证] 刷新并从「继续我的任务」进入');
  console.log('   [验证后现场]', await js(`__qa.scene()`));
  await send('Page.reload', { ignoreCache: true });
  await sleep(2800);
  await js(HELPERS);
  const resumed = await js(`(()=>{
    const t=__qa.vis('button.home-card').find(e=>/继续我的任务/.test(__qa.txt(e))) ||
      __qa.vis('button.home-card').find(e=>/机器人能量站/.test(__qa.txt(e)));
    if(!t) return null;
    const label=__qa.txt(t); t.click(); return label;
  })()`);
  console.log('   [恢复取证] 点了 →', resumed || 'NO_RESUME_CARD');
  await sleep(1600);
  await js(`__qa.click(/开始探险/)`);
}
await sleep(1800);
const activity9Entry = await js(`JSON.stringify({task:__qa.kicker(),title:__qa.head()})`);
chk('#24 进入真实活动 8（任务 9 / 9 · 讲给机器人听）',
  /任务 9 \/ 9/.test(String(activity9Entry)) && /讲给机器人听/.test(String(activity9Entry)), String(activity9Entry));

/* ---------- 任务 9 · 原活动 8：讲解 ---------- */
console.log('\n--- 任务 9 讲给机器人听 ---');
const explainAction = await js(`(()=>{
  const panel=__qa.vis('.panel').find(p=>/讲明白/.test(__qa.txt(p)));
  const starter=panel ? [...panel.querySelectorAll('button.chip')].find(b=>/等号的右边先/.test(__qa.txt(b))) : null;
  if(starter) starter.click();
  const ta=panel ? panel.querySelector('textarea') : null;
  if(!ta) return 'NO_TEXTAREA';
  ta.focus();
  ta.value='等号的右边先读取 energy 和 shield，算出 shield × 2 后加到旧 energy；左边的 energy 盒子最后才写入新值。shield 只被读取，没有被改。energy += 2 和 energy = energy + 2 意思相同。';
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  return JSON.stringify({starter:starter?__qa.txt(starter):null,len:ta.value.length});
})()`);
console.log('   句子开头 + A 档解释 →', explainAction);
await sleep(600);
const explainDone = await js(`__qa.click(/我讲完啦/)`);
console.log('   提交讲解 →', explainDone || 'NO_DONE_BUTTON');
await sleep(1600);
st = await js(`__qa.state()`);
const badgeReady = await js(`__qa.ctaText()`);
chk('#25 活动 8（任务 9）完成', st.doneCount >= 9, `done=${st.doneCount}/9`);
chk('#26 完成后 CTA 变为徽章按钮', /去领我的徽章/.test(String(badgeReady)), badgeReady || 'NO_BADGE_CTA');
chk('#27 全 9 关闭环（含登机仪式）', st.doneCount >= 9 && st.doneIds.includes('lesson1-00-boarding-ritual'),
  JSON.stringify(st.doneIds));
const badgeClicked = await js(`__qa.click(/去领我的徽章/)`);
await sleep(1200);
const endPage = await js(`__qa.txt(document.querySelector('.end-page h1')||{textContent:''})`);
chk('#28 进入课末徽章页', /今天的探险完成啦/.test(String(endPage)), `${badgeClicked || 'NO_CLICK'} / ${endPage || 'NO_END_PAGE'}`);

const closeState = await js(`__qa.state()`);
console.log('\n===== 9 关完成清单 =====');
(closeState.doneIds || []).forEach((activityId, index) => console.log(`${index + 1}. ✅ ${activityId}`));
console.log('最终作品卡:', JSON.stringify(closeState.card ? {
  最终能量: closeState.card.finalEnergy, 已验证: closeState.card.verified, 事件: closeState.card.events
} : null));

console.log('\n===== 剧场版闭环 QA：' + R.pass + ' 通过 / ' + R.fail + ' 失败 =====');
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
console.log(`浏览器清理：processExited=${chromeExited} profileRemoved=${!existsSync(PROFILE)}`);

process.exit(R.fail ? 1 : 0);
