/* ============================================================
 * js/engine/report.js — CppLab.Report
 * 儿童即时反馈、教师画像、家长报告草稿/确认/打印
 * owner: evidence-report ｜ 依据: CONTRACT §11 / 方案定稿 §5.5-5.6、§12.2
 *
 * 纯逻辑模块：Node 兼容，顶层不访问 document/window。
 * 红线：儿童端输出不含 D 维度、分数、支架档位（E/S/A）字样；
 *      家长报告不输出智力/人格/长期能力结论；
 *      未经教师确认的报告不得进入打印页。
 * ============================================================ */
var CppLab = (typeof window !== 'undefined') ? (window.CppLab = window.CppLab || {}) : (globalThis.CppLab = globalThis.CppLab || {});

(function () {
  'use strict';

  /* ---------- 会话获取（与 evidence.js 相同策略：Storage 优先，内存兜底） ---------- */
  function hasStorage() {
    return !!(CppLab.Storage && typeof CppLab.Storage.load === 'function' && typeof CppLab.Storage.update === 'function');
  }

  function getSession() {
    if (hasStorage()) {
      var s = CppLab.Storage.load();
      if (s && typeof s === 'object') { return s; }
    }
    if (!CppLab.__memSession) {
      /* 让 Evidence 建立兜底会话，保证两个模块共享同一份 */
      if (CppLab.Evidence && typeof CppLab.Evidence.getAll === 'function') {
        CppLab.Evidence.getAll();
      }
      if (!CppLab.__memSession) {
        CppLab.__memSession = { evidence: [], reports: { draft: null, confirmed: null }, hintsUsed: {}, lessons: {} };
      }
    }
    return CppLab.__memSession;
  }

  function updateSession(mutator) {
    if (hasStorage()) {
      CppLab.Storage.update(function (s) {
        if (!s || typeof s !== 'object') { s = {}; }
        mutator(s);
        return s;
      });
      return;
    }
    mutator(getSession());
  }

  function requireEvidence() {
    if (!CppLab.Evidence || typeof CppLab.Evidence.summarize !== 'function') {
      throw new Error('Report: 需要先加载 evidence.js（CppLab.Evidence 不存在）');
    }
    return CppLab.Evidence;
  }

  function isNumericOutcome(v) {
    return v === 0 || v === 1 || v === 2 || v === 3;
  }

  /* ---------- 文案常量 ---------- */
  var SUPPORT_DESC = {
    S0: '无提示',
    S1: '仅重复题意',
    S2: '一次概念提示',
    S3: '给出部分结构',
    S4: '演示一个步骤'
  };
  var OUTCOME_DESC = {
    0: '在示范和逐步帮助下进行了尝试',
    1: '在明确步骤或范例下完成了任务',
    2: '在同类新任务中独立完成',
    3: '能够解释思路并迁移到新情境'
  };
  var PATH_LABEL = { E: '探索线', S: '标准线', A: '加速线' };
  var CONFIDENCE_LABEL = { low: '低', medium: '中', high: '高' };
  var VARIANT_SCAFFOLD_DESC = {
    E: '图块与单步动画支架',
    S: '代码槽与半开放代码',
    A: '自由编辑挑战'
  };

  /* 家长报告禁用表述（方案 12.2 报告可信度） */
  var BANNED_PATTERN = /(智力|智商|IQ|人格|天赋|长期能力|性格缺陷|聪明程度|资质平庸)/;

  var TAGS = { OBSERVED: '已观察', PRELIM: '初步判断', PENDING: '待验证' };

  /* ============================================================
   * 儿童即时反馈（方案 5.5）
   * 红线：不出现维度编号、分数、支架档位字样，只有徽章和鼓励。
   * ============================================================ */
  var BADGE_DEFS = [
    { dim: 'D2',  icon: '🧭', title: '顺序导航员', desc: '你发现了：命令的先后顺序会改变结果！' },
    { dim: 'D3',  icon: '🔋', title: '能量管理员', desc: '你能一步一步追踪能量的变化，一格都不漏！' },
    { dim: 'D4',  icon: '📦', title: '变量收藏家', desc: '你知道变量保存的是"现在"的状态，不是死数字！' },
    { dim: 'D5',  icon: '🚪', title: '规则守门员', desc: '你明白了：规则只在条件成立的时候才会执行！' },
    { dim: 'D6',  icon: '🗺️', title: '任务规划师', desc: '你能把大任务拆成一个个小步骤，像真正的指挥官！' },
    { dim: 'D7',  icon: '⚙️', title: '函数机械师', desc: '你看懂了这台神奇机器：放进输入，加工后送出输出！' },
    { dim: 'D8',  icon: '🔍', title: '错误侦探', desc: '你找到了程序里藏起来的问题，好眼力！' },
    { dim: 'D9',  icon: '🚀', title: '举一反三小达人', desc: '刚学会的本领，你马上用在了新任务上！' },
    { dim: 'D11', icon: '💬', title: '讲解达人', desc: '你能说清楚自己是怎么想的，这可是大本事！' }
  ];
  var FALLBACK_BADGE = { icon: '🌟', title: '勇敢探索者', desc: '今天你敢于尝试新任务，这是最棒的开始！' };

  var LEARNED_SENTENCES = {
    D2: '程序是一行一行、按顺序执行的。',
    D3: '变量的值会一步一步变化，我可以追踪它。',
    D4: '变量不是一直不变的数字，它保存的是现在的状态。',
    D5: '条件是一个可以回答"真"或"假"的问题。',
    D6: '大任务可以拆成一个个小步骤来完成。',
    D7: '函数像一台机器：放进输入，加工后给出输出。',
    D8: '出错不可怕，看看变量的值就能找到线索。',
    D9: '学会一个新本领后，我能把它用到不一样的题目里。',
    D11: '不懂的时候，我可以说出"我卡在哪里"再求助。'
  };

  var NEXT_PREVIEW = {
    trial: '下一次，你会亲手指挥机器人的能量站：一行一行改变能量，让它刚好达到目标值！',
    lesson1: '下一次，你会给舱门写规则，让程序自己决定打开还是关闭。',
    lesson2: '下一次，你会和程序对话：告诉它名字和目的地，它会为你规划路线！'
  };

  function lessonEvidence(lessonId) {
    var all = requireEvidence().getAll();
    if (!lessonId) { return all; }
    var prefix = lessonId + '-';
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (typeof all[i].activityId === 'string' && all[i].activityId.indexOf(prefix) === 0) {
        out.push(all[i]);
      }
    }
    return out;
  }

  function childFeedback(lessonId) {
    var list = lessonEvidence(lessonId);
    var i;

    /* 本课各维度最好成绩 + 是否有自我修正（自我修正是正向证据，方案 5.1） */
    var best = {};
    var selfFix = {};
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (isNumericOutcome(e.outcome)) {
        best[e.dimension] = Object.prototype.hasOwnProperty.call(best, e.dimension)
          ? Math.max(best[e.dimension], e.outcome) : e.outcome;
      }
      if (e.selfCorrection === true) { selfFix[e.dimension] = true; }
    }

    var badges = [];
    for (i = 0; i < BADGE_DEFS.length; i++) {
      var def = BADGE_DEFS[i];
      var b = best[def.dim];
      var earned = (isNumericOutcome(b) && b >= 2) || (isNumericOutcome(b) && b >= 1 && selfFix[def.dim] === true);
      if (earned) {
        badges.push({ icon: def.icon, title: def.title, desc: def.desc });
      }
      if (badges.length >= 4) { break; } /* 最多 4 枚，注意力稀缺 */
    }
    if (badges.length === 0) {
      badges.push({ icon: FALLBACK_BADGE.icon, title: FALLBACK_BADGE.title, desc: FALLBACK_BADGE.desc });
    }

    /* 今天真正学会的一件事：从观察到的维度生成选项，孩子自选或口头补全 */
    var options = [];
    var seen = {};
    for (i = 0; i < list.length; i++) {
      var d = list[i].dimension;
      if (!seen[d] && LEARNED_SENTENCES[d] && isNumericOutcome(best[d]) && best[d] >= 1) {
        seen[d] = true;
        options.push(LEARNED_SENTENCES[d]);
      }
      if (options.length >= 4) { break; }
    }
    if (options.length === 0) {
      options.push('我今天让机器人动起来了！');
    }
    options.push('我想自己说一件今天学会的事。');

    var preview = NEXT_PREVIEW[lessonId] || '下一次，你会解锁新的机器人任务，等你来挑战！';

    return {
      badges: badges,
      learnedOne: { options: options },
      nextPreview: preview
    };
  }

  /* ============================================================
   * teacherProfile() — D1-D12 向量表 + 兴趣类别 + 提示统计
   * ============================================================ */
  function teacherProfile() {
    var Evidence = requireEvidence();
    var session = getSession();
    var sum = Evidence.summarize();

    var dimensions = [];
    for (var i = 0; i < Evidence.DIMENSIONS.length; i++) {
      var d = Evidence.DIMENSIONS[i];
      dimensions.push({
        dimension: d,
        name: Evidence.DIM_INFO[d].name,
        best: sum[d].best,
        count: sum[d].count,
        evidenceIds: sum[d].evidenceIds.slice()
      });
    }

    var interests = (session.lessons && session.lessons.trial && Array.isArray(session.lessons.trial.interests))
      ? session.lessons.trial.interests.slice() : [];

    var hintsUsed = session.hintsUsed || {};
    var byLevel = { H1: 0, H2: 0, H3: 0, H4: 0, H5: 0 };
    var byActivity = {};
    var total = 0;
    for (var actId in hintsUsed) {
      if (!Object.prototype.hasOwnProperty.call(hintsUsed, actId)) { continue; }
      var levels = hintsUsed[actId];
      if (!Array.isArray(levels)) { continue; }
      byActivity[actId] = levels.slice();
      for (var j = 0; j < levels.length; j++) {
        total += 1;
        if (Object.prototype.hasOwnProperty.call(byLevel, levels[j])) {
          byLevel[levels[j]] += 1;
        }
      }
    }

    return {
      dimensions: dimensions,
      interests: interests,
      hintStats: { total: total, byLevel: byLevel, byActivity: byActivity },
      pathSuggestion: Evidence.pathSuggestion()
    };
  }

  /* ============================================================
   * parentReportDraft() — 九个 section 按方案 5.6
   * 每条 item = {text, tag:'已观察'|'初步判断'|'待验证', evidenceRefs:[..]}
   * 文案禁止智力/人格/长期能力结论。
   * ============================================================ */
  function trimText(t, max) {
    t = String(t || '');
    return t.length > max ? t.slice(0, max) + '……' : t;
  }

  /**
   * 推荐依据的家长版措辞（QA P2）：pathSuggestion.reasons 是教师/内部口径
   * （0–3 尺度、outcome、维度行话），家长没有尺度背景，直接放进报告像密码。
   * 这里做内部行话 → 自然语言的映射；教师端看的仍是原始 reasons（不经此函数）。
   */
  function parentReasonText(r) {
    var t = String(r == null ? '' : r);
    t = t.replace(/核心维度中有\s*(\d+)\s*个处于\s*0[–-]1[：:]\s*/g, '有 $1 个核心思维环节目前需要较多支持（');
    if (/核心思维环节目前需要较多支持（/.test(t) && t.indexOf('）') < 0) { t += '）'; }
    t = t.replace(/未触发探索线条件（核心维度没有出现三个及以上\s*0[–-]1）/g, '大部分核心思维环节都能在少量支持下完成');
    t = t.replace(/新情境迁移达到\s*2[–-]3/g, '能把学到的方法用到新题目上');
    t = t.replace(/完成度高（outcome\s*≥\s*2）/g, '多数任务能独立完成');
    t = t.replace(/outcome\s*≥\s*2/g, '能独立完成');
    t = t.replace(/加速线全部证据同时出现[：:]?/g, '同时观察到以下几方面的扎实表现：');
    t = t.replace(/尚未同时满足加速线全部证据，缺少[：:]/g, '还有几方面想再多观察一些：');
    t = t.replace(/限制生效[：:]自称学过 C\+\+，但状态追踪证据不足（弱或未观察），按规则不进入加速线/g,
      '孩子提到学过 C++，我们会在课程中进一步验证相应基础后再考虑加速');
    t = t.replace(/限制生效[：:]数学与符号基础表现好，但按规则不单独提升编程路径/g,
      '数学与符号基础表现好；编程起点还会综合其他表现来定');
    t = t.replace(/另[：:]自称学过 C\+\+，但状态追踪证据不足，同样不满足加速线条件/g,
      '孩子提到学过 C++，相应基础我们会在课程中继续验证');
    return t;
  }

  function item(text, tag, refs) {
    return { text: text, tag: tag, evidenceRefs: Array.isArray(refs) ? refs.slice() : [] };
  }

  function parentReportDraft() {
    var Evidence = requireEvidence();
    var session = getSession();
    var sum = Evidence.summarize();
    var all = Evidence.getAll();
    var i, d, e;

    var byDim = {};
    for (i = 0; i < all.length; i++) {
      e = all[i];
      if (!byDim[e.dimension]) { byDim[e.dimension] = []; }
      byDim[e.dimension].push(e);
    }

    var sections = [];

    /* --- 1. 试听概况 --- */
    var dateText = (session.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    var durationText = '—';
    if (all.length >= 2) {
      var t0 = Date.parse(all[0].timestamp);
      var t1 = Date.parse(all[all.length - 1].timestamp);
      if (!isNaN(t0) && !isNaN(t1) && t1 > t0) {
        durationText = '约 ' + Math.max(1, Math.round((t1 - t0) / 60000)) + ' 分钟';
      }
    }
    var scaffoldsSeen = {};
    for (i = 0; i < all.length; i++) { scaffoldsSeen[all[i].variant] = true; }
    var scaffoldNames = [];
    ['E', 'S', 'A'].forEach(function (v) {
      if (scaffoldsSeen[v]) { scaffoldNames.push(VARIANT_SCAFFOLD_DESC[v]); }
    });
    var interests = (session.lessons && session.lessons.trial && Array.isArray(session.lessons.trial.interests))
      ? session.lessons.trial.interests : [];
    var overviewItems = [
      item('试听日期：' + dateText + '；课堂用时：' + durationText + '。', TAGS.OBSERVED, []),
      item('课堂中使用的支持方式：' + (scaffoldNames.length ? scaffoldNames.join('、') : '以现场引导为主') + '。', TAGS.OBSERVED, [])
    ];
    if (interests.length > 0) {
      overviewItems.push(item('孩子选择的兴趣主题：' + interests.join('、') + '。', TAGS.OBSERVED, []));
    }
    sections.push({ key: 'overview', title: '一、试听概况', items: overviewItems });

    /* --- 2. 已观察能力（每项带任务证据与支持等级） --- */
    var observedItems = [];
    for (i = 0; i < Evidence.DIMENSIONS.length; i++) {
      d = Evidence.DIMENSIONS[i];
      if (!isNumericOutcome(sum[d].best) || sum[d].best < 1) { continue; }
      var recs = byDim[d] || [];
      var bestRec = null;
      for (var j = 0; j < recs.length; j++) {
        if (isNumericOutcome(recs[j].outcome) &&
            (!bestRec || recs[j].outcome > bestRec.outcome)) {
          bestRec = recs[j];
        }
      }
      if (!bestRec) { continue; }
      var taskDesc = bestRec.taskPrompt ? '在「' + trimText(bestRec.taskPrompt, 30) + '」任务中，' : '在相关课堂任务中，';
      observedItems.push(item(
        taskDesc + '孩子在' + (SUPPORT_DESC[bestRec.supportLevel] || '课堂支持') + '的情况下，' +
        OUTCOME_DESC[sum[d].best] + '（' + Evidence.DIM_INFO[d].name + '）。' +
        (bestRec.selfCorrection ? '过程中孩子自己发现并修正了错误，这是很好的迹象。' : ''),
        TAGS.OBSERVED,
        sum[d].evidenceIds
      ));
    }
    if (observedItems.length === 0) {
      observedItems.push(item('本次试听以熟悉环境和建立兴趣为主，能力观察将在后续课程中逐步展开。', TAGS.PENDING, []));
    }
    sections.push({ key: 'observedAbilities', title: '二、已观察能力', items: observedItems });

    /* --- 3. 本次学到的内容（区分既有能力与现场学会） --- */
    var learnedItems = [];
    for (i = 0; i < Evidence.DIMENSIONS.length; i++) {
      d = Evidence.DIMENSIONS[i];
      var seq = (byDim[d] || []).filter(function (r) { return isNumericOutcome(r.outcome); });
      if (seq.length === 0) { continue; }
      var first = seq[0].outcome;
      var last = seq[seq.length - 1].outcome;
      var ids = seq.map(function (r) { return r.id; });
      if (seq.length >= 2 && first <= 1 && last >= 2) {
        learnedItems.push(item(
          '「' + Evidence.DIM_INFO[d].name + '」是本次现场学会的：开始需要引导，课程后段已能独立完成同类任务。',
          TAGS.OBSERVED, ids
        ));
      } else if (first >= 2 && last >= 2) {
        learnedItems.push(item(
          '「' + Evidence.DIM_INFO[d].name + '」表现为既有基础：进入任务即能独立完成，无需现场教学。',
          TAGS.PRELIM, ids
        ));
      }
    }
    if (learnedItems.length === 0) {
      learnedItems.push(item('本次观察量还不足以区分既有基础与现场学会的内容，将在后续课程中继续确认。', TAGS.PENDING, []));
    }
    sections.push({ key: 'learnedToday', title: '三、本次学到的内容', items: learnedItems });

    /* --- 4. 兴趣与参与方式 --- */
    var engageItems = [];
    if (interests.length > 0) {
      engageItems.push(item('孩子明确表达的兴趣类别：' + interests.join('、') + '。', TAGS.OBSERVED, []));
    }
    var selfFixCount = 0;
    var retryCount = 0;
    for (i = 0; i < all.length; i++) {
      if (all[i].selfCorrection === true) { selfFixCount += 1; }
      if (all[i].attemptCount >= 2) { retryCount += 1; }
    }
    if (selfFixCount > 0) {
      engageItems.push(item('课堂中孩子有 ' + selfFixCount + ' 次自己发现并修正错误，说明愿意检查自己的想法。', TAGS.OBSERVED, []));
    }
    if (retryCount > 0) {
      engageItems.push(item('遇到没做对的任务时，孩子愿意再次尝试（多次尝试共 ' + retryCount + ' 个任务）。', TAGS.OBSERVED, []));
    }
    engageItems.push(item('孩子更偏好的参与方式（预测、构建、调试、故事或竞争），建议由授课老师在此补充现场观察。', TAGS.PRELIM, []));
    sections.push({ key: 'interestEngagement', title: '四、兴趣与参与方式', items: engageItems });

    /* --- 5. 当前边界（中性描述） --- */
    var boundaryItems = [];
    for (i = 0; i < Evidence.DIMENSIONS.length; i++) {
      d = Evidence.DIMENSIONS[i];
      if (sum[d].best !== 0 && sum[d].best !== 1) { continue; }
      var recs2 = byDim[d] || [];
      var maxSupport = 'S0';
      for (var j2 = 0; j2 < recs2.length; j2++) {
        if (recs2[j2].supportLevel > maxSupport) { maxSupport = recs2[j2].supportLevel; }
      }
      boundaryItems.push(item(
        '面对「' + Evidence.DIM_INFO[d].name + '」类任务时，当前需要' + (SUPPORT_DESC[maxSupport] || '课堂支持') +
        '级别的支持；这是本阶段的正常起点，会随课程推进重新评估。',
        TAGS.OBSERVED, sum[d].evidenceIds
      ));
    }
    if (boundaryItems.length === 0) {
      boundaryItems.push(item('本次未观察到需要特别说明的边界；后续课程将在更复杂的任务中继续确认。', TAGS.PENDING, []));
    }
    sections.push({ key: 'currentBoundaries', title: '五、当前边界', items: boundaryItems });

    /* --- 6. 推荐起点 --- */
    var ps = Evidence.pathSuggestion();
    var coreRefs = [];
    for (i = 0; i < Evidence.CORE_DIMS.length; i++) {
      coreRefs = coreRefs.concat(sum[Evidence.CORE_DIMS[i]].evidenceIds);
    }
    sections.push({
      key: 'recommendedStart',
      title: '六、推荐起点',
      items: [
        item('推荐从「' + PATH_LABEL[ps.suggested] + '」起步（置信度：' + CONFIDENCE_LABEL[ps.confidence] + '）。', TAGS.PRELIM, coreRefs),
        item('推荐依据：' + ps.reasons.map(parentReasonText).join('；'), TAGS.PRELIM, coreRefs),
        item('三条线共享同一故事与成果，起点只决定支持方式，课程中可随表现上下调整。', TAGS.PRELIM, [])
      ]
    });

    /* --- 7. 12 课预期成果 --- */
    sections.push({
      key: 'expectedOutcomes',
      title: '七、12 课预期成果',
      items: [
        item('完成一个可以真实运行的 C++ 入门作品。', TAGS.PENDING, []),
        item('能用自己的话解释变量、条件、循环和函数。', TAGS.PENDING, []),
        item('能独立进行基本的测试与调试。', TAGS.PENDING, []),
        item('能适龄地使用 AI 寻求提示，并学会验证 AI 的回答。', TAGS.PENDING, [])
      ]
    });

    /* --- 8. 待复核假设（含未观察维度） --- */
    var hypoItems = [
      item('是否能独立使用文本编辑器，需在正式课程中确认。', TAGS.PENDING, []),
      item('既往编程经验是否稳定，需通过实际任务再次验证。', TAGS.PENDING, []),
      item('新学会的概念（如函数迁移）间隔一周后能否保持，需下次课复核。', TAGS.PENDING, [])
    ];
    for (i = 0; i < Evidence.DIMENSIONS.length; i++) {
      d = Evidence.DIMENSIONS[i];
      if (sum[d].best === 'N') {
        hypoItems.push(item(
          '「' + Evidence.DIM_INFO[d].name + '」本次未观察；未观察不代表不会，将在后续课程中安排相应任务。',
          TAGS.PENDING, []
        ));
      }
    }
    sections.push({ key: 'hypothesesToVerify', title: '八、待复核假设', items: hypoItems });

    /* --- 9. 家庭支持建议 --- */
    sections.push({
      key: 'familySupport',
      title: '九、家庭支持建议',
      items: [
        item('每周花 5–15 分钟，请孩子把本周的程序展示给家人并讲一讲。', TAGS.PRELIM, []),
        item('不需要家长代写代码；卡住时鼓励孩子先说出"我卡在哪一步"。', TAGS.PRELIM, []),
        item('多问一句"这个程序为什么会这样运行"，让孩子当小老师来解释。', TAGS.PRELIM, [])
      ]
    });

    var draft = {
      createdAt: new Date().toISOString(),
      nickname: session.nickname || '',
      sections: sections,
      meta: { generatedBy: 'CppLab.Report', needsTeacherConfirm: true }
    };

    /* 自检：草稿不得含禁用表述 */
    var bannedHit = findBanned(draft);
    if (bannedHit) {
      throw new Error('Report.parentReportDraft: 生成文案包含禁用表述「' + bannedHit + '」，请检查证据文本');
    }

    updateSession(function (s) {
      if (!s.reports || typeof s.reports !== 'object') { s.reports = { draft: null, confirmed: null }; }
      s.reports.draft = draft;
    });
    return draft;
  }

  function findBanned(report) {
    var texts = [];
    var sections = (report && report.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      texts.push(String(sections[i].title || ''));
      var items = sections[i].items || [];
      for (var j = 0; j < items.length; j++) {
        texts.push(String(items[j].text || ''));
      }
    }
    var m = texts.join('\n').match(BANNED_PATTERN);
    return m ? m[0] : null;
  }

  /* ============================================================
   * confirmReport(editedDraft) — 教师确认后才有 confirmed；
   * 打印页只用 confirmed（红线 6）。
   * ============================================================ */
  function confirmReport(editedDraft) {
    if (!editedDraft || !Array.isArray(editedDraft.sections) || editedDraft.sections.length === 0) {
      throw new Error('Report.confirmReport: 需要包含 sections 的报告草稿');
    }
    var bannedHit = findBanned(editedDraft);
    if (bannedHit) {
      throw new Error('Report.confirmReport: 报告包含禁用表述「' + bannedHit + '」，不能确认；请修改后重试');
    }
    var confirmed = JSON.parse(JSON.stringify(editedDraft));
    confirmed.confirmedAt = new Date().toISOString();
    confirmed.confirmedBy = 'teacher';
    if (confirmed.meta) { confirmed.meta.needsTeacherConfirm = false; }
    updateSession(function (s) {
      if (!s.reports || typeof s.reports !== 'object') { s.reports = { draft: null, confirmed: null }; }
      s.reports.confirmed = confirmed;
    });
    return confirmed;
  }

  function getConfirmedReport() {
    var s = getSession();
    return (s.reports && s.reports.confirmed) ? s.reports.confirmed : null;
  }

  /* ============================================================
   * printableHTML(report) — 自包含内联样式的打印页 HTML。
   * 只接受教师已确认的报告；否则抛错（红线 6）。
   * ============================================================ */
  function escapeHtml(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var TAG_STYLE = {
    '已观察':  'background:#e8f7ee;color:#166534;border:1px solid #86efac;',
    '初步判断': 'background:#eef4ff;color:#1e40af;border:1px solid #93c5fd;',
    '待验证':  'background:#fff7e8;color:#92400e;border:1px solid #fcd34d;'
  };
  var TAG_MARK = { '已观察': '✓', '初步判断': '~', '待验证': '?' };

  function printableHTML(report) {
    var r = report || getConfirmedReport();
    if (!r || !r.confirmedAt) {
      throw new Error('Report.printableHTML: 家长报告未经教师确认，不能进入打印页');
    }
    var parts = [];
    parts.push('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">');
    parts.push('<title>试听课家长报告</title></head>');
    parts.push('<body style="margin:0;padding:32px;background:#ffffff;color:#1e293b;' +
      'font-family:system-ui,-apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;' +
      'font-size:15px;line-height:1.7;">');
    parts.push('<div style="max-width:720px;margin:0 auto;">');
    parts.push('<h1 style="font-size:24px;margin:0 0 4px;">《九岁儿童 C++ 互动课程》试听课家长报告</h1>');
    var who = r.nickname ? '学员昵称：' + escapeHtml(r.nickname) + '　' : '';
    parts.push('<p style="color:#64748b;margin:0 0 6px;">' + who +
      '教师确认时间：' + escapeHtml(String(r.confirmedAt).slice(0, 10)) + '</p>');
    parts.push('<p style="color:#64748b;font-size:13px;margin:0 0 20px;border-bottom:2px solid #e2e8f0;padding-bottom:12px;">' +
      '说明：报告中每条内容都标注了性质——「✓ 已观察」有课堂任务直接证据；「~ 初步判断」是教师基于现场表现的判断；' +
      '「? 待验证」将在后续课程中确认。本报告描述的是本次课堂中的具体表现，不代表对孩子的整体评价。</p>');

    var sections = r.sections || [];
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      parts.push('<h2 style="font-size:17px;margin:22px 0 8px;color:#0f172a;">' + escapeHtml(sec.title || '') + '</h2>');
      parts.push('<ul style="margin:0;padding-left:0;list-style:none;">');
      var items = sec.items || [];
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var tag = it.tag || '待验证';
        var style = TAG_STYLE[tag] || TAG_STYLE['待验证'];
        var mark = TAG_MARK[tag] || '?';
        parts.push('<li style="margin:0 0 8px;padding:8px 12px;background:#f8fafc;border-radius:8px;">');
        parts.push('<span style="display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;margin-right:8px;' +
          style + '">' + mark + ' ' + escapeHtml(tag) + '</span>');
        parts.push('<span>' + escapeHtml(it.text || '') + '</span>');
        parts.push('</li>');
      }
      parts.push('</ul>');
    }

    parts.push('<p style="margin-top:28px;padding-top:12px;border-top:2px solid #e2e8f0;color:#64748b;font-size:13px;">' +
      '本报告由课程系统辅助生成，并已经授课教师逐条确认。如对任何一条描述有疑问，欢迎与教师沟通并查看对应的课堂任务记录。</p>');
    parts.push('</div></body></html>');
    return parts.join('');
  }

  /* ---------- 导出 ---------- */
  CppLab.Report = {
    childFeedback: childFeedback,
    teacherProfile: teacherProfile,
    parentReportDraft: parentReportDraft,
    confirmReport: confirmReport,
    getConfirmedReport: getConfirmedReport,
    printableHTML: printableHTML
  };

})();

if (typeof module !== 'undefined' && module.exports) { module.exports = CppLab.Report; }
