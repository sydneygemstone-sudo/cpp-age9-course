#!/usr/bin/env node

/**
 * server.js — C++ 互动课程局域网服务器
 *
 * 只使用 Node 内置模块：静态托管、学生会话中继、教师指令队列与会话快照。
 * 启动：node server/server.js --port 8080 [--seed <session.json>] [--data <dir>]
 */

'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var url = require('url');

var STATIC_ROOT = path.resolve(__dirname, '..');
var DEFAULT_DATA_DIR = path.join(__dirname, 'data');
var MAX_BODY_BYTES = 1024 * 1024;

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInt(value) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value && value >= 0;
}

function parseArgs(argv) {
  var out = { port: 8080, seed: null, dataDir: DEFAULT_DATA_DIR, fresh: false };
  var i;
  for (i = 0; i < argv.length; i += 1) {
    var arg = argv[i];
    // --fresh 是开关，不带值：丢弃上一轮状态，强制用种子开新课
    if (arg === '--fresh') {
      out.fresh = true;
      continue;
    }
    if (arg !== '--port' && arg !== '--seed' && arg !== '--data') {
      throw new Error('未知参数：' + arg);
    }
    if (i + 1 >= argv.length) {
      throw new Error(arg + ' 缺少参数值');
    }
    var value = argv[i + 1];
    i += 1;
    if (arg === '--port') {
      var port = Number(value);
      if (!isNonNegativeInt(port) || port < 1 || port > 65535) {
        throw new Error('--port 必须是 1–65535 的整数');
      }
      out.port = port;
    } else if (arg === '--seed') {
      out.seed = path.resolve(process.cwd(), value);
    } else {
      out.dataDir = path.resolve(process.cwd(), value);
    }
  }
  return out;
}

function ensureDataDirs(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'snapshots'), { recursive: true });
}

function readJSONFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeAtomicJSON(file, value) {
  var temp = file + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(temp, file);
  } catch (err) {
    try { fs.unlinkSync(temp); } catch (ignore) { /* 已不存在即可 */ }
    throw err;
  }
}

function snapshotName(snapshotDir, iso) {
  var base = 'snapshot-' + iso;
  var candidate = path.join(snapshotDir, base + '.json');
  var suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(snapshotDir, base + '-' + suffix + '.json');
    suffix += 1;
  }
  return candidate;
}

function trimSnapshots(snapshotDir) {
  var files = fs.readdirSync(snapshotDir).filter(function (name) {
    return /^snapshot-.*\.json$/.test(name);
  }).sort();
  while (files.length > 50) {
    fs.unlinkSync(path.join(snapshotDir, files.shift()));
  }
}

function persistState(dataDir, envelope, withSnapshot) {
  ensureDataDirs(dataDir);
  writeAtomicJSON(path.join(dataDir, 'latest.json'), envelope);
  if (withSnapshot) {
    var snapshotDir = path.join(dataDir, 'snapshots');
    writeAtomicJSON(snapshotName(snapshotDir, envelope.updatedAt), envelope);
    trimSnapshots(snapshotDir);
  }
}

