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

    // 安全的响应头（增加 content-length）
    const safeHeaders = new Headers();
    const headersToKeep = [
      'content-type',
      'content-encoding',
      'content-language',
      'cache-control',
      'expires',
      'last-modified',
      'etag',
      'content-length'
    ];
    for (const header of headersToKeep) {
      const value = response.headers.get(header);
      if (value !== null && value !== undefined) {
        safeHeaders.set(header, value);
      }
    }
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    // 移除可能阻止嵌套或影响 Cookie 的头
    safeHeaders.delete('X-Frame-Options');
    safeHeaders.delete('Content-Security-Policy');
    safeHeaders.delete('X-Content-Type-Options');
    safeHeaders.delete('Strict-Transport-Security');
    safeHeaders.delete('Set-Cookie');

    if (isHTML) {
      let html = await response.text();
      const proxyBase = '/api/vpn?url=';

      // 1. 处理 <base> 标签：重写其 href 为代理链接，或直接移除（这里选择移除，避免干扰）
      html = html.replace(/<base\b[^>]*>/gi, '');

      // 2. 重写所有资源链接
      html = html.replace(/(href|src|action)\s*=\s*["']([^"'\s>]+)["']/gi, (match, attr, url) => {
        // 跳过特殊协议
        if (/^(javascript:|mailto:|data:|#)/i.test(url)) return match;
        let fullUrl;
        try {
          // 使用 finalUrl.href 作为基准，保留路径信息
          fullUrl = new URL(url, finalUrl.href).href;
        } catch {
          return match;
        }
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

      // 3. 单独处理 srcset 属性
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

      // 4. 注入拦截脚本（修复相对路径、location、history）
      const interceptorScript = `
        <script>
          (function() {
            const proxyBase = '/api/vpn?url=';

            // 将 URL 转为绝对路径再代理
            function proxyUrl(url) {
              try {
                const absolute = new URL(url, location.href).href;
                return proxyBase + encodeURIComponent(absolute);
              } catch(e) {
                return url;
              }
            }

            // 拦截 fetch
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
              let url;
              if (typeof input === 'string') {
                url = proxyUrl(input);
              } else if (input instanceof Request) {
                url = proxyUrl(input.url);
                init = Object.assign({}, input, init);
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

            // 安全地重写导航方法，避免定义 location 属性
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
              if (url) {
                arguments[2] = proxyUrl(url);
              }
              return originalPushState.apply(history, arguments);
            };
            history.replaceState = function(state, title, url) {
              if (url) {
                arguments[2] = proxyUrl(url);
              }
              return originalReplaceState.apply(history, arguments);
            };

            // 监听链接点击（备用，防止 a 标签直接跳转）
            document.addEventListener('click', function(e) {
              const target = e.target.closest('a');
              if (target && target.href) {
                const href = target.getAttribute('href');
                if (href && !/^(javascript:|mailto:|#)/i.test(href)) {
                  e.preventDefault();
                  window.location.assign(href);
                }
              }
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

    // 非 HTML 资源
    return new Response(response.body, {
      status: response.status,
      headers: safeHeaders
    });
  } catch (err) {
    // 返回友好的 HTML 错误页，而不是 JSON
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
