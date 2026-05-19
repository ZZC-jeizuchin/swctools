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
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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

    const toProxy = (url) => {
      if (!url || /^(javascript:|mailto:|data:|#|about:)/i.test(url)) return url;
      if (url.startsWith(proxyBase) || url.startsWith('/api/topvpn?url=')) return url;
      try {
        const absolute = new URL(url, finalUrl.href).href;
        return proxyBase + absolute;
      } catch { return url; }
    };

    // 重写所有链接（href, action, formaction）
    html = html.replace(/(\shref)\s*=\s*["']([^"'\s>]+)["']/gi, (_, attr, url) => `${attr}="${toProxy(url)}"`);
    html = html.replace(/(\saction|\sformaction)\s*=\s*["']([^"'\s>]+)["']/gi, (_, attr, url) => `${attr}="${toProxy(url)}"`);
    // 重写资源
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
    // 处理 meta refresh
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

    // ---------- 前端拦截脚本（硬编码原始URL，多重防护）----------
    const injectScript = `
<script>
(function() {
  // 硬编码的关键数据，绝对不被覆盖
  var PROXY_BASE = ${JSON.stringify(proxyBase)};
  var ORIGIN_URL = ${JSON.stringify(finalUrl.href)};

  // 工具函数：将任何URL转换为代理链接
  function toProxyUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    // 已经是代理链接，不处理
    if (rawUrl.indexOf(PROXY_BASE) === 0 || rawUrl.indexOf('/api/topvpn?url=') === 0) return rawUrl;
    // 特殊协议跳过
    if (/^(javascript:|mailto:|data:|#|about:)/i.test(rawUrl)) return rawUrl;
    try {
      var absolute = new URL(rawUrl, ORIGIN_URL).href;
      return PROXY_BASE + absolute;
    } catch (e) {
      return rawUrl;
    }
  }

  // 保存原始函数
  var _assign = window.location.assign.bind(window.location);
  var _replace = window.location.replace.bind(window.location);
  var _push = history.pushState.bind(history);
  var _replaceState = history.replaceState.bind(history);
  var _open = window.open.bind(window);

  // 锁定 location.assign
  try {
    Object.defineProperty(window.location, 'assign', {
      value: function(url) { return _assign(toProxyUrl(url)); },
      writable: false, configurable: false
    });
  } catch(e) {}

  // 锁定 location.replace
  try {
    Object.defineProperty(window.location, 'replace', {
      value: function(url) { return _replace(toProxyUrl(url)); },
      writable: false, configurable: false
    });
  } catch(e) {}

  // 锁定 history.pushState
  try {
    Object.defineProperty(history, 'pushState', {
      value: function(state, title, url) {
        if (url) arguments[2] = toProxyUrl(url);
        return _push.apply(history, arguments);
      },
      writable: false, configurable: false
    });
  } catch(e) {}

  // 锁定 history.replaceState
  try {
    Object.defineProperty(history, 'replaceState', {
      value: function(state, title, url) {
        if (url) arguments[2] = toProxyUrl(url);
        return _replaceState.apply(history, arguments);
      },
      writable: false, configurable: false
    });
  } catch(e) {}

  // 拦截 window.open
  try {
    window.open = function(url, target, features) {
      if (url && typeof url === 'string') url = toProxyUrl(url);
      return _open(url, target, features);
    };
  } catch(e) {}

  // 拦截 location.href 赋值（最核心的拦截）
  try {
    var hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (hrefDesc && hrefDesc.set) {
      Object.defineProperty(Location.prototype, 'href', {
        get: hrefDesc.get,
        set: function(url) {
          _assign(toProxyUrl(url));
        },
        configurable: false
      });
    }
  } catch(e) {}

  // 全局拦截所有链接点击（捕获阶段，处理动态生成的链接）
  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (link && link.href) {
      var rawHref = link.getAttribute('href');
      if (rawHref && !/^(javascript:|mailto:|#)/i.test(rawHref) && rawHref.indexOf(PROXY_BASE) !== 0 && rawHref.indexOf('/api/topvpn?url=') !== 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        _assign(toProxyUrl(rawHref));
      }
    }
  }, true);

  // 拦截表单提交（防止绕过）
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
    _assign(toProxyUrl(actionUrl.href));
  }, true);
})();
</script>`;

    // 控制栏（纯HTML，不依赖脚本）
    const controlBar = `
<div id="__topvpn_bar__" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
  <span style="font-weight:600;">🌐 代理</span>
  <input id="__topvpn_url__" type="text" value="${finalUrl.href}" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址">
  <button onclick="location.href='${proxyBase}'+encodeURIComponent(document.getElementById('__topvpn_url__').value)" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">打开</button>
  <button onclick="location.reload()" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">刷新</button>
  <button onclick="location.href='/topvpn.html'" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">返回</button>
</div>`;

    // 组装HTML：脚本最先，然后是原页面内容，控制栏插入body
    html = injectScript + html;
    html = html.replace(/<body\b[^>]*>/i, `<body>${controlBar}`);
    html = `<style>html{margin-top:52px;}</style>` + html;

    return new Response(html, { status: response.status, headers: safeHeaders });
  } catch (err) {
    return new Response(`<html><body><h2>代理错误</h2><p>${err.message}</p></body></html>`, {
      status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