function loadInitialState(options) {
  ensureDataDirs(options.dataDir);
  var latestFile = path.join(options.dataDir, 'latest.json');
  var initial = {
    version: 0,
    session: null,
    updatedAt: new Date().toISOString()
  };

  // --fresh：明确开一堂新课，丢弃上一轮（含课前彩排）留下的状态，强制使用种子。
  // 没有它的话，只要彩排过一次就会留下 latest.json，之后即使改了孩子昵称、重新
  // 生成种子，也会被静默忽略——老师完全看不出来，直到孩子打开看见彩排用的名字。
  if (options.fresh && fs.existsSync(latestFile)) {
    try {
      fs.unlinkSync(latestFile);
      process.stdout.write('--fresh：已丢弃上一轮的 latest.json，本次从种子重新开始。\n');
    } catch (err0) {
      process.stderr.write('警告：--fresh 未能删除 latest.json：' + err0.message + '\n');
    }
  }

  if (fs.existsSync(latestFile)) {
    try {
      var stored = readJSONFile(latestFile);
      if (isObject(stored) && Object.prototype.hasOwnProperty.call(stored, 'session') &&
          (stored.session === null || isObject(stored.session)) && isNonNegativeInt(stored.version)) {
        initial.version = stored.version;
        initial.session = stored.session;
        initial.updatedAt = typeof stored.updatedAt === 'string' ? stored.updatedAt : initial.updatedAt;
      } else {
        process.stderr.write('警告：server/data/latest.json 格式无效，已忽略。\n');
      }
    } catch (err) {
      process.stderr.write('警告：无法读取 server/data/latest.json，已忽略：' + err.message + '\n');
    }
  }

  var seedIgnored = (initial.session !== null && options.seed);

  if (initial.session === null && options.seed) {
    try {
      var seed = readJSONFile(options.seed);
      if (!isObject(seed)) throw new Error('根节点必须是会话对象');
      initial.session = seed;
      initial.version = 0;
      initial.updatedAt = new Date().toISOString();
      persistState(options.dataDir, initial, true);
      process.stdout.write('已从种子文件载入初始会话：' + options.seed + '\n');
    } catch (err2) {
      process.stderr.write('警告：种子文件载入失败，服务器将以空会话启动：' + err2.message + '\n');
    }
  }

  // 永远把"这堂课实际会用哪份会话"打出来。老师不看代码，只看这几行判断
  // 学生打开链接后会是谁、什么档位——静默地用错会话是最难当场发现的事故。
  var s = initial.session;
  process.stdout.write(
    '\n本次课堂使用的会话：\n' +
    '  来源     ' + (s === null ? '（空，等学生端首次上传）'
                    : (seedIgnored ? '沿用上一轮的 server/data/latest.json' : '种子文件 ' + (options.seed || '（无）'))) + '\n' +
    '  昵称     ' + (s && s.nickname ? s.nickname : '（空——学生打开后需要自己填昵称、选世界）') + '\n' +
    '  档位     ' + (s && s.path ? s.path : '（未设定，默认 S）') + '\n' +
    '  主题     ' + (s && s.theme ? s.theme : '（未选）') + '\n' +
    '  版本     v' + initial.version + '\n'
  );
  if (seedIgnored) {
    process.stdout.write(
      '\n⚠️  你传了 --seed，但它被忽略了：server/data/ 里已经有上一轮（很可能是课前彩排）\n' +
      '    留下的会话，服务器默认沿用它来支持"中途重启不丢进度"。\n' +
      '    如果上面显示的昵称/档位不是你要的，请改用：\n' +
      '      node server/server.js --port <端口> --seed server/seed.json --fresh\n'
    );
  }
  process.stdout.write('\n');

  return initial;
}

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJSON(req, res, status, value) {
  if (res.writableEnded) return;
  var body;
  try {
    body = JSON.stringify(value);
  } catch (err) {
    status = 500;
    body = JSON.stringify({ ok: false, error: '响应序列化失败' });
  }
  setCommonHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(req.method === 'HEAD' ? '' : body);
}

function readJSONBody(req, callback) {
  var chunks = [];
  var size = 0;
  var done = false;

  function finish(err, value) {
    if (done) return;
    done = true;
    callback(err, value);
  }

  req.on('data', function (chunk) {
    if (done) return;
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      finish({ status: 413, message: '请求体超过 1MB 限制' });
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', function () {
    if (done) return;
    var text = Buffer.concat(chunks).toString('utf8');
    if (!text.trim()) {
      finish({ status: 400, message: '请求体必须是 JSON' });
      return;
    }
    try {
      finish(null, JSON.parse(text));
    } catch (err) {
      finish({ status: 400, message: '请求体不是有效 JSON' });
    }
  });
  req.on('aborted', function () {
    finish({ status: 400, message: '请求在传输完成前中断' });
  });
  req.on('error', function () {
    finish({ status: 400, message: '读取请求体失败' });
  });
}

function safeStaticPath(rawUrl) {
  var rawPath = String(rawUrl || '/').split('?')[0].split('#')[0];
  var decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch (err) {
    return { error: 'URL 编码无效' };
  }
  decoded = decoded.replace(/\\/g, '/');
  if (decoded.indexOf('\0') >= 0 || decoded.split('/').indexOf('..') >= 0) {
    return { error: '禁止路径穿越' };
  }
  if (decoded === '/') decoded = '/index.html';
  var file = path.resolve(STATIC_ROOT, '.' + decoded);
  if (file !== STATIC_ROOT && file.indexOf(STATIC_ROOT + path.sep) !== 0) {
    return { error: '禁止路径穿越' };
  }
  return { file: file };
}

/**
 * 把当前会话同步注入进 HTML。
 *
 * 为什么必须是"注入 HTML"而不是"页面起来后异步拉":
 *   app.js 的 boot() 是同步的——它读一次 localStorage，空就立刻渲染 onboarding。
 *   学生在自己的电脑上第一次打开时本地必然是空的，等异步同步把档位/昵称拉回来，
 *   孩子早已被要求重填昵称、重选世界，档位也已经掉回默认 S。
 *   所以种子必须在第一行 JS 执行前就已经在 window 上。
 *
 * 只注入、不写库：storage.js 仅在本机确实没有会话时才采纳它，绝不覆盖已有进度。
 */
