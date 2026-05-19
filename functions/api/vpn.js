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
      redirect: 'follow',          // 跟随重定向拿到最终页面
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });

    // 获取最终响应的 URL（重定向后的真实地址）
    const finalUrl = new URL(response.url);
    const contentType = response.headers.get('Content-Type') || '';
    const isHTML = contentType.includes('text/html');

    // 1. 构建安全、干净的响应头（剔除所有可能阻止嵌入的头部）
    const safeHeaders = new Headers();

    // 只复制必要的头部，其余一概丢弃
    const headersToKeep = ['content-type', 'content-encoding', 'content-language', 'cache-control', 'expires', 'last-modified', 'etag'];
    for (const header of headersToKeep) {
      const value = response.headers.get(header);
      if (value) safeHeaders.set(header, value);
    }

    // 显式允许任何来源的嵌套
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    safeHeaders.delete('X-Frame-Options');
    safeHeaders.delete('Content-Security-Policy');
    safeHeaders.delete('X-Content-Type-Options');
    safeHeaders.delete('Strict-Transport-Security');
    safeHeaders.delete('Set-Cookie');   // 避免 Cookie 干扰

    if (isHTML) {
      let html = await response.text();
      const proxyBase = '/api/vpn?url=';

      // 2. 重写 HTML 中的相对资源路径（基于最终响应地址，而非原始请求地址）
      html = html.replace(/(href|src|action|srcset)\s*=\s*["'](?!https?:\/\/|\/\/|#|javascript:|mailto:|data:)([^"'\s>]+)["']/gi, (match, attr, path) => {
        const fullUrl = new URL(path, finalUrl.origin).href;
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

      // 3. 注入网络拦截脚本（让所有动态请求也走代理）
      const interceptorScript = `
        <script>
          (function() {
            const proxyBase = '/api/vpn?url=';
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
            const OriginalXHR = window.XMLHttpRequest;
            window.XMLHttpRequest = function() {
              const xhr = new OriginalXHR();
              let originalOpen = xhr.open;
              xhr.open = function(method, url, async, user, password) {
                const proxiedUrl = proxyBase + encodeURIComponent(url);
                originalOpen.call(xhr, method, proxiedUrl, async, user, password);
              };
              return xhr;
            };
          })();
        </script>
      `;
      html = html.replace(/<head\b[^>]*>/i, '<head>' + interceptorScript);

      return new Response(html, {
        status: response.status,
        headers: safeHeaders
      });
    }

    // 非 HTML 资源同样使用清理后的头部
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
