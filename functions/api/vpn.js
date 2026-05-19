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

    // 只保留最基础的头，彻底移除安全限制
    const safeHeaders = new Headers();
    const headersToKeep = ['content-type', 'content-encoding', 'content-language', 'cache-control', 'expires', 'last-modified', 'etag'];
    for (const header of headersToKeep) {
      const value = response.headers.get(header);
      if (value) safeHeaders.set(header, value);
    }
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    // 显式删除可能阻止嵌套的头
    safeHeaders.delete('X-Frame-Options');
    safeHeaders.delete('Content-Security-Policy');
    safeHeaders.delete('X-Content-Type-Options');
    safeHeaders.delete('Strict-Transport-Security');
    safeHeaders.delete('Set-Cookie');

    if (isHTML) {
      let html = await response.text();
      const proxyBase = '/api/vpn?url=';

      // 重写所有链接和资源路径
      html = html.replace(/(href|src|action|srcset)\s*=\s*["']([^"'\s>]+)["']/gi, (match, attr, url) => {
        // 跳过 javascript:、mailto:、data: 和纯锚点
        if (/^(javascript:|mailto:|data:|#)/i.test(url)) return match;
        let fullUrl;
        try {
          // 尝试解析为绝对URL（相对于最终页面地址）
          fullUrl = new URL(url, finalUrl.origin).href;
        } catch {
          return match; // 无效路径则保留原样
        }
        // 无论原来是相对还是绝对，都重写为代理链接
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

      // 注入动态跳转拦截脚本
      const interceptorScript = `
        <script>
          (function() {
            const proxyBase = '/api/vpn?url=';
            // 拦截 fetch
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
              let url = input;
              if (typeof input === 'string') {
                url = proxyBase + encodeURIComponent(input);
              } else if (input instanceof Request) {
                url = proxyBase + encodeURIComponent(input.url);
                init = init || {};
                init.method = init.method || input.method;
                init.headers = new Headers(input.headers);
                init.body = input.body;
              }
              return originalFetch(url, init);
            };
            // 拦截 XMLHttpRequest
            const OriginalXHR = window.XMLHttpRequest;
            window.XMLHttpRequest = function() {
              const xhr = new OriginalXHR();
              const originalOpen = xhr.open;
              xhr.open = function(method, url, async, user, password) {
                const proxiedUrl = proxyBase + encodeURIComponent(url);
                originalOpen.call(xhr, method, proxiedUrl, async, user, password);
              };
              return xhr;
            };
            // 拦截 window.location 赋值，防止跳出iframe
            const originalLocation = window.location;
            Object.defineProperty(window, 'location', {
              get: function() { return originalLocation; },
              set: function(url) {
                try {
                  const newUrl = new URL(url, originalLocation.href);
                  originalLocation.href = proxyBase + encodeURIComponent(newUrl.href);
                } catch(e) {
                  originalLocation.href = url;
                }
              }
            });
          })();
        </script>
      `;
      html = html.replace(/<head\b[^>]*>/i, '<head>' + interceptorScript);

      return new Response(html, {
        status: response.status,
        headers: safeHeaders
      });
    }

    // 非 HTML 资源同样使用安全的头
    return new Response(response.body, {
      status: response.status,
      headers: safeHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: '代理请求失败: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
