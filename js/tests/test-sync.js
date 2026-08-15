/**
 * test-sync.js — CppLab.Sync 零依赖测试
 *
 * 运行：node js/tests/test-sync.js
 */

'use strict';

var assertCount = 0;
var failed = false;
function assert(cond, msg) {
  assertCount += 1;
  if (!cond) {
    failed = true;
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }
}

var Storage = require('../engine/storage.js');
var Sync = require('../engine/sync.js');
var CppLab = globalThis.CppLab;

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function fakeResponse(status, body) {
  return {
    status: status,
    ok: status >= 200 && status < 300,
    json: function () { return Promise.resolve(body); }
  };
}

function opsEmpty() {
  return fakeResponse(200, { ok: true, ops: [], lastSeq: 0 });
}

var unhandled = 0;
process.on('unhandledRejection', function () { unhandled += 1; });

assert(CppLab && CppLab.Storage === Storage, 'storage.js 应挂载 CppLab.Storage');
assert(CppLab && CppLab.Sync === Sync, 'sync.js 应挂载 CppLab.Sync');

/* 1. 服务器不可达：不得抛出未处理异常，本地 Storage 继续可用。 */
function testOfflineFallback() {
  Storage.clear();
  Sync.start({
    role: 'student',
    pollMs: 20,
    timeoutMs: 50,
    baseUrl: 'http://offline.invalid',
    fetchFn: function () { return Promise.reject(new Error('offline')); }
  });
  Storage.update(function (s) { s.nickname = '离线小朋友'; });
  return wait(1150).then(function () {
    assert(Storage.load().nickname === '离线小朋友', '离线时 Storage 读写应保持正常');
    assert(Sync.status().connected === false, '请求失败后 connected 应为 false');
    assert(typeof Sync.status().lastError === 'string', '请求失败原因只应暴露在 status()');
    assert(unhandled === 0, '服务器不可达不应产生未处理 Promise rejection');
    Sync.stop();
  });
}

/* 2. 学生本地会话变化：debounce 后发 PUT。 */
function testStudentPut() {
  Storage.clear();
  var puts = [];
  function fetchFn(requestUrl, options) {
    if (requestUrl.indexOf('/api/ops?') >= 0) return Promise.resolve(opsEmpty());
    if (requestUrl.indexOf('/api/state') >= 0 && options && options.method === 'PUT') {
      puts.push(JSON.parse(options.body));
      return Promise.resolve(fakeResponse(200, { ok: true, version: puts.length }));
    }
    return Promise.resolve(fakeResponse(404, { ok: false, error: 'not found' }));
  }
  Sync.start({ role: 'student', pollMs: 20, baseUrl: 'http://student-put.test', fetchFn: fetchFn });
  Storage.update(function (s) { s.nickname = '小北'; });
  return wait(1200).then(function () {
    assert(puts.length >= 1, '学生本地变化后应发出 PUT /api/state');
    assert(puts[puts.length - 1].session.nickname === '小北', 'PUT 应携带最新本地会话');
    assert(puts[puts.length - 1].version === 0, '首次 PUT 应从本地版本 0 开始');
    Sync.stop();
  });
}

/* 3. 教师拉到更新版本：通过 Storage.save 写入本地。 */
function testTeacherPull() {
  Storage.clear();
  var remote = Storage.defaultSession();
  var requestedState = false;
  remote.nickname = '远端学生';
  remote.path = 'E';
  function fetchFn(requestUrl) {
    if (requestUrl.indexOf('/api/state') >= 0) requestedState = true;
    return Promise.resolve(fakeResponse(200, {
      ok: true,
      version: 4,
      session: remote,
      updatedAt: '2026-08-11T00:00:00.000Z'
    }));
  }
  Sync.start({ role: 'teacher', pollMs: 25, baseUrl: 'http://teacher-pull.test', fetchFn: fetchFn });
  return wait(80).then(function () {
    assert(requestedState, 'teacher 应轮询 /api/state');
    assert(Storage.load().nickname === '远端学生', 'teacher 应保存服务器上的新 session');
    assert(Storage.load().path === 'E', 'teacher 本地会话应与远端版本一致');
    assert(Sync.status().connected === true, '成功拉取后 connected 应为 true');
    Sync.stop();
  });
}

/* 4. 同一 seq 重复返回也只能应用一次；同时验证 setTier。 */
function testOpIdempotenceAndTier() {
  Storage.clear();
  var op = {
    seq: 1,
    type: 'setTier',
    payload: { path: 'A', reason: '课堂观察', at: '2026-08-11T01:00:00.000Z' },
    at: '2026-08-11T01:00:00.000Z'
  };
  function fetchFn(requestUrl, options) {
    if (requestUrl.indexOf('/api/ops?') >= 0) {
      return Promise.resolve(fakeResponse(200, { ok: true, ops: [op], lastSeq: 1 }));
    }
    if (options && options.method === 'PUT') {
      return Promise.resolve(fakeResponse(200, { ok: true, version: 1 }));
    }
    return Promise.resolve(fakeResponse(404, { ok: false }));
  }
  Sync.start({ role: 'student', pollMs: 20, baseUrl: 'http://ops-idempotent.test', fetchFn: fetchFn });
  return wait(140).then(function () {
    var s = Storage.load();
    assert(s.path === 'A', 'setTier op 应把本地 session.path 改为 A');
    assert(s.scaffoldHistory.length === 1, '相同 seq 不得重复追加 scaffoldHistory');
    assert(s.scaffoldHistory[0].reason === '课堂观察', 'setTier 应保留教师调整原因');
    Sync.stop();
  });
}

