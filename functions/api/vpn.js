export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');

  if (!urlParam) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const targetUrl = new URL(urlParam);
    const response = await fetch(targetUrl.toString(), {
      redirect: 'manual',
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

      // 1. 重写相对路径资源，使其指向代理
      html = html.replace(/(href|src|action)\s*=\s*["'](?!https?:\/\/|\/\/|#|javascript:|mailto:|data:)([^"'\s>]+)["']/gi, (match, attr, path) => {
        const fullUrl = new URL(path, targetUrl.origin).href;
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

      // 2. 注入防止跳出代理的脚本
      const antiBreakoutScript = `
        <script>
          (function() {
            // 拦截 window.location 的赋值操作，防止页面跳出代理
            var originalLocation = window.location;
            var proxyBase = '/api/vpn?url=';
            
            Object.defineProperty(window, 'location', {
              get: function() { return originalLocation; },
              set: function(url) {
                // 捕获所有对 window.location 的赋值
                // 如果设置的是新的 URL，则改为通过代理跳转
                try {
                  var newUrl = new URL(url, originalLocation.href);
                  if (newUrl.hostname !== originalLocation.hostname || newUrl.pathname !== originalLocation.pathname) {
                    // 只有确实要跳转到其他页面时才通过代理
                    window.location.href = proxyBase + encodeURIComponent(newUrl.href);
                  } else {
                    // 同页面内的 hash 变化不做处理
                    originalLocation.href = newUrl.href;
                  }
                } catch(e) {
                  // 如果传入的不是有效 URL，则直接使用原行为
                  originalLocation.href = url;
                }
              }
            });

            // 同时拦截 document.location (某些老代码可能会用)
            try {
              Object.defineProperty(document, 'location', {
                get: function() { return window.location; },
                set: function(url) { window.location = url; }
              });
            } catch(e) {}

            // 拦截 a 标签的 target="_top" 和 target="_parent" 属性
            document.addEventListener('click', function(e) {
              var target = e.target;
              while (target && target.tagName !== 'A') {
                target = target.parentNode;
              }
              if (target && (target.getAttribute('target') === '_top' || target.getAttribute('target') === '_parent')) {
                e.preventDefault();
                var href = target.getAttribute('href');
                if (href) {
                  var newUrl = new URL(href, window.location.href);
                  window.location.href = proxyBase + encodeURIComponent(newUrl.href);
                }
              }
            }, true);
          })();
        </script>
      `;

      // 将脚本插入到 head 标签的最前面，确保尽早执行
      html = html.replace(/<head\b[^>]*>/i, '<head>' + antiBreakoutScript);

      return new Response(html, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 非 HTML 内容直接返回
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: '代理请求失败: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
