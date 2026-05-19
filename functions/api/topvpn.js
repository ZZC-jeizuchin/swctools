export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');

  // 缺少参数 → 返回输入页面（保留你原来完整的 inputPage）
  if (!urlParam) {
    const inputPage = `...你原来的输入页面 HTML...`;
    return new Response(inputPage, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    const invalidPage = `...你原来的网址无效页面...`;
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

    // 移除 <base> 和 <meta> CSP
    html = html.replace(/<base\b[^>]*>/gi, '');
    html = html.replace(/<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*\/?>/gi, '');
    html = html.replace(/<meta\b[^>]*\bcontent-security-policy[^>]*\/?>/gi, '');

    // 辅助函数：转代理链接
    const toProxyUrl = (u) => {
      if (!u || /^(javascript:|mailto:|data:|#|about:)/i.test(u)) return u;
      try {
        const absolute = new URL(u, finalUrl.href).href;
        return proxyBase + encodeURIComponent(absolute);
      } catch { return u; }
    };

    // 重写静态属性（保留原有正则）
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

    // 注入前端拦截脚本（包含 MutationObserver）
    const interceptorScript = `
      <script>
        (function() {
          const proxyBase = '/api/topvpn?url=';
          const originalUrl = ${JSON.stringify(finalUrl.href)};

          // 控制栏（保证在任何页面都会显示）
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

          // 核心代理函数
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

          // 拦截 href setter
          const hrefDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
          if (hrefDesc && hrefDesc.set) {
            Object.defineProperty(Location.prototype, 'href', {
              get: hrefDesc.get,
              set: function(url) { originalAssign(proxyUrl(url)); },
              configurable: false
            });
          }

          // 锁定 assign / replace
          Object.defineProperty(window.location, 'assign', {
            value: function(url) { return originalAssign(proxyUrl(url)); },
            writable: false, configurable: false
          });
          Object.defineProperty(window.location, 'replace', {
            value: function(url) { return originalReplace(proxyUrl(url)); },
            writable: false, configurable: false
          });

          // 锁定 history
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

          // 拦截 window.open
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

          // ---- 动态 DOM 监控（MutationObserver） ----
          function rewriteElement(elem) {
            // 处理 <a>
            if (elem.tagName === 'A' && elem.hasAttribute('href')) {
              const href = elem.getAttribute('href');
              if (href && !/^(javascript:|mailto:|data:|#|about:)/i.test(href)) {
                elem.setAttribute('href', proxyUrl(href));
              }
            }
            // 处理 <form>
            if (elem.tagName === 'FORM' && elem.hasAttribute('action')) {
              elem.setAttribute('action', proxyUrl(elem.getAttribute('action')));
            }
            // 处理 <button>/<input> 的 formaction
            if ((elem.tagName === 'BUTTON' || elem.tagName === 'INPUT') && elem.hasAttribute('formaction')) {
              elem.setAttribute('formaction', proxyUrl(elem.getAttribute('formaction')));
            }
            // 递归处理子节点
            if (elem.children) {
              for (const child of elem.children) {
                rewriteElement(child);
              }
            }
          }

          // 初始重写（页面可能已经有部分 DOM）
          if (document.body) {
            rewriteElement(document.body);
          }

          // 监听后续的 DOM 变化
          const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element
                  rewriteElement(node);
                }
              });
              // 对于属性变化：如果 href/action 被脚本修改，我们也要截获
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
                } else if (attr === 'formaction' && (el.tagName === 'BUTTON' || el.tagName === 'INPUT')) {
                  el.setAttribute('formaction', proxyUrl(el.getAttribute('formaction')));
                }
              }
            }
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'action', 'formaction']
          });

          // 覆盖表单提交（编程式）
          HTMLFormElement.prototype.submit = function() {
            // 转交给自己的拦截逻辑
            const event = new Event('submit', { cancelable: true });
            if (this.dispatchEvent(event)) {
              // 如果事件被 preventDefault 处理，我们手动调用自己的处理器
            }
          };

          // 点击事件（防止动态创建的链接直接跳转）
          document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (!link || !link.href) return;
            const rawHref = link.getAttribute('href');
            if (rawHref && !/^(javascript:|mailto:|#)/i.test(rawHref)) {
              e.preventDefault();
              e.stopImmediatePropagation();
              window.location.assign(proxyUrl(rawHref));
            }
          }, true);

          // 提交事件
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

        })();
      </script>
    `;

    // 将脚本放在 head 最前面
    html = html.replace(/<head\b[^>]*>/i, '<head>' + interceptorScript);

    return new Response(html, {
      status: response.status,
      headers: safeHeaders
    });
  } catch (err) {
    // 错误页面也要有控制栏（否则用户可能看到空白页）
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