function injectSeed(html, session) {
  if (!session) return html;
  var payload;
  try {
    payload = JSON.stringify(session)
      .replace(/</g, '\\u003c')   // 防止 </script> 提前闭合
      // U+2028/U+2029 在 JSON 里合法，但在 JS 源码里算行终止符，必须转义。
      // 这里用 RegExp 构造而非正则字面量——字面量里直接放这两个字符会让
      // 解析器当成换行，整个文件语法错误。
      .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
      .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
  } catch (e) {
    return html;
  }
  var tag = '<script>window.__CPPLAB_SEED__=' + payload + ';</script>\n';
  var idx = html.indexOf('</head>');
  if (idx < 0) return tag + html;
  return html.slice(0, idx) + tag + html.slice(idx);
}

/**
 * 判断一份会话是不是"全新空白"——没有昵称、没有任何活动状态、没有任何证据。
 * 用于种子保护（见 PUT /api/state）。判定保守：宁可认为它有内容，也不轻易丢弃。
 */
function isBlankSession(session) {
  if (!isObject(session)) return true;
  if (session.nickname) return false;
  if (Array.isArray(session.evidence) && session.evidence.length) return false;
  if (Array.isArray(session.teacherNotes) && session.teacherNotes.length) return false;
  var lessons = session.lessons;
  if (isObject(lessons)) {
    for (var k in lessons) {
      if (!Object.prototype.hasOwnProperty.call(lessons, k)) continue;
      var L = lessons[k];
      if (!isObject(L)) continue;
      if (L.completed) return false;
      if (L.artifactCard) return false;
      if (isObject(L.activityStates) && Object.keys(L.activityStates).length) return false;
    }
  }
  return true;
}

function serveStatic(req, res, runtime) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJSON(req, res, 405, { ok: false, error: '静态文件只支持 GET/HEAD' });
    return;
  }
  var resolved = safeStaticPath(req.url);
  if (resolved.error) {
    sendJSON(req, res, 400, { ok: false, error: resolved.error });
    return;
  }
  fs.stat(resolved.file, function (statErr, stat) {
    if (statErr || !stat.isFile()) {
      sendJSON(req, res, 404, { ok: false, error: '文件不存在' });
      return;
    }
    fs.readFile(resolved.file, function (readErr, data) {
      if (readErr) {
        sendJSON(req, res, 500, { ok: false, error: '读取静态文件失败' });
        return;
      }
      var ext = path.extname(resolved.file).toLowerCase();
      var out = data;
      if (ext === '.html' && runtime && runtime.session) {
        out = Buffer.from(injectSeed(data.toString('utf8'), runtime.session), 'utf8');
      }
      setCommonHeaders(res);
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Content-Length', out.length);
      res.end(req.method === 'HEAD' ? '' : out);
    });
  });
}

