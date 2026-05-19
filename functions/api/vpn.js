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
      if (value !== null && value !== undefined) {
        safeHeaders.set(header, value);
      }
    }
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    safeHeaders.delete('X-Frame-Options');
    safeHeaders.delete('Content-Security-Policy');
    safeHeaders.delete('X-Content-Type-Options');
    safeHeaders.delete('Strict-Transport-Security');
    safeHeaders.delete('Set-Cookie');

    if (isHTML) {
      let html = await response.text();
      const proxyBase = '/api/vpn?url=';

      // 移除 <base> 标签
      html = html.replace(/<base\b[^>]*>/gi, '');

      // 重写资源链接
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

      // 注入前端拦截脚本 — 关键修复
      const interceptorScript = `
        <script>
          (function() {
            const proxyBase = '/api/vpn?url=';

            // 从当前代理地址提取原始站点 URL
            const urlParams = new URLSearchParams(location.search);
            const rawUrl = urlParams.get('url');
            if (!rawUrl) return;
            const originalUrl = decodeURIComponent(rawUrl);

            // 容错代理函数
            function proxyUrl(inputUrl) {
              if (!inputUrl) return inputUrl;
              if (inputUrl.startsWith(proxyBase)) return inputUrl;
              try {
                let absolute;
                if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://') || inputUrl.startsWith('//')) {
                  absolute = new URL(inputUrl, originalUrl).href;
                } else {
                  absolute = new URL(inputUrl, originalUrl).href;
                }
                return proxyBase + encodeURIComponent(absolute);
              } catch (e) {
                return inputUrl;
              }
            }

            // 拦截 fetch（修正 Request 处理）
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
              let url;
              if (typeof input === 'string') {
                url = proxyUrl(input);
              } else if (input instanceof Request) {
                url = proxyUrl(input.url);
                // 创建新 Request 保留原始属性，init 覆盖
                return originalFetch(new Request(url, input), init);
              } else {
                url = proxyUrl(input);
              }
              return originalFetch(url, init);
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

            // 安全拦截 location 方法
            const originalAssign = window.location.assign.bind(window.location);
            const originalReplace = window.location.replace.bind(window.location);
            window.location.assign = function(url) {
              return originalAssign(proxyUrl(url));
            };
            window.location.replace = function(url) {
              return originalReplace(proxyUrl(url));
            };

            // 拦截 history 路由
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

            // 全局拦截 a 标签点击
            document.addEventListener('click', function(e) {
              const target = e.target.closest('a');
              if (target && target.href) {
                const rawHref = target.getAttribute('href');
                if (rawHref && !/^(javascript:|mailto:|#)/i.test(rawHref)) {
                  e.preventDefault();
                  window.location.assign(rawHref);
                }
              }
            }, true);

            // 全局拦截表单提交（防止搜索表单绕过）
            document.addEventListener('submit', function(e) {
              const form = e.target;
              if (form.tagName !== 'FORM') return;
              const target = form.getAttribute('target') || '_self';
              if (target !== '_self' && target !== '' && target !== '_parent' && target !== '_top') return;
              e.preventDefault();
              let action = form.getAttribute('action') || window.location.href;
              const method = (form.method || 'get').toLowerCase();
              const formData = new FormData(form);
              const queryString = new URLSearchParams(formData).toString();
              let finalAction;
              if (method === 'get') {
                finalAction = action + (action.includes('?') ? '&' : '?') + queryString;
              } else {
                // POST 表单转为 GET 并用代理加载（通常搜索为 GET）
                finalAction = action + (action.includes('?') ? '&' : '?') + queryString;
              }
              window.location.assign(finalAction);
            }, true);
          })();
        </script>
      `;
      html = html.replace(/<head\b[^>]*>/i, '<head>' + interceptorScript);

      return new Response(html, {
        status: response.status,
        headers: safeHeaders
      });
    }

    return new Response(response.body, {
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
