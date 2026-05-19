export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');

  // 缺少参数 → 返回输入页面
  if (!urlParam) {
    const inputPage = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>顶层代理 - SwCTools</title>
  <style>
    :root { --bg-body: #e8edf2; --panel-bg: rgba(255,255,255,0.9); --panel-border: #bdd1e6; --text-color: #173e58; --btn-bg: #4f7f9e; --btn-hover: #3a6b8c; --input-border: #b3cce2; }
    * { margin:0; padding:0; box-sizing:border-box; font-family:system-ui, sans-serif; }
    body { background: var(--bg-body); height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; }
    .panel { background: var(--panel-bg); border-radius:24px; box-shadow:0 12px 28px rgba(30,65,90,0.15); border:1px solid var(--panel-border); padding:32px 24px; width:100%; max-width:560px; }
    h1 { font-size:1.8rem; font-weight:600; color:#1e4b6e; margin-bottom:24px; text-align:center; }
    .row { display:flex; gap:10px; margin-bottom:12px; }
    input { flex:1; padding:12px 18px; border:1.5px solid var(--input-border); border-radius:36px; background:white; font-size:1rem; outline:none; color:var(--text-color); }
    input:focus { border-color:#4f7fa3; box-shadow:0 0 0 3px rgba(79,127,163,0.2); }
    button { padding:12px 24px; border-radius:36px; font-weight:600; font-size:0.95rem; cursor:pointer; border:none; background:var(--btn-bg); color:white; transition:0.15s; }
    button:hover { background:var(--btn-hover); }
    button.outline { background:transparent; color:var(--btn-bg); border:1.5px solid var(--btn-bg); }
    button.outline:hover { background:var(--btn-bg); color:white; }
  </style>
</head>
<body>
  <div class="panel">
    <h1>🌐 顶层代理</h1>
    <p style="text-align:center; color:#555; margin-bottom:16px;">请输入要访问的完整网址</p>
    <div class="row"><input type="text" id="urlInput" placeholder="https://example.com" autofocus></div>
    <div class="row">
      <button id="goBtn">🚀 打开</button>
      <button class="outline" onclick="window.location.href='/topvpn.html'">← 返回主页</button>
    </div>
    <p id="errorMsg" style="color:red; text-align:center; margin-top:8px; display:none;">请输入有效的网址</p>
  </div>
  <script>
    const input = document.getElementById('urlInput');
    document.getElementById('goBtn').addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) { document.getElementById('errorMsg').style.display='block'; return; }
      let final = val;
      if (!/^https?:\\/\\//i.test(final)) final = 'https://' + final;
      window.location.href = '/api/topvpn?url=' + encodeURIComponent(final);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('goBtn').click();
      else document.getElementById('errorMsg').style.display='none';
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
.box{background:white;padding:2rem;border-radius:1rem;text-align:center;}h2{color:#c0392b;}a{color:#3b82f6;}</style></head>
<body><div class="box"><h2>网址格式无效</h2><p>请输入完整网址，如 https://www.example.com</p><a href="/topvpn.html">返回代理首页</a></div></body></html>`;
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

    const finalUrl = new URL(response.url); // 最终重定向后的地址
    const contentType = response.headers.get('Content-Type') || '';
    const isHTML = contentType.includes('text/html');

    const safeHeaders = new Headers();
    for (const h of ['content-type','content-encoding','content-language','cache-control','expires','last-modified','etag','content-length']) {
      const val = response.headers.get(h);
      if (val !== null && val !== undefined) safeHeaders.set(h, val);
    }
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    safeHeaders.delete('X-Frame-Options');
    safeHeaders.delete('Content-Security-Policy');
    safeHeaders.delete('X-Content-Type-Options');
    safeHeaders.delete('Strict-Transport-Security');
    safeHeaders.delete('Set-Cookie');

    if (!isHTML) {
      return new Response(response.body, { status: response.status, headers: safeHeaders });
    }

    let html = await response.text();
    const proxyBase = '/api/topvpn?url=';

    // 1. 移除原有 <base> 标签
    html = html.replace(/<base\b[^>]*>/gi, '');

    // 2. 移除 <meta> CSP 标签
    html = html.replace(/<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*\/?>/gi, '');
    html = html.replace(/<meta\b[^>]*\bcontent-security-policy[^>]*\/?>/gi, '');

    // 3. 插入正确的 <base> 标签（让相对路径基于目标网站解析）
    const baseTag = `<base href="${finalUrl.href}">`;

    // 辅助函数：将 URL 转为代理链接
    const toProxyUrl = (u) => {
      if (!u || /^(javascript:|mailto:|data:|#|about:)/i.test(u)) return u;
      try {
        const absolute = new URL(u, finalUrl.href).href;
        return proxyBase + encodeURIComponent(absolute);
      } catch { return u; }
    };

    // 4. 重写普通链接和资源链接
    html = html.replace(/(\shref)\s*=\s*["']([^"'\s>]+)["']/gi, (m, attr, url) => `${attr}="${toProxyUrl(url)}"`);
    html = html.replace(/(\saction|\sformaction)\s*=\s*["']([^"'\s>]+)["']/gi, (m, attr, url) => `${attr}="${toProxyUrl(url)}"`);
    html = html.replace(/(\ssrc|\ssrcset)\s*=\s*["']([^"']+)["']/gi, (m, attr, url) => {
      if (/^(javascript:|data:)/i.test(url)) return m;
      if (attr.endsWith('srcset')) {
        const parts = url.split(',').map(p => {
          const trimmed = p.trim();
          const [u, ...rest] = trimmed.split(/\s+/);
          if (!u || /^(javascript:|data:)/i.test(u)) return trimmed;
          return [toProxyUrl(u), ...rest].join(' ').trim();
        });
        return `srcset="${parts.join(', ')}"`;
      }
      return `${attr}="${toProxyUrl(url)}"`;
    });

    // ★ 5. 重写 <meta http-equiv="refresh"> 标签（防止自动跳转逃逸）
    html = html.replace(/<meta\s+http-equiv\s*=\s*["']?refresh["']?([^>]*?)>/gi, (match, attrs) => {
      // 提取 content 属性中的 url=...
      const contentMatch = attrs.match(/content\s*=\s*["']([^"']*)["']/i);
      if (contentMatch) {
        let content = contentMatch[1];
        // 匹配 url=... 或直接数字分号后跟 URL 的格式
        content = content.replace(/url\s*=\s*([^;]*)/i, (full, urlPart) => {
          // urlPart 可能是相对路径，去除两端空白及引号
          let url = urlPart.trim().replace(/^['"]|['"]$/g, '');
          if (url) {
            const proxied = toProxyUrl(url);
            return `url=${proxied}`;
          }
          return full;
        });
        // 如果没有 url=，但整个 content 是数字；url=... 的格式，我们已经处理了
        return `<meta http-equiv="refresh" content="${content}">`;
      }
      return match; // 无法识别则保留原样
    });

    // 6. 注入前端拦截脚本（包含 MutationObserver 等所有防护）
    const interceptorScript = `
      <script>
        (function() {
          const proxyBase = '/api/topvpn?url=';
          const originalUrl = ${JSON.stringify(finalUrl.href)};

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
          urlInput.value = originalUrl;
          urlInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
              let val = this.value.trim();
              if (!val) return;
              if (!/^https?:\\/\\//i.test(val)) val = 'https://' + val;
              window.location.assign(proxyBase + encodeURIComponent(val));
            }
          });
          document.getElementById('__topvpn_refresh__').addEventListener('click', () => location.reload());
          document.getElementById('__topvpn_home__').addEventListener('click', () => { window.location.href = '/topvpn.html'; });

          // 代理 URL 转换
          function proxyUrl(inputUrl) {
            if (!inputUrl && inputUrl !== 0) return inputUrl;
            if (inputUrl.startsWith(proxyBase)) return inputUrl;
            if (/^(javascript:|mailto:|data:|#|about:)/i.test(inputUrl)) return inputUrl;
            try {
              const absolute = new URL(inputUrl, originalUrl).href;
              return proxyBase + encodeURIComponent(absolute);
            } catch (e) {
              return proxyBase + encodeURIComponent('about:blank');
            }
          }

          // ---- 锁定导航 API ----
          const originalAssign = window.location.assign.bind(window.location);
          const originalReplace = window.location.replace.bind(window.location);
          const originalOpen = window.open.bind(window);
          const originalPushState = history.pushState.bind(history);
          const originalReplaceState = history.replaceState.bind(history);

          const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
          if (hrefDesc && hrefDesc.set) {
            Object.defineProperty(Location.prototype, 'href', {
              get: hrefDesc.get,
              set: function(url) { originalAssign(proxyUrl(url)); },
              configurable: false
            });
          }
          Object.defineProperty(window.location, 'assign', {
            value: function(url) { return originalAssign(proxyUrl(url)); },
            writable: false, configurable: false
          });
          Object.defineProperty(window.location, 'replace', {
            value: function(url) { return originalReplace(proxyUrl(url)); },
            writable: false, configurable: false
          });
          Object.defineProperty(history, 'pushState', {
            value: function(state, title, url) {
              if (url) arguments[2] = proxyUrl(url);
              return originalPushState.apply(history, arguments);
            },
            writable: false, configurable: false
          });
          Object.defineProperty(history, 'replaceState', {
            value: function(state, title, url) {
              if (url) arguments[2] = proxyUrl(url);
              return originalReplaceState.apply(history, arguments);
            },
            writable: false, configurable: false
          });
          window.open = function(url, target, features) {
            if (url && typeof url === 'string') url = proxyUrl(url);
            return originalOpen(url, target, features);
          };

          // 拦截 fetch / XHR
          const originalFetch = window.fetch;
          window.fetch = function(input, init) {
            if (typeof input === 'string') return originalFetch(proxyUrl(input), init);
            if (input instanceof Request) return originalFetch(new Request(proxyUrl(input.url), input), init);
            return originalFetch(proxyUrl(input.toString()), init);
          };
          const OriginalXHR = window.XMLHttpRequest;
          window.XMLHttpRequest = function() {
            const xhr = new OriginalXHR();
            const originalXHROpen = xhr.open;
            xhr.open = function(method, url, async, user, password) {
              arguments[1] = proxyUrl(url);
              return originalXHROpen.apply(xhr, arguments);
            };
            return xhr;
          };

          // ---- MutationObserver 动态元素重写 ----
          function rewriteElement(elem) {
            if (elem.nodeType !== 1) return;
            if (elem.tagName === 'A' && elem.hasAttribute('href')) {
              const href = elem.getAttribute('href');
              if (href && !/^(javascript:|mailto:|data:|#|about:)/i.test(href)) {
                elem.setAttribute('href', proxyUrl(href));
              }
            }
            if (elem.tagName === 'FORM' && elem.hasAttribute('action')) {
              elem.setAttribute('action', proxyUrl(elem.getAttribute('action')));
            }
            if ((elem.tagName === 'BUTTON' || elem.tagName === 'INPUT') && elem.hasAttribute('formaction')) {
              elem.setAttribute('formaction', proxyUrl(elem.getAttribute('formaction')));
            }
            // 处理 meta refresh 动态添加
            if (elem.tagName === 'META' && elem.getAttribute('http-equiv')?.toLowerCase() === 'refresh') {
              let content = elem.getAttribute('content');
              if (content) {
                content = content.replace(/url\s*=\s*([^;]*)/i, (full, urlPart) => {
                  let url = urlPart.trim().replace(/^['"]|['"]$/g, '');
                  if (url) return 'url=' + proxyUrl(url);
                  return full;
                });
                elem.setAttribute('content', content);
              }
            }
            // 递归子元素
            for (const child of elem.children) {
              rewriteElement(child);
            }
          }

          if (document.body) rewriteElement(document.body);

          const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) rewriteElement(node);
              });
              if (mutation.type === 'attributes' && mutation.target.nodeType === 1) {
                const el = mutation.target;
                const attr = mutation.attributeName;
                if (attr === 'href' && el.tagName === 'A') {
                  const href = el.getAttribute('href');
                  if (href && !/^(javascript:|mailto:|data:|#|about:)/i.test(href)) {
                    el.setAttribute('href', proxyUrl(href));
                  }
                } else if (attr === 'action' && el.tagName === 'FORM') {
                  el.setAttribute('action', proxyUrl(el.getAttribute('action')));
                } else if (attr === 'formaction') {
                  el.setAttribute('formaction', proxyUrl(el.getAttribute('formaction')));
                } else if (attr === 'content' && el.tagName === 'META' && el.getAttribute('http-equiv')?.toLowerCase() === 'refresh') {
                  let content = el.getAttribute('content');
                  if (content) {
                    content = content.replace(/url\s*=\s*([^;]*)/i, (full, urlPart) => {
                      let url = urlPart.trim().replace(/^['"]|['"]$/g, '');
                      if (url) return 'url=' + proxyUrl(url);
                      return full;
                    });
                    el.setAttribute('content', content);
                  }
                }
              }
            }
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'action', 'formaction', 'content']
          });

          // ---- 全局事件拦截（兜底） ----
          document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (!link || !link.href) return;
            const rawHref = link.getAttribute('href');
            if (rawHref && !/^(javascript:|mailto:|#)/i.test(rawHref)) {
              e.preventDefault();
              e.stopImmediatePropagation();
              window.location.assign(rawHref);
            }
          }, true);

          document.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const form = e.target;
            const formData = new FormData(form);
            const params = new URLSearchParams(formData).toString();
            let action = form.getAttribute('action') || originalUrl;
            let actionUrl;
            try {
              actionUrl = new URL(action, originalUrl);
            } catch {
              actionUrl = new URL(originalUrl);
            }
            if ((form.method || 'get').toLowerCase() === 'get') {
              actionUrl.search = params;
            }
            window.location.assign(actionUrl.href);
          }, true);

          // 覆盖 form.submit()
          HTMLFormElement.prototype.submit = function() {
            const event = new Event('submit', { cancelable: true });
            if (this.dispatchEvent(event)) {
              const form = this;
              const formData = new FormData(form);
              const params = new URLSearchParams(formData).toString();
              let action = form.getAttribute('action') || originalUrl;
              let actionUrl;
              try {
                actionUrl = new URL(action, originalUrl);
              } catch {
                actionUrl = new URL(originalUrl);
              }
              if ((form.method || 'get').toLowerCase() === 'get') {
                actionUrl.search = params;
              }
              window.location.assign(actionUrl.href);
            }
          };
        })();
      </script>
    `;

    // 将 <base> 和拦截脚本放入 <head> 最前面
    html = html.replace(/<head\b[^>]*>/i, '<head>' + baseTag + interceptorScript);

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
<body>
<div id="__topvpn_bar__" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
  <span style="font-weight:600;">🌐 代理</span>
  <input id="__topvpn_url__" type="text" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址并回车">
  <button onclick="location.reload()" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">刷新</button>
  <button onclick="window.location.href='/topvpn.html'" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">← 返回</button>
</div>
<div class="error-box" style="margin-top:60px;"><h2>代理请求失败</h2><p>${err.message}</p></div>
</body></html>`;
    return new Response(errorHtml, {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
