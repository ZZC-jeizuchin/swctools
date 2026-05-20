export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');
  const myOrigin = new URL(request.url).origin;

  if (!urlParam) {
    const inputPage = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>顶层代理</title>
  <style>
    :root{--bg:#e8edf2;--panel-bg:rgba(255,255,255,0.9);--border:#bdd1e6;--btn:#4f7f9e}
    *{margin:0;padding:0;box-sizing:border-box;font-family:system-ui,sans-serif}
    body{background:var(--bg);height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .panel{background:var(--panel-bg);border-radius:24px;box-shadow:0 12px 28px rgba(30,65,90,0.15);border:1px solid var(--border);padding:32px 24px;width:100%;max-width:560px}
    h1{font-size:1.8rem;color:#1e4b6e;margin-bottom:24px;text-align:center}
    .row{display:flex;gap:10px;margin-bottom:12px}
    input{flex:1;padding:12px 18px;border:1.5px solid var(--border);border-radius:36px;font-size:1rem;outline:none}
    button{padding:12px 24px;border-radius:36px;font-weight:600;cursor:pointer;border:none;background:var(--btn);color:#fff}
    .outline{background:transparent;color:var(--btn);border:1.5px solid var(--btn)}
  </style>
</head>
<body>
  <div class="panel">
    <h1>🌐 顶层代理</h1>
    <p style="text-align:center;color:#555;margin-bottom:16px">请输入网址</p>
    <div class="row"><input id="urlInput" placeholder="https://example.com" autofocus></div>
    <div class="row">
      <button onclick="var v=document.getElementById('urlInput').value.trim();if(v){if(!/^https?:\\/\\//i.test(v))v='https://'+v;location.href='/api/topvpn?url='+encodeURIComponent(v)}">打开</button>
      <button class="outline" onclick="location.href='/topvpn.html'">返回</button>
    </div>
  </div>
</body>
</html>`;
    return new Response(inputPage, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  let targetUrl;
  try { targetUrl = new URL(urlParam); } catch {
    return new Response('<!DOCTYPE html><html><head><title>无效网址</title></head><body><h2>网址格式无效</h2><a href="/topvpn.html">返回</a></body></html>', {
      status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  try {
    const fetchHeaders = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document'
    });
    fetchHeaders.set('Referer', targetUrl.origin + '/');

    const response = await fetch(targetUrl.toString(), {
      redirect: 'follow',
      headers: fetchHeaders
    });

    const finalUrl = new URL(response.url);
    const contentType = response.headers.get('Content-Type') || '';
    const isHTML = contentType.includes('text/html');

    const safeHeaders = new Headers();
    ['content-type','content-encoding','content-language','cache-control','expires','last-modified','etag','content-length'].forEach(h => {
      const val = response.headers.get(h);
      if (val !== null && val !== undefined) safeHeaders.set(h, val);
    });
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    ['X-Frame-Options','Content-Security-Policy','X-Content-Type-Options','Strict-Transport-Security','Set-Cookie'].forEach(h => safeHeaders.delete(h));

    if (!isHTML) {
      return new Response(response.body, { status: response.status, headers: safeHeaders });
    }

    let html = await response.text();
    const proxyBase = myOrigin + '/api/topvpn?url=';

    // 移除原有 <base> 和 CSP meta
    html = html.replace(/<base\b[^>]*>/gi, '');
    html = html.replace(/<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*\/?>/gi, '');

    // 注入 <base> 标签，让所有相对路径基于目标站点解析（但最终会被我们的函数重写）
    const baseTag = `<base href="${finalUrl.href}">`;

    const toProxy = (url) => {
      if (!url || /^(javascript:|mailto:|data:|#|about:)/i.test(url)) return url;
      if (url.startsWith(proxyBase) || url.startsWith('/api/topvpn?url=')) return url;
      try {
        const absolute = new URL(url, finalUrl.href).href;
        return proxyBase + absolute;
      } catch { return url; }
    };

    // 重写静态链接和资源（保留 form action 不重写）
    html = html.replace(/(\shref)\s*=\s*["']([^"'\s>]+)["']/gi, (_, attr, url) => `${attr}="${toProxy(url)}"`);
    // 只重写 formaction，不重写 action
    html = html.replace(/(\sformaction)\s*=\s*["']([^"'\s>]+)["']/gi, (_, attr, url) => `${attr}="${toProxy(url)}"`);
    html = html.replace(/(\ssrc|\ssrcset)\s*=\s*["']([^"']+)["']/gi, (_, attr, url) => {
      if (/^(javascript:|data:)/i.test(url)) return _;
      if (attr.endsWith('srcset')) {
        const parts = url.split(',').map(p => {
          const t = p.trim();
          const [u, ...r] = t.split(/\s+/);
          if (!u || /^(javascript:|data:)/i.test(u)) return t;
          return [toProxy(u), ...r].join(' ');
        });
        return `srcset="${parts.join(', ')}"`;
      }
      return `${attr}="${toProxy(url)}"`;
    });
    // meta refresh
    html = html.replace(/<meta\s+http-equiv\s*=\s*["']?refresh["']?([^>]*?)>/gi, (_, attrs) => {
      const cm = attrs.match(/content\s*=\s*["']([^"']*)["']/i);
      if (cm) {
        let content = cm[1];
        content = content.replace(/url\s*=\s*([^;]*)/i, (_, u) => {
          let url = u.trim().replace(/^['"]|['"]$/g, '');
          if (url) return `url=${toProxy(url)}`;
          return _;
        });
        return `<meta http-equiv="refresh" content="${content}">`;
      }
      return _;
    });

    // ★ 改写内联脚本中的 location 调用
    html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, scriptContent) => {
      // 避免破坏我们的注入脚本
      if (scriptContent.includes('__topvpn_bar__') || scriptContent.includes('__proxyAssign')) {
        return match;
      }
      // 替换 location.href = ... 为 __proxyAssign(...)
      scriptContent = scriptContent.replace(/(\bwindow\.location\b|\blocation\b)\.href\s*=\s*(?![=])/gi, '__proxyAssign(');
      // 处理赋值语句，例如 __proxyAssign(表达式) 需要闭合括号，这里简单地在行尾添加括号
      // 更稳健的做法是使用函数调用包装，这里我们用 /__proxyAssign\(([^;]+)\)/g 来匹配常见的赋值
      // 由于替换后变成 __proxyAssign(url)，但可能缺少右括号，我们手动添加
      scriptContent = scriptContent.replace(/__proxyAssign\(([^;]*)/gi, '__proxyAssign($1)');
      // 替换 location.assign( 为 __proxyAssign(
      scriptContent = scriptContent.replace(/(\bwindow\.location\b|\blocation\b)\.assign\s*\(/gi, '__proxyAssign(');
      // 替换 location.replace( 为 __proxyReplace(
      scriptContent = scriptContent.replace(/(\bwindow\.location\b|\blocation\b)\.replace\s*\(/gi, '__proxyReplace(');
      return `<script${attrs}>${scriptContent}</script>`;
    });

    // 注入核心脚本（包含代理函数和事件拦截）
    const injectScript = `
<script>
(function() {
  var PROXY_BASE = ${JSON.stringify(proxyBase)};
  var ORIGIN_URL = ${JSON.stringify(finalUrl.href)};

  // 全局代理函数
  window.__proxyAssign = function(url) {
    if (!url) return;
    if (url.indexOf(PROXY_BASE) === 0 || url.indexOf('/api/topvpn?url=') === 0) {
      window._originalAssign(url);
      return;
    }
    if (/^(javascript:|mailto:|data:|#|about:)/i.test(url)) {
      window._originalAssign(url);
      return;
    }
    try {
      var absolute = new URL(url, ORIGIN_URL).href;
      window._originalAssign(PROXY_BASE + absolute);
    } catch (e) {
      window._originalAssign(PROXY_BASE + ORIGIN_URL);
    }
  };
  window.__proxyReplace = function(url) {
    if (!url) return;
    if (url.indexOf(PROXY_BASE) === 0 || url.indexOf('/api/topvpn?url=') === 0) {
      window._originalReplace(url);
      return;
    }
    if (/^(javascript:|mailto:|data:|#|about:)/i.test(url)) {
      window._originalReplace(url);
      return;
    }
    try {
      var absolute = new URL(url, ORIGIN_URL).href;
      window._originalReplace(PROXY_BASE + absolute);
    } catch (e) {
      window._originalReplace(PROXY_BASE + ORIGIN_URL);
    }
  };

  // 保存原始方法
  window._originalAssign = window.location.assign.bind(window.location);
  window._originalReplace = window.location.replace.bind(window.location);
  var _push = history.pushState.bind(history);
  var _replaceState = history.replaceState.bind(history);
  var _open = window.open.bind(window);

  // 重写 location.assign
  try { Object.defineProperty(window.location, 'assign', { value: function(url) { return window.__proxyAssign(url); }, writable: false, configurable: false }); } catch(e) {}
  // 重写 location.replace
  try { Object.defineProperty(window.location, 'replace', { value: function(url) { return window.__proxyReplace(url); }, writable: false, configurable: false }); } catch(e) {}
  // 重写 history
  try { Object.defineProperty(history, 'pushState', { value: function(state, title, url) { if (url) arguments[2] = PROXY_BASE + (new URL(url, ORIGIN_URL)).href; return _push.apply(history, arguments); }, writable: false, configurable: false }); } catch(e) {}
  try { Object.defineProperty(history, 'replaceState', { value: function(state, title, url) { if (url) arguments[2] = PROXY_BASE + (new URL(url, ORIGIN_URL)).href; return _replaceState.apply(history, arguments); }, writable: false, configurable: false }); } catch(e) {}
  // window.open
  window.open = function(url, target, features) {
    if (url && typeof url === 'string') {
      try {
        url = PROXY_BASE + (new URL(url, ORIGIN_URL)).href;
      } catch(e) {}
    }
    return _open(url, target, features);
  };

  // 拦截 <a> 点击
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (link && link.href) {
      var rawHref = link.getAttribute('href');
      if (rawHref && !/^(javascript:|mailto:|#)/i.test(rawHref) && rawHref.indexOf(PROXY_BASE) !== 0 && rawHref.indexOf('/api/topvpn?url=') !== 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.__proxyAssign(rawHref);
      }
    }
  }, true);

  // 拦截表单提交
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (form.tagName !== 'FORM') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var action = form.getAttribute('action') || ORIGIN_URL;
    var method = (form.method || 'get').toLowerCase();
    var formData = new FormData(form);
    var params = new URLSearchParams(formData).toString();
    var actionUrl;
    try {
      actionUrl = new URL(action, ORIGIN_URL);
    } catch (ex) {
      actionUrl = new URL(ORIGIN_URL);
    }
    if (method === 'get') {
      actionUrl.search = params;
    }
    window.__proxyAssign(actionUrl.href);
  }, true);

  // 智能调整 fixed/sticky 元素，避免被控制栏遮挡
  var barHeight = 48;
  function adjustFixedElements() {
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.id === '__topvpn_bar__') continue; // 跳过控制栏自身
      var style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        var top = parseInt(style.top, 10);
        if (!isNaN(top) && top >= 0 && top < barHeight) {
          el.style.top = (top + barHeight) + 'px';
        }
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', adjustFixedElements);
  } else {
    adjustFixedElements();
  }
  new MutationObserver(adjustFixedElements).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
})();
</script>`;

    // 控制栏
    const controlBar = `
<div id="__topvpn_bar__" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
  <span style="font-weight:600;">🌐 代理</span>
  <input id="__topvpn_url__" type="text" value="${finalUrl.href}" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址">
  <button onclick="window.__proxyAssign(document.getElementById('__topvpn_url__').value)" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">打开</button>
  <button onclick="window._originalAssign(PROXY_BASE + document.getElementById('__topvpn_url__').value)" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">刷新</button>
  <button onclick="location.href='/topvpn.html'" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">返回</button>
</div>`;

    // 组合最终 HTML：<base> + 注入脚本 + 原 HTML + 控制栏
    html = baseTag + injectScript + html;
    html = html.replace(/<body\b[^>]*>/i, `<body>${controlBar}`);

    return new Response(html, { status: response.status, headers: safeHeaders });
  } catch (err) {
    return new Response(`<html><body><h2>代理错误</h2><p>${err.message}</p></body></html>`, {
      status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
