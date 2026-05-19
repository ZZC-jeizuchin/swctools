export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');

  // 缺少参数时返回友好的输入页面
  if (!urlParam) {
    const inputPage = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>顶层代理 - SwCTools</title>
  <style>
    :root {
      --bg-body: #e8edf2;
      --panel-bg: rgba(255,255,255,0.9);
      --panel-border: #bdd1e6;
      --text-color: #173e58;
      --btn-bg: #4f7f9e;
      --btn-hover: #3a6b8c;
      --input-border: #b3cce2;
    }
    * { margin:0; padding:0; box-sizing:border-box; font-family:system-ui, sans-serif; }
    body {
      background: var(--bg-body);
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .panel {
      background: var(--panel-bg);
      border-radius: 24px;
      box-shadow: 0 12px 28px rgba(30,65,90,0.15);
      border: 1px solid var(--panel-border);
      padding: 32px 24px;
      width: 100%;
      max-width: 560px;
    }
    h1 {
      font-size: 1.8rem;
      font-weight: 600;
      color: #1e4b6e;
      margin-bottom: 24px;
      text-align: center;
    }
    .row {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }
    input {
      flex: 1;
      padding: 12px 18px;
      border: 1.5px solid var(--input-border);
      border-radius: 36px;
      background: white;
      font-size: 1rem;
      outline: none;
      color: var(--text-color);
    }
    input:focus {
      border-color: #4f7fa3;
      box-shadow: 0 0 0 3px rgba(79,127,163,0.2);
    }
    button {
      padding: 12px 24px;
      border-radius: 36px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      border: none;
      background: var(--btn-bg);
      color: white;
      transition: 0.15s;
    }
    button:hover { background: var(--btn-hover); }
    button.outline {
      background: transparent;
      color: var(--btn-bg);
      border: 1.5px solid var(--btn-bg);
    }
    button.outline:hover { background: var(--btn-bg); color: white; }
  </style>
</head>
<body>
  <div class="panel">
    <h1>🌐 顶层代理</h1>
    <p style="text-align:center; color:#555; margin-bottom:16px;">请在下框中输入您要访问的完整网址</p>
    <div class="row">
      <input type="text" id="urlInput" placeholder="https://example.com" autofocus>
    </div>
    <div class="row">
      <button id="goBtn">🚀 打开</button>
      <button class="outline" onclick="window.location.href='/topvpn.html'">← 返回主页</button>
    </div>
    <p id="errorMsg" style="color:red; text-align:center; margin-top:8px; display:none;">请输入有效的网址</p>
  </div>
  <script>
    const input = document.getElementById('urlInput');
    const goBtn = document.getElementById('goBtn');
    const errorMsg = document.getElementById('errorMsg');
    function navigate() {
      const val = input.value.trim();
      if (!val) {
        errorMsg.style.display = 'block';
        return;
      }
      let final = val;
      if (!/^https?:\\/\\//i.test(final)) final = 'https://' + final;
      window.location.href = '/api/topvpn?url=' + encodeURIComponent(final);
    }
    goBtn.addEventListener('click', navigate);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') navigate();
      else errorMsg.style.display = 'none';
    });
  </script>
</body>
</html>`;
    return new Response(inputPage, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    const invalidPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>网址无效</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f5f5;}
.box{background:white;padding:2rem;border-radius:1rem;text-align:center;}
h2{color:#c0392b;}a{color:#3b82f6;}</style></head>
<body><div class="box"><h2>网址格式无效</h2><p>请输入完整的网址，例如 https://www.example.com</p><a href="/topvpn.html">返回代理首页</a></div></body></html>`;
    return new Response(invalidPage, {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });

    const finalUrl = new URL(response.url);
    const contentType = response.headers.get('Content-Type') || '';
    const isHTML = contentType.includes('text/html');

    const safeHeaders = new Headers();
    const headersToKeep = [
      'content-type', 'content-encoding', 'content-language',
      'cache-control', 'expires', 'last-modified', 'etag', 'content-length'
    ];
    for (const header of headersToKeep) {
      const value = response.headers.get(header);
      if (value !== null && value !== undefined) safeHeaders.set(header, value);
    }
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    safeHeaders.delete('X-Frame-Options');
    safeHeaders.delete('Content-Security-Policy');
    safeHeaders.delete('X-Content-Type-Options');
    safeHeaders.delete('Strict-Transport-Security');
    safeHeaders.delete('Set-Cookie');

    if (!isHTML) {
      return new Response(response.body, {
        status: response.status,
        headers: safeHeaders
      });
    }

    // ---- 处理 HTML ----
    let html = await response.text();
    const proxyBase = '/api/topvpn?url=';

    // 移除 <base> 标签
    html = html.replace(/<base\b[^>]*>/gi, '');

    // 重写资源链接（不重写 href）
    html = html.replace(/(src|action)\s*=\s*["']([^"'\s>]+)["']/gi, (match, attr, url) => {
      if (/^(javascript:|mailto:|data:|#)/i.test(url)) return match;
      try {
        const fullUrl = new URL(url, finalUrl.href).href;
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      } catch {
        return match;
      }
    });

    // 重写 srcset
    html = html.replace(/srcset\s*=\s*["']([^"']+)["']/gi, (match, srcsetValue) => {
      const urls = srcsetValue.split(',').map(part => {
        const trimmed = part.trim();
        const [url, ...rest] = trimmed.split(/\s+/);
        if (!url || /^(javascript:|data:)/.test(url)) return trimmed;
        try {
          const fullUrl = new URL(url, finalUrl.href).href;
          return `${proxyBase}${encodeURIComponent(fullUrl)} ${rest.join(' ')}`.trim();
        } catch {
          return trimmed;
        }
      });
      return `srcset="${urls.join(', ')}"`;
    });

    // 注入脚本（增强空值防护）
    const interceptorScript = `
      <script>
        (function() {
          const proxyBase = '/api/topvpn?url=';
          // 提取原始目标 URL（容错）
          let originalUrl = '';
          try {
            const params = new URLSearchParams(location.search);
            const raw = params.get('url');
            originalUrl = raw ? decodeURIComponent(raw) : '';
          } catch (e) {}

          // 控制栏 UI
          const bar = document.createElement('div');
          bar.id = '__topvpn_bar__';
          bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
          bar.innerHTML = '<span style="font-weight:600;">🌐 代理</span>' +
            '<input id="__topvpn_url__" type="text" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址并回车">' +
            '<button id="__topvpn_refresh__" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">刷新</button>' +
            '<button id="__topvpn_home__" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">← 返回</button>';
          document.documentElement.prepend(bar);
          document.documentElement.style.paddingTop = '48px';

          const urlInput = document.getElementById('__topvpn_url__');
          urlInput.value = originalUrl || location.href;
          urlInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
              let val = this.value.trim();
              if (!val) return;
              if (!/^https?:\\/\\//i.test(val)) val = 'https://' + val;
              window.location.assign(proxyBase + encodeURIComponent(val));
            }
          });
          document.getElementById('__topvpn_refresh__').addEventListener('click', () => location.reload());
          document.getElementById('__topvpn_home__').addEventListener('click', () => {
            window.location.href = '/topvpn.html';
          });

          // 工具函数：安全转换代理链接（★★★ 核心修复）
          function proxyUrl(inputUrl) {
            // 空值或 undefined 直接拦截，返回无害空白页，防止发出缺参请求
            if (!inputUrl && inputUrl !== 0) {
              return proxyBase + encodeURIComponent('about:blank');
            }
            // 已经是代理链接，不重复处理
            if (inputUrl.startsWith(proxyBase)) return inputUrl;
            // 尝试解析为绝对 URL
            const base = originalUrl || location.href;
            try {
              const absolute = new URL(inputUrl, base).href;
              return proxyBase + encodeURIComponent(absolute);
            } catch (e) {
              // 解析失败也返回空白页，绝不让空字符串溜过去
              return proxyBase + encodeURIComponent('about:blank');
            }
          }

          // 保存原始方法引用
          const originalAssign = window.location.assign.bind(window.location);
          const originalReplace = window.location.replace.bind(window.location);
          const originalPushState = history.pushState.bind(history);
          const originalReplaceState = history.replaceState.bind(history);

          // 锁定 location.assign
          Object.defineProperty(window.location, 'assign', {
            value: function(url) { return originalAssign(proxyUrl(url)); },
            writable: false, configurable: false
          });

          // 锁定 location.replace
          Object.defineProperty(window.location, 'replace', {
            value: function(url) { return originalReplace(proxyUrl(url)); },
            writable: false, configurable: false
          });

          // 锁定 history.pushState
          Object.defineProperty(history, 'pushState', {
            value: function(state, title, url) {
              if (url) arguments[2] = proxyUrl(url);
              return originalPushState.apply(history, arguments);
            },
            writable: false, configurable: false
          });

          // 锁定 history.replaceState
          Object.defineProperty(history, 'replaceState', {
            value: function(state, title, url) {
              if (url) arguments[2] = proxyUrl(url);
              return originalReplaceState.apply(history, arguments);
            },
            writable: false, configurable: false
          });

          // 拦截 Location.prototype.href 的 setter
          const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
          if (hrefDesc && hrefDesc.set) {
            Object.defineProperty(Location.prototype, 'href', {
              get: hrefDesc.get,
              set: function(url) { window.location.assign(url); },
              configurable: false
            });
          }

          // 拦截 fetch（安全处理）
          const originalFetch = window.fetch;
          window.fetch = function(input, init) {
            if (typeof input === 'string') {
              return originalFetch(proxyUrl(input), init);
            }
            if (input instanceof Request) {
              const newUrl = proxyUrl(input.url);
              return originalFetch(new Request(newUrl, input), init);
            }
            // URL 对象或其他
            return originalFetch(proxyUrl(input.toString()), init);
          };

          // 拦截 XMLHttpRequest
          const OriginalXHR = window.XMLHttpRequest;
          window.XMLHttpRequest = function() {
            const xhr = new OriginalXHR();
            const originalOpen = xhr.open;
            xhr.open = function(method, url, async, user, password) {
              arguments[1] = proxyUrl(url); // 自动防护空值
              return originalOpen.apply(xhr, arguments);
            };
            return xhr;
          };

          // 全局拦截 <a> 点击
          document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && link.href) {
              const raw = link.getAttribute('href');
              if (raw && !/^(javascript:|mailto:|#)/i.test(raw)) {
                e.preventDefault();
                window.location.assign(raw);
              }
            }
          }, true);

          // 表单提交处理
          function submitFormViaProxy(form) {
            const target = form.getAttribute('target') || '_self';
            if (target !== '_self' && target !== '' && target !== '_parent' && target !== '_top') return;
            const formData = new FormData(form);
            const params = new URLSearchParams(formData).toString();
            let action = form.getAttribute('action') || originalUrl || location.href;
            let actionUrl;
            try {
              actionUrl = new URL(action, originalUrl || location.href);
            } catch {
              actionUrl = new URL(originalUrl || location.href);
            }
            actionUrl.search = params;
            window.location.assign(actionUrl.href);
          }
          document.addEventListener('submit', function(e) {
            e.preventDefault();
            submitFormViaProxy(e.target);
          }, true);
          const originalFormSubmit = HTMLFormElement.prototype.submit;
          HTMLFormElement.prototype.submit = function() {
            submitFormViaProxy(this);
          };
        })();
      </script>
    `;

    html = html.replace(/<head\b[^>]*>/i, '<head>' + interceptorScript);

    return new Response(html, {
      status: response.status,
      headers: safeHeaders
    });
  } catch (err) {
    const errorHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>代理错误</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
.error-box{background:white;padding:2rem;border-radius:1rem;box-shadow:0 4px 12px rgba(0,0,0,0.1);text-align:center;}
h2{color:#c0392b;}p{color:#555;}</style></head>
<body><div class="error-box"><h2>代理请求失败</h2><p>${err.message}</p></div></body></html>`;
    return new Response(errorHtml, {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}