/* 5. PUT 收到 409：使用服务器当前 version 原样重试一次。 */
function testConflictRetry() {
  Storage.clear();
  var versions = [];
  var nicknames = [];
  function fetchFn(requestUrl, options) {
    if (requestUrl.indexOf('/api/ops?') >= 0) return Promise.resolve(opsEmpty());
    if (requestUrl.indexOf('/api/state') >= 0 && options && options.method === 'PUT') {
      var sent = JSON.parse(options.body);
      versions.push(sent.version);
      nicknames.push(sent.session.nickname);
      if (versions.length === 1) {
        return Promise.resolve(fakeResponse(409, { ok: false, error: 'version conflict', version: 7 }));
      }
      return Promise.resolve(fakeResponse(200, { ok: true, version: 8 }));
    }
    return Promise.resolve(fakeResponse(404, { ok: false }));
  }
  Sync.start({ role: 'student', pollMs: 20, baseUrl: 'http://conflict-retry.test', fetchFn: fetchFn });
  Storage.update(function (s) { s.nickname = '冲突后仍以我为准'; });
  return wait(1200).then(function () {
    assert(versions.length === 2, '409 后应且只应立即重试一次');
    assert(versions[0] === 0 && versions[1] === 7, '409 重试应改用服务器返回的 version');
    assert(nicknames[0] === nicknames[1] && nicknames[1] === '冲突后仍以我为准', '409 重试仍应发送学生本地会话');
    assert(Sync.status().connected === true, '冲突重试成功后 connected 应恢复为 true');
    Sync.stop();
  });
}

/* 6. poke()：完成/证据/主题切换等关键时刻跳过 1s 防抖与轮询周期，立即 PUT。
 *    背景：2026-08-15 首课实测轮询通道停摆时进度全程未回写（version 停 0），
 *    事件级触发是轮询之外的第二条路。 */
function testPokeImmediatePut() {
  Storage.clear();
  var puts = [];
  function fetchFn(requestUrl, options) {
    if (requestUrl.indexOf('/api/ops?') >= 0) return Promise.resolve(opsEmpty());
    if (requestUrl.indexOf('/api/state') >= 0 && options && options.method === 'PUT') {
      puts.push({ at: Date.now(), body: JSON.parse(options.body) });
      return Promise.resolve(fakeResponse(200, { ok: true, version: puts.length }));
    }
    return Promise.resolve(fakeResponse(404, { ok: false }));
  }
  // pollMs 故意拉到 60s：证明 poke 的 PUT 不依赖轮询周期，也不等 1s 防抖
  Sync.start({ role: 'student', pollMs: 60000, baseUrl: 'http://poke-immediate.test', fetchFn: fetchFn });
  var startAt = Date.now();
  Storage.update(function (s) { s.nickname = '点一下就推'; });
  var poked = Sync.poke();
  return wait(150).then(function () {
    assert(poked === true, 'student 运行中 poke() 应返回 true');
    assert(puts.length === 1, 'poke() 应跳过防抖立即发出 PUT（而非等轮询/防抖）');
    assert(puts[0].body.session.nickname === '点一下就推', 'poke() 的 PUT 应携带刚写入的会话');
    assert(puts[0].at - startAt < 900, 'poke() 的 PUT 应早于 1s 防抖触发');
    var pokedAgain = Sync.poke();
    return wait(150).then(function () {
      assert(pokedAgain === true, '无新变化时 poke() 仍安全返回 true');
      assert(puts.length === 1, '会话未变化时 poke() 不得重复 PUT');
      assert(Sync.status().connected === true, 'poke 成功后 connected 应为 true');
      Sync.stop();
    });
  });
}

/* 7. poke() 在未启动/teacher 角色下必须安全（返回 false、不发 PUT）。 */
function testPokeGuards() {
  Storage.clear();
  var putCount = 0;
  function fetchFn(requestUrl, options) {
    if (requestUrl.indexOf('/api/state') >= 0 && options && options.method === 'PUT') putCount += 1;
    return Promise.resolve(fakeResponse(200, { ok: true, version: 1, session: Storage.load(), updatedAt: '2026-08-15T00:00:00.000Z' }));
  }
  assert(Sync.poke() === false, '未 start 时 poke() 应返回 false');
  Sync.start({ role: 'teacher', pollMs: 25, baseUrl: 'http://poke-guard.test', fetchFn: fetchFn });
  assert(Sync.poke() === false, 'teacher 角色下 poke() 应返回 false');
  return wait(80).then(function () {
    assert(putCount === 0, 'teacher 角色下 poke()/轮询都不得产生 PUT（写操作只走 pushOp）');
    Sync.stop();
  });
}

testOfflineFallback()
  .then(testStudentPut)
  .then(testTeacherPull)
  .then(testOpIdempotenceAndTier)
  .then(testConflictRetry)
  .then(testPokeImmediatePut)
  .then(testPokeGuards)
  .then(function () {
    if (!failed) console.log('PASS (' + assertCount + ' assertions)');
  }, function (err) {
    console.error('FAIL:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
    Sync.stop();
  });
