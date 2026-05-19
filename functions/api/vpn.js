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

    const contentType = response.headers.get('Content-Type') || '';
    const isHTML = contentType.includes('text/html');

    if (isHTML) {
      let html = await response.text();
      const proxyBase = '/api/vpn?url=';

      // 1. 重写 HTML 中的静态资源路径（图片、CSS、JS 等）
      html = html.replace(/(href|src|action)\s*=\s*["'](?!https?:\/\/|\/\/|#|javascript:|mailto:|data:)([^"'\s>]+)["']/gi, (match, attr, path) => {
        const fullUrl = new URL(path, targetUrl.origin).href;
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

      // 2. 注入全局网络拦截脚本（覆盖 fetch、XMLHttpRequest、WebSocket）
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
              let originalOpen = xhr.open;
              xhr.open = function(method, url, async, user, password) {
                const proxiedUrl = proxyBase + encodeURIComponent(url);
                originalOpen.call(xhr, method, proxiedUrl, async, user, password);
              };
              return xhr;
            };

            // 拦截 WebSocket（如果代理支持 WebSocket 转发，可启用）
            // 此处暂不处理，因为 Cloudflare Functions 无法直接代理 WebSocket
          })();
        </script>
      `;

      // 将拦截脚本插入到 head 最前面，确保最先执行
      html = html.replace(/<head\b[^>]*>/i, '<head>' + interceptorScript);

      // 3. 移除可能阻止脚本注入的响应头（在返回时清理）
      return new Response(html, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          // 强制移除目标网站的安全策略头
          'X-Frame-Options': '',
          'Content-Security-Policy': ''
        }
      });
    }

    // 非 HTML 内容直接返回，同样移除限制头
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('X-Frame-Options');
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: '代理请求失败: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
