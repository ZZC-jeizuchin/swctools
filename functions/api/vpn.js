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

    // 创建一个新 Headers，从原响应中复制，然后移除限制性头部
    const newHeaders = new Headers(response.headers);
    // 必须删除以下头部，否则浏览器会阻止显示
    newHeaders.delete('x-frame-options');
    newHeaders.delete('content-security-policy');
    newHeaders.delete('x-content-type-options');
    newHeaders.delete('strict-transport-security');
    // 允许被任意页面嵌入
    newHeaders.set('access-control-allow-origin', '*');

    if (isHTML) {
      let html = await response.text();
      const proxyBase = '/api/vpn?url=';

      // 重写静态资源路径
      html = html.replace(/(href|src|action|srcset)\s*=\s*["'](?!https?:\/\/|\/\/|#|javascript:|mailto:|data:)([^"'\s>]+)["']/gi, (match, attr, path) => {
        const fullUrl = new URL(path, targetUrl.origin).href;
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

      // 注入全局请求拦截脚本
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
      newHeaders.set('content-type', 'text/html; charset=utf-8');

      return new Response(html, {
        status: response.status,
        headers: newHeaders
      });
    }

    // 非 HTML 内容直接使用清理后的头部
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: '代理请求失败: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
