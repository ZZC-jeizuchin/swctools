// ai-check.js — SwC AI 诊断脚本
// 用法：在 ai.html 末尾，三个 <script src="ai-*.js"> 之后加：
//   <script src="ai-check.js"></script>
(function () {
  "use strict";

  // ═══════════════════ 面板 ═══════════════════
  var panel, body;
  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = '__swcCheck';
    panel.style.cssText = [
      'position:fixed', 'right:8px', 'bottom:8px', 'width:min(560px,96vw)',
      'max-height:70vh', 'overflow:auto', 'background:#0b1220', 'color:#cfe3ff',
      'font:12px/1.5 ui-monospace,Consolas,monospace', 'padding:10px 12px',
      'border:1px solid #2a4a7a', 'border-radius:10px', 'z-index:2147483647',
      'box-shadow:0 8px 32px rgba(0,0,0,.5)', 'white-space:pre-wrap',
      'word-break:break-all'
    ].join(';');
    body = document.createElement('div');
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #2a4a7a;';
    head.innerHTML = '<b style="flex:1;color:#7fd1ff;">🔎 SwC 自检</b>';
    var btnRe = document.createElement('button');
    btnRe.textContent = '重跑';
    btnRe.style.cssText = 'background:#1b3a5c;color:#cfe3ff;border:1px solid #2a4a7a;border-radius:5px;padding:3px 10px;cursor:pointer;font:inherit;';
    btnRe.onclick = function () { run(); };
    var btnCopy = document.createElement('button');
    btnCopy.textContent = '复制';
    btnCopy.style.cssText = btnRe.style.cssText;
    btnCopy.onclick = function () {
      var t = body.innerText;
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(function(){ btnCopy.textContent='已复制'; setTimeout(function(){btnCopy.textContent='复制';}, 1200); });
    };
    var btnHide = document.createElement('button');
    btnHide.textContent = '隐藏';
    btnHide.style.cssText = btnRe.style.cssText;
    btnHide.onclick = function () { panel.style.display = 'none'; };
    head.appendChild(btnRe); head.appendChild(btnCopy); head.appendChild(btnHide);
    panel.appendChild(head);
    panel.appendChild(body);
    document.body.appendChild(panel);

    // 小徽标：面板隐藏后可点开
    var badge = document.createElement('div');
    badge.textContent = '🔎';
    badge.style.cssText = 'position:fixed;right:8px;bottom:8px;width:32px;height:32px;line-height:32px;text-align:center;background:#1b3a5c;color:#cfe3ff;border:1px solid #2a4a7a;border-radius:50%;cursor:pointer;z-index:2147483646;display:none;font-size:16px;';
    badge.onclick = function () { panel.style.display = 'block'; badge.style.display = 'none'; };
    document.body.appendChild(badge);
    var origHide = btnHide.onclick;
    btnHide.onclick = function () { panel.style.display = 'none'; badge.style.display = 'block'; };
  }

  function log(s) { ensurePanel(); body.textContent += s + '\n'; }
  function logHTML(s) { ensurePanel(); body.insertAdjacentHTML('beforeend', s + '\n'); }
  function clearLog() { ensurePanel(); body.textContent = ''; }

  // ═══════════════════ 全局错误捕获 ═══════════════════
  window.addEventListener('error', function (e) {
    log('[❌ ERROR] ' + (e.message || '?') + '  @ ' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?'));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    log('[❌ REJECT] ' + ((r && (r.stack || r.message)) || r));
  });

  // ═══════════════════ 工具 ═══════════════════
  function typed(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    return typeof v;
  }
  function mark(bool) { return bool ? '✅' : '❌'; }

  // 检查一段 JS 源码语法是否合法（不执行）
  function syntaxCheck(src) {
    try {
      new Function(src);
      return null;
    } catch (e) {
      return e.message || String(e);
    }
  }

  // 把不可见/可疑字符转义成 <U+XXXX>
  var SUSPECT = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF\u00A0\u2018\u2019\u201C\u201D\u2013\u2014\u3000]/g;
  function revealLine(s) {
    return s.replace(SUSPECT, function (c) {
      return '<U+' + c.codePointAt(0).toString(16).toUpperCase() + '>';
    });
  }

  // 找到语法错误所在行：逐步截断再 check
  function locateSyntaxError(src) {
    var lines = src.split('\n');
    // 二分找第一个让整体失败的行（保守做法：逐行累加，第一次失败的累加块大概是问题行）
    var acc = '';
    for (var i = 0; i < lines.length; i++) {
      acc += lines[i] + '\n';
      var err = syntaxCheck(acc);
      if (err) {
        // 问题可能在当前行，也可能在之前某行未闭合
        return { line: i + 1, message: err, lineText: lines[i] };
      }
    }
    return null;
  }

  // ═══════════════════ 检查项 ═══════════════════
  async function checkSWC() {
    var SWC = window.SWC;
    log('── SWC 命名空间 ──');
    log('  typeof SWC: ' + typed(SWC));
    if (!SWC) { log('  ❌ SWC 未定义，core 没执行'); return; }

    var groups = {
      'core 基础': ['applyTheme', 'uuid', 'esc', 'fmtTime', 'getToken', 'showDiag', 'showToast', 'md',
                    'setCookie', 'getCookie', 'delCookie', 'defaultModelConfig', 'defaultSearchConfig',
                    'loadModelConfigIndex', 'loadModelConfigs', 'saveModelConfig', 'curModelConfig', 'modelConfigById',
                    'loadSearchConfigIndex', 'loadSearchConfigs', 'saveSearchConfig', 'curSearchConfig',
                    'cloudApi', 'syncAll', 'syncOne', 'checkState', 'strictDelete',
                    'syncModelConfigAll', 'syncModelConfigOne', 'checkModelConfigState', 'strictDeleteModelConfig',
                    'syncSearchConfigAll', 'syncSearchConfigOne', 'checkSearchConfigState', 'strictDeleteSearchConfig',
                    'performSearch', 'buildToolsDefinition', 'buildToolResultText', 'buildSearchContextFromResults',
                    'dedupeResults', 'isModelSupportTools', 'markModelNoToolSupport',
                    'loadSyncStates', 'setSyncState', 'getSyncState', 'delSyncState',
                    'loadModelsCache', 'saveModelsCache', 'loadToolSupportCache', 'saveToolSupportCache',
                    'isToolsUnsupportedError', 'isCloudflareEndpoint', 'upgradeMeta', 'updateProgress',
                    'isDebugMode', 'setDebugMode', 'debugLog', 'debugError',
                    'loadConv', 'newConv', 'delConv', 'touchConv', 'S', 'CTX', 'state'],
      'chat 发送':  ['copyText', 'fallbackCopy', 'toggleMark', 'deleteTurn', 'resendTurn', 'send', 'buildRefsPanel'],
      'ui 渲染':    ['renderChat', 'renderConvList', 'renderModelManagerList', 'renderSearchManagerList',
                    'openModelEdit', 'openSearchEdit', 'updateSendButton', 'updateConfigLabel',
                    'updateModelLabel', 'updateSearchLabel', 'updateSearchEnabledCheck', 'updateDebugButton',
                    'autoScroll']
    };

    for (var g in groups) {
      log('  ── ' + g + ' ──');
      groups[g].forEach(function (k) {
        var v = SWC[k];
        var ok = v !== undefined && v !== null;
        log('    ' + mark(ok) + ' SWC.' + k + '  → ' + typed(v));
      });
    }

    if (SWC.state) {
      var s = SWC.state;
      log('  ── state 关键字段 ──');
      log('    curId: ' + typed(s.curId));
      log('    curMeta: ' + typed(s.curMeta));
      log('    curTurns.length: ' + (Array.isArray(s.curTurns) ? s.curTurns.length : typed(s.curTurns)));
      log('    modelConfigs.length: ' + (Array.isArray(s.modelConfigs) ? s.modelConfigs.length : typed(s.modelConfigs)));
      log('    currentModelConfigId: ' + typed(s.currentModelConfigId));
      log('    searchConfigs.length: ' + (Array.isArray(s.searchConfigs) ? s.searchConfigs.length : typed(s.searchConfigs)));
      log('    currentSearchConfigId: ' + typed(s.currentSearchConfigId));
      log('    modelsCache.length: ' + (Array.isArray(s.modelsCache) ? s.modelsCache.length : typed(s.modelsCache)));
      log('    runningConvs instanceof Map: ' + (s.runningConvs instanceof Map));
    }
  }

  function checkDOM() {
    log('── DOM 关键元素 ──');
    var ids = ['chat', 'input', 'btnSend', 'convList', 'convTitle',
               'btnConfig', 'configLabel', 'btnModel', 'modelLabel',
               'btnSearch', 'searchLabel', 'btnReason', 'reasonLabel',
               'configPopup', 'modelPopup', 'searchPopup', 'reasonPopup', 'cloudPopup',
               'popupMask', 'diagModal', 'toast', 'welcome',
               'btnNewConv', 'btnCloud', 'btnDlAll', 'btnTheme', 'btnMenu',
               'convMenu', 'sidebar', 'sidebarMask',
               'modelManagerModal', 'modelEditModal', 'searchManagerModal', 'searchEditModal',
               'meName', 'meProxyUrl', 'meProxyPassword', 'meApiBase', 'meFallbackModelsUrl',
               'meManualModels', 'meModelMode', 'meCfAccountId', 'meApiKey', 'meSystem',
               'meTemperature', 'meAutoCollapse', 'meCtxWindow', 'meSummaryThreshold',
               'seName', 'seProxyUrl', 'seProxyPassword', 'seProvider', 'seTavilyKey',
               'seSerperKey', 'seMode', 'seMaxRounds', 'seSystemHint', 'seEnabled'];
    var missing = [];
    ids.forEach(function (id) {
      var ok = !!document.getElementById(id);
      if (!ok) missing.push(id);
    });
    if (missing.length === 0) log('  ✅ 所有 ' + ids.length + ' 个元素都找到');
    else log('  ❌ 缺失 ' + missing.length + ' 个: ' + missing.join(', '));

    log('  #convList 子元素数: ' + document.querySelectorAll('#convList > *').length);
    log('  #chat 子元素数: ' + document.querySelectorAll('#chat > *').length);
    log('  data-theme: ' + document.documentElement.getAttribute('data-theme'));
  }

  async function checkFile(url) {
    log('── 文件检查: ' + url + ' ──');
    var res, text;
    try {
      res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
      text = await res.text();
    } catch (e) {
      log('  ❌ 拉取失败: ' + (e && e.message));
      return;
    }
    if (!res.ok) { log('  ❌ HTTP ' + res.status); return; }
    var lines = text.split('\n');
    log('  HTTP ' + res.status + '，大小 ' + text.length + ' 字节，' + lines.length + ' 行');
    var first = [...text.slice(0, 3)].map(function (c) { return c.codePointAt(0).toString(16); }).join(' ');
    log('  首 3 字符 codepoint: ' + first + (first.indexOf('feff') === 0 ? '  ⚠️ 有 BOM' : ''));
    var err = syntaxCheck(text);
    if (!err) { log('  ✅ 语法检查通过'); return; }
    log('  ❌ 语法错误: ' + err);
    var loc = locateSyntaxError(text);
    if (loc) {
      log('  ➜ 疑似出错行（累加到此行即失败）: 第 ' + loc.line + ' 行');
      var from = Math.max(0, loc.line - 6), to = Math.min(lines.length, loc.line + 3);
      for (var i = from; i < to; i++) {
        var tag = (i + 1 === loc.line) ? ' ❰❰' : '';
        log('    ' + (i + 1) + ': ' + revealLine(lines[i]) + tag);
      }
    }
  }

  async function run() {
    clearLog();
    log('=== SwC AI 自检 @ ' + new Date().toLocaleString() + ' ===');
    log('URL: ' + location.href);
    log('UA: ' + navigator.userAgent.slice(0, 90));
    log('');

    await checkSWC();
    log('');
    checkDOM();
    log('');
    await checkFile('ai-core.js');
    log('');
    await checkFile('ai-chat.js');
    log('');
    await checkFile('ai-ui.js');
    log('');
    log('=== 完成。请把以上内容整段复制发出 ===');
  }

  // 启动：等 DOM 和三个脚本都执行完
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 300); });
  } else {
    setTimeout(run, 300);
  }

  window.__swcCheck = run;
})();