function createRequestHandler(options, runtime) {
  return function (req, res) {
    try {
      setCommonHeaders(res);
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      var parsed = url.parse(req.url, true);
      var pathname = parsed.pathname;

      if (pathname === '/api/state') {
        if (req.method === 'GET') {
          sendJSON(req, res, 200, {
            ok: true,
            version: runtime.version,
            session: runtime.session,
            updatedAt: runtime.updatedAt
          });
          return;
        }
        if (req.method !== 'PUT') {
          sendJSON(req, res, 405, { ok: false, error: '/api/state 只支持 GET/PUT' });
          return;
        }
        readJSONBody(req, function (bodyErr, body) {
          if (bodyErr) {
            sendJSON(req, res, bodyErr.status, { ok: false, error: bodyErr.message });
            return;
          }
          try {
            if (!isObject(body) || !isObject(body.session) || !isNonNegativeInt(body.version)) {
              sendJSON(req, res, 400, { ok: false, error: '需要 {session:<obj>, version:<非负整数>}' });
              return;
            }
            if (body.version < runtime.version) {
              sendJSON(req, res, 409, {
                ok: false,
                error: 'version conflict',
                version: runtime.version
              });
              return;
            }
            // 种子保护：不允许一份"全新空白会话"覆盖服务器上已有的、带信息的会话。
            // 场景：某个客户端因为拿不到注入的种子（例如误开 file://、脚本被拦），
            // 本地造了一份默认会话就 PUT 上来，会把课前准备好的档位/昵称/进度冲掉。
            // 空白判定是保守的——只要有昵称、任何活动状态、任何证据，就不算空白。
            if (isBlankSession(body.session) && !isBlankSession(runtime.session)) {
              sendJSON(req, res, 409, {
                ok: false,
                error: '拒绝用空白会话覆盖已有会话（种子保护）',
                version: runtime.version
              });
              return;
            }
            var next = {
              version: body.version + 1,
              session: body.session,
              updatedAt: new Date().toISOString()
            };
            persistState(options.dataDir, next, true);
            runtime.version = next.version;
            runtime.session = next.session;
            runtime.updatedAt = next.updatedAt;
            sendJSON(req, res, 200, { ok: true, version: runtime.version });
          } catch (err) {
            sendJSON(req, res, 500, { ok: false, error: '保存会话失败：' + err.message });
          }
        });
        return;
      }

      if (pathname === '/api/ops') {
        if (req.method === 'GET') {
          var sinceText = parsed.query.since === undefined ? '0' : String(parsed.query.since);
          if (!/^\d+$/.test(sinceText)) {
            sendJSON(req, res, 400, { ok: false, error: 'since 必须是非负整数' });
            return;
          }
          var since = Number(sinceText);
          var newer = runtime.ops.filter(function (op) { return op.seq > since; });
          sendJSON(req, res, 200, { ok: true, ops: newer, lastSeq: runtime.lastSeq });
          return;
        }
        if (req.method !== 'POST') {
          sendJSON(req, res, 405, { ok: false, error: '/api/ops 只支持 GET/POST' });
          return;
        }
        readJSONBody(req, function (bodyErr, body) {
          if (bodyErr) {
            sendJSON(req, res, bodyErr.status, { ok: false, error: bodyErr.message });
            return;
          }
          try {
            if (!isObject(body) || typeof body.type !== 'string' || !body.type.trim() || !isObject(body.payload)) {
              sendJSON(req, res, 400, { ok: false, error: '需要 {type:<非空字符串>, payload:<obj>}' });
              return;
            }
            runtime.lastSeq += 1;
            runtime.ops.push({
              seq: runtime.lastSeq,
              type: body.type,
              payload: body.payload,
              at: new Date().toISOString()
            });
            sendJSON(req, res, 200, { ok: true, seq: runtime.lastSeq });
          } catch (err) {
            sendJSON(req, res, 500, { ok: false, error: '保存指令失败：' + err.message });
          }
        });
        return;
      }

      if (pathname === '/api/reset') {
        if (req.method !== 'POST') {
          sendJSON(req, res, 405, { ok: false, error: '/api/reset 只支持 POST' });
          return;
        }
        try {
          var cleared = { version: 0, session: null, updatedAt: new Date().toISOString() };
          persistState(options.dataDir, cleared, false);
          runtime.version = 0;
          runtime.session = null;
          runtime.updatedAt = cleared.updatedAt;
          runtime.ops = [];
          runtime.lastSeq = 0;
          sendJSON(req, res, 200, { ok: true });
        } catch (err) {
          sendJSON(req, res, 500, { ok: false, error: '重置失败：' + err.message });
        }
        return;
      }

      if (pathname.indexOf('/api/') === 0) {
        sendJSON(req, res, 404, { ok: false, error: 'API 不存在' });
        return;
      }
      serveStatic(req, res, runtime);
    } catch (err) {
      sendJSON(req, res, 500, { ok: false, error: '服务器处理请求失败：' + err.message });
    }
  };
}

function lanAddresses() {
  var found = [];
  var nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (info) {
      var ipv4 = info.family === 'IPv4' || info.family === 4;
      if (ipv4 && !info.internal && found.indexOf(info.address) < 0) found.push(info.address);
    });
  });
  return found;
}

function printLinks(port) {
  var ips = lanAddresses();
  process.stdout.write('\nC++ 课堂服务器已启动（监听 0.0.0.0:' + port + '）\n');
  process.stdout.write('学生端：把下面同一 WiFi 的地址抄给学生\n');
  if (!ips.length) {
    process.stdout.write('  未找到 LAN IPv4；请在 Mac「系统设置 → Wi-Fi → 详细信息」查看 IP\n');
  } else {
    ips.forEach(function (ip) {
      process.stdout.write('  http://' + ip + ':' + port + '/index.html\n');
    });
  }
  process.stdout.write('教师端：老师在本机打开\n');
  process.stdout.write('  http://localhost:' + port + '/teacher.html\n\n');
}

function start(options) {
  var initial = loadInitialState(options);
  var runtime = {
    version: initial.version,
    session: initial.session,
    updatedAt: initial.updatedAt,
    ops: [],
    lastSeq: 0
  };
  var server = http.createServer(createRequestHandler(options, runtime));
  server.on('clientError', function (err, socket) {
    try {
      socket.end('HTTP/1.1 400 Bad Request\r\nContent-Type: application/json; charset=utf-8\r\nConnection: close\r\n\r\n' +
        JSON.stringify({ ok: false, error: '无效的 HTTP 请求' }));
    } catch (ignore) { /* 坏连接直接交给 Node 回收 */ }
  });
  server.on('error', function (err) {
    process.stderr.write('服务器启动/运行错误：' + err.message + '\n');
  });
  server.listen(options.port, '0.0.0.0', function () {
    printLinks(options.port);
  });
  return server;
}

if (require.main === module) {
  try {
    start(parseArgs(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write('启动失败：' + err.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = {
  start: start,
  parseArgs: parseArgs,
  safeStaticPath: safeStaticPath
};

