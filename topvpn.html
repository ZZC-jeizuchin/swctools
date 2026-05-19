export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');

  if (!urlParam) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
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

    // 只重写资源链接（src, action），不重写 href
    html = html.replace(/(src|action)\s*=\s*["']([^"'\s>]+)["']/gi, (match, attr, url) => {
      if (/^(javascript:|mailto:|data:|#)/i.test(url)) return match;
      try {
        const fullUrl = new URL(url, finalUrl.href).href;
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      } catch {
        return match;
      }
    });

    // 处理 srcset
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

    // 注入脚本（关键：锁定导航方法）
    const interceptorScript = `
      <script>
        (function() {
          const proxyBase = '/api/topvpn?url=';
          // 从当前地址参数提取原始目标 URL（不会因提取失败而退出）
          const urlParams = new URLSearchParams(location.search);
          let originalUrl = '';
          try {
            originalUrl = decodeURIComponent(urlParams.get('url') || '');
          } catch (e) {}

          // 创建控制栏
          const bar = document.createElement('div');
          bar.id = '__topvpn_bar__';
          bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
          bar.innerHTML = '<span style="font-weight:600;">🌐 代理</span>' +
            '<input id="__topvpn_url__" type="text" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址并回车">' +
            '<button id="__topvpn_refresh__" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">刷新</button>' +
            '<button id="__topvpn_home__" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">← 返回</button>';
          document.documentElement.prepend(bar);
          document.documentElement.style.paddingTop = '48px';

          // 控制栏功能
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
          document.getElementById('__topvpn_refresh__').addEventListener('click', function() {
            window.location.reload();
          });
          document.getElementById('__topvpn_home__').addEventListener('click', function() {
            window.location.href = '/topvpn.html';
          });

          // 工具函数：将任意 URL 转为代理链接
          function proxyUrl(inputUrl) {
            if (!inputUrl) return inputUrl;
            if (inputUrl.startsWith(proxyBase)) return inputUrl;
            const base = originalUrl || location.href;  // 基准回退
            try {
              const absolute = new URL(inputUrl, base).href;
              return proxyBase + encodeURIComponent(absolute);
            } catch(e) {
              return inputUrl;
            }
          }

          // 保存原始方法
          const originalAssign = window.location.assign.bind(window.location);
          const originalReplace = window.location.replace.bind(window.location);
          const originalPushState = history.pushState.bind(history);
          const originalReplaceState = history.replaceState.bind(history);

          // 重写并锁定 location.assign
          Object.defineProperty(window.location, 'assign', {
            value: function(url) {
              return originalAssign(proxyUrl(url));
            },
            writable: false,
            configurable: false
          });

          // 重写并锁定 location.replace
          Object.defineProperty(window.location, 'replace', {
            value: function(url) {
              return originalReplace(proxyUrl(url));
            },
            writable: false,
            configurable: false
          });

          // 重写并锁定 history.pushState
          Object.defineProperty(history, 'pushState', {
            value: function(state, title, url) {
              if (url) arguments[2] = proxyUrl(url);
              return originalPushState.apply(history, arguments);
            },
            writable: false,
            configurable: false
          });

          // 重写并锁定 history.replaceState
          Object.defineProperty(history, 'replaceState', {
            value: function(state, title, url) {
              if (url) arguments[2] = proxyUrl(url);
              return originalReplaceState.apply(history, arguments);
            },
            writable: false,
            configurable: false
          });

          // 拦截 Location.prototype.href 的 setter（防止直接赋值 href 绕过）
          const originalHrefDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
          if (originalHrefDescriptor && originalHrefDescriptor.set) {
            Object.defineProperty(Location.prototype, 'href', {
              get: originalHrefDescriptor.get,
              set: function(url) {
                // 直接调用我们锁定的 assign，从而走代理
                window.location.assign(url);
              },
              configurable: false
            });
          }

          // 拦截 fetch
          const originalFetch = window.fetch;
          window.fetch = function(input, init) {
            if (typeof input === 'string') {
              return originalFetch(proxyUrl(input), init);
            }
            if (input instanceof Request) {
              const newUrl = proxyUrl(input.url);
              return originalFetch(new Request(newUrl, input), init);
            }
            return originalFetch(proxyUrl(input.toString()), init);
          };

          // 拦截 XMLHttpRequest
          const OriginalXHR = window.XMLHttpRequest;
          window.XMLHttpRequest = function() {
            const xhr = new OriginalXHR();
            const originalOpen = xhr.open;
            xhr.open = function(method, url, async, user, password) {
              arguments[1] = proxyUrl(url);
              return originalOpen.apply(xhr, arguments);
            };
            return xhr;
          };

          // 全局拦截 <a> 标签点击
          document.addEventListener('click', function(e) {
            const link = e.target.closest('a');
            if (link && link.href) {
              const rawHref = link.getAttribute('href');
              if (rawHref && !/^(javascript:|mailto:|#)/i.test(rawHref)) {
                e.preventDefault();
                window.location.assign(rawHref);
              }
            }
          }, true);

          // 全局拦截表单提交（包含 form.submit()）
          function submitFormViaProxy(form) {
            const target = form.getAttribute('target') || '_self';
            if (target !== '_self' && target !== '' && target !== '_parent' && target !== '_top') return;
            const formData = new FormData(form);
            const params = new URLSearchParams(formData).toString();
            let action = form.getAttribute('action') || originalUrl || window.location.href;
            let actionUrl;
            try {
              actionUrl = new URL(action, originalUrl || window.location.href);
            } catch {
              actionUrl = new URL(originalUrl || window.location.href);
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