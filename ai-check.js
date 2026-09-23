// ai-check.js — SwC AI 诊断脚本 v2
// 用法：在 ai.html 的三个 <script src="ai-*.js"> 之后加
//   <script src="ai-check.js"></script>
(function () {
  "use strict";

  var panel, body, badge;
  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = '__swcCheck';
    panel.style.cssText = [
      'position:fixed','right:8px','bottom:8px','width:min(560px,96vw)',
      'max-height:75vh','overflow:auto','background:#0b1220','color:#cfe3ff',
      'font:12px/1.5 ui-monospace,Consolas,monospace','padding:10px 12px',
      'border:1px solid #2a4a7a','border-radius:10px','z-index:2147483647',
      'box-shadow:0 8px 32px rgba(0,0,0,.5)','white-space:pre-wrap',
      'word-break:break-all'
    ].join(';');
    body = document.createElement('div');
    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #2a4a7a;';
    head.innerHTML = '<b style="flex:1;color:#7fd1ff;">🔎 SwC 自检 v2</b>';
    function mkBtn(txt, fn) {
      var b = document.createElement('button');
      b.textContent = txt;
      b.style.cssText = 'background:#1b3a5c;color:#cfe3ff;border:1px solid #2a4a7a;border-radius:5px;padding:3px 10px;cursor:pointer;font:inherit;';
      b.onclick = fn;
      return b;
    }
    head.appendChild(mkBtn('重跑', function () { run(); }));
    head.appendChild(mkBtn('复制', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(body.innerText).catch(function(){});
    }));
    head.appendChild(mkBtn('隐藏', function () { panel.style.display = 'none'; badge.style.display = 'block'; }));
    panel.appendChild(head);
    panel.appendChild(body);
    document.body.appendChild(panel);

    badge = document.createElement('div');
    badge.textContent = '🔎';
    badge.style.cssText = 'position:fixed;right:8px;bottom:8px;width:32px;height:32px;line-height:32px;text-align:center;background:#1b3a5c;color:#cfe3ff;border:1px solid #2a4a7a;border-radius:50%;cursor:pointer;z-index:2147483646;display:none;font-size:16px;';
    badge.onclick = function () { panel.style.display = 'block'; badge.style.display = 'none'; };
    document.body.appendChild(badge);
  }
  function log(s) { ensurePanel(); body.textContent += s + '\n'; }
  function clearLog() { ensurePanel(); body.textContent = ''; }

  window.addEventListener('error', function (e) {
    log('[❌ ERROR] ' + (e.message || '?') + '  @ ' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?'));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    log('[❌ REJECT] ' + ((r && (r.stack || r.message)) || r));
  });

  function syntaxCheck(src) {
    try { new Function(src); return null; } catch (e) { return e.message || String(e); }
  }
  var SUSPECT = /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF\u00A0\u2018\u2019\u201C\u201D\u2013\u2014\u3000]/g;
  function reveal(s) { return s.replace(SUSPECT, function (c) { return '<U+' + c.codePointAt(0).toString(16).toUpperCase() + '>'; }); }

  function checkScriptTags() {
    log('── ai.html 的 <script src> 标签 ──');
    var found = { 'ai-core.js': false, 'ai-chat.js': false, 'ai-ui.js': false };
    document.querySelectorAll('script[src]').forEach(function (s) {
      var src = s.getAttribute('src') || '';
      var file = src.split('?')[0].split('/').pop();
      if (found.hasOwnProperty(file)) found[file] = true;
      log('  ' + (s.async ? '[async] ' : '') + (s.defer ? '[defer] ' : '')
          + (s.type ? '[type=' + s.type + '] ' : '') + src);
    });
    Object.keys(found).forEach(function (k) {
      log('  ' + (found[k] ? '✅' : '❌') + ' 引用了 ' + k);
    });
  }

  function checkSWC() {
    log('── SWC 命名空间 ──');
    var SWC = window.SWC;
    if (!SWC) { log('  ❌ SWC 未定义'); return; }
    var uiFns = ['renderChat','renderConvList','renderModelManagerList','renderSearchManagerList',
                 'openModelEdit','openSearchEdit','updateSendButton','updateConfigLabel',
                 'updateModelLabel','updateSearchLabel','updateSearchEnabledCheck','updateDebugButton',
                 'autoScroll'];
    var miss = uiFns.filter(function (k) { return typeof SWC[k] !== 'function'; });
    if (miss.length === 0) log('  ✅ ui 层所有函数都在');
    else log('  ❌ ui 缺失 (' + miss.length + '): ' + miss.join(', '));
  }

  async function checkFile(url, tryRun) {
    log('── ' + url + ' ──');
    var res, text;
    try {
      res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
      text = await res.text();
    } catch (e) { log('  ❌ fetch 失败: ' + (e && e.message)); return; }
    if (!res.ok) { log('  ❌ HTTP ' + res.status); return; }
    var lines = text.split('\n');
    log('  HTTP ' + res.status + ' | ' + text.length + ' 字节 | ' + lines.length + ' 行');
    var first = [...text.slice(0, 3)].map(function (c) { return c.codePointAt(0).toString(16); }).join(' ');
    log('  首 3 字符: ' + first + (/^feff/i.test(first) ? '  ⚠️ BOM' : ''));

    var err = syntaxCheck(text);
    if (err) {
      log('  ❌ 语法错误: ' + err);
      var acc = '', badLine = -1;
      for (var i = 0; i < lines.length; i++) {
        acc += lines[i] + '\n';
        if (syntaxCheck(acc)) { badLine = i + 1; break; }
      }
      if (badLine > 0) {
        log('  ➜ 累加到第 ' + badLine + ' 行时语法失败');
        var from = Math.max(0, badLine - 6), to = Math.min(lines.length, badLine + 3);
        for (var j = from; j < to; j++) {
          log('    ' + (j + 1) + ': ' + reveal(lines[j]) + (j + 1 === badLine ? ' ❰❰' : ''));
        }
      }
      return;
    }
    log('  ✅ 语法检查通过');

    if (!tryRun) return;

    log('  ── 尝试强制执行以捕获运行时错误 ──');
    var before = window.SWC ? Object.keys(window.SWC).length : 0;
    try {
      (0, eval)(text);
      var after = window.SWC ? Object.keys(window.SWC).length : 0;
      log('  ✅ 执行成功，SWC 属性 ' + before + ' → ' + after);
      if (window.SWC && typeof window.SWC.renderChat === 'function') {
        try {
          window.SWC.renderChat();
          log('  ✅ renderChat() 执行成功，页面已刷新');
        } catch (e2) {
          log('  ❌ renderChat() 报错: ' + e2.message);
          (e2.stack || '').split('\n').slice(0, 6).forEach(function (l) { log('    ' + l); });
        }
      }
    } catch (e) {
      log('  ❌ 运行时错误: ' + (e.message || e));
      (e.stack || '').split('\n').slice(0, 15).forEach(function (l) { log('    ' + l); });
      var m = /<anonymous>:(\d+):(\d+)/.exec(e.stack || '');
      if (m) {
        var ln = parseInt(m[1], 10);
        log('  ➜ 大致定位到第 ' + ln + ' 行');
        var from2 = Math.max(0, ln - 6), to2 = Math.min(lines.length, ln + 3);
        for (var k = from2; k < to2; k++) {
          log('    ' + (k + 1) + ': ' + reveal(lines[k]) + (k + 1 === ln ? ' ❰❰' : ''));
        }
      }
    }
  }

  async function run() {
    clearLog();
    log('=== SwC 自检 v2 @ ' + new Date().toLocaleString() + ' ===');
    log('URL: ' + location.href);
    log('');
    checkScriptTags();
    log('');
    checkSWC();
    log('');
    await checkFile('ai-core.js', false);
    log('');
    await checkFile('ai-chat.js', false);
    log('');
    await checkFile('ai-ui.js', true);
    log('');
    log('=== 完成 ===');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 300); });
  } else {
    setTimeout(run, 300);
  }

  window.__swcCheck = run;
})();
