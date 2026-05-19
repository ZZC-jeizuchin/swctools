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

    // 安全的响应头
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
    // 顶层窗口不需要移除 X-Frame-Options，但移除也没坏处
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

    // 重写链接属性
    html = html.replace(/(href|src|action)\s*=\s*["']([^"'\s>]+)["']/gi, (match, attr, url) => {
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

    // 注入控制栏 + 拦截脚本
    const controlBarStyle = `
      position:fixed; top:0; left:0; right:0; z-index:2147483647;
      background:#1e293b; color:white; display:flex; align-items:center;
      padding:8px 12px; gap:10px; font-family:system-ui,sans-serif;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    `;
    const inputStyle = `
      flex:1; padding:6px 12px; border-radius:20px; border:none;
      font-size:14px; background:#334155; color:white; outline:none;
    `;
    const btnStyle = `
      background:#3b82f6; border:none; color:white; padding:6px 14px;
      border-radius:20px; font-size:13px; cursor:pointer; white-space:nowrap;
    `;

    const controlBarHTML = `
      <div id="__topvpn_bar__" style="${controlBarStyle}">
        <span style="font-weight:600;">🌐 代理</span>
        <input id="__topvpn_url__" type="text" style="${inputStyle}" placeholder="输入新网址并回车">
        <button id="__topvpn_refresh__" style="${btnStyle}">刷新</button>
        <button id="__topvpn_home__" style="background:#475569; ${btnStyle}">← 返回主页</button>
      </div>
    `;

    const interceptorScript = `
      <script>
        (function() {
          const proxyBase = '/api/topvpn?url=';
          // 提取原始目标 URL
          const urlParams = new URLSearchParams(location.search);
          const originalUrl = decodeURIComponent(urlParams.get('url') || '');

          // 创建控制栏（插入 body 最前面）
          const bar = document.createElement('div');
          bar.id = '__topvpn_bar__';
          bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
          bar.innerHTML = '<span style="font-weight:600;">🌐 代理</span>' +
            '<input id="__topvpn_url__" type="text" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址并回车">' +
            '<button id="__topvpn_refresh__" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">刷新</button>' +
            '<button id="__topvpn_home__" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">← 返回</button>';
          document.documentElement.prepend(bar); // 放到最前面，避免影响 body 样式
          // 页面顶部留出空间（可选）
          document.documentElement.style.paddingTop = '48px';

          // 控制栏功能
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
            try {
              const absolute = new URL(inputUrl, originalUrl || location.href).href;
              return proxyBase + encodeURIComponent(absolute);
            } catch(e) {
              return inputUrl;
            }
          }

          // 拦截 fetch（保留 Request 对象完整性）
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

          // 拦截 location.assign / replace（顶层窗口同样需要，防止页面跳转到真实域）
          const originalAssign = window.location.assign.bind(window.location);
          const originalReplace = window.location.replace.bind(window.location);
          window.location.assign = function(url) {
            return originalAssign(proxyUrl(url));
          };
          window.location.replace = function(url) {
            return originalReplace(proxyUrl(url));
          };

          // 拦截 history.pushState / replaceState（SPA 路由）
          const originalPushState = history.pushState;
          const originalReplaceState = history.replaceState;
          history.pushState = function(state, title, url) {
            if (url) arguments[2] = proxyUrl(url);
            return originalPushState.apply(history, arguments);
          };
          history.replaceState = function(state, title, url) {
            if (url) arguments[2] = proxyUrl(url);
            return originalReplaceState.apply(history, arguments);
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

          // 全局拦截表单提交（包括 form.submit() 编程式提交）
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
          // 重写 form.submit 方法
          const originalFormSubmit = HTMLFormElement.prototype.submit;
          HTMLFormElement.prototype.submit = function() {
            submitFormViaProxy(this);
          };
        })();
      </script>
    `;

    // 注入脚本放到 head 最前面，控制栏也直接注入到 head 前，确保最先加载
    html = html.replace(/<head\b[^>]*>/i, '<head>' + interceptorScript);
    // 控制栏通过脚本创建，不需要直接插入 HTML，这样更灵活

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
