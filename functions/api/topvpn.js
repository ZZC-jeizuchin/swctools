export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');

  if (!urlParam) {
    // ... 保留你原来的 inputPage 和 invalidPage 处理逻辑，这里不变 ...
    return new Response(inputPage, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  let targetUrl;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return new Response(invalidPage, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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

    // ★★★ 核心修复：使用 HTMLRewriter 进行服务端 URL 重写 ★★★
    const proxyBase = '/api/topvpn?url=';
    
    // 创建 ElementHandler，用于处理需要重写的属性
    class AttributeRewriter {
      constructor(attributeName) {
        this.attributeName = attributeName;
      }
      
      element(element) {
        const originalUrl = element.getAttribute(this.attributeName);
        if (originalUrl && !/^(javascript:|mailto:|data:|#)/i.test(originalUrl)) {
          try {
            const absoluteUrl = new URL(originalUrl, finalUrl.href).href;
            const proxyUrl = proxyBase + encodeURIComponent(absoluteUrl);
            element.setAttribute(this.attributeName, proxyUrl);
          } catch (e) {
            // 解析失败则保持原样，防止破坏页面
          }
        }
      }
    }

    // 创建用于处理 <base> 标签的 ElementHandler
    class BaseRemover {
      element(element) {
        element.remove();
      }
    }

    // 创建用于处理 <meta> CSP 标签的 ElementHandler
    class MetaCSPRemover {
      element(element) {
        const httpEquiv = element.getAttribute('http-equiv');
        if (httpEquiv && httpEquiv.toLowerCase() === 'content-security-policy') {
          element.remove();
        }
      }
    }

    // 创建用于注入控制栏的 ElementHandler
    class BodyInjector {
      constructor(originalUrl) {
        this.originalUrl = originalUrl;
      }
      
      element(element) {
        // 在 <body> 前添加控制栏 HTML
        element.prepend(`
          <div id="__topvpn_bar__" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            <span style="font-weight:600;">🌐 代理</span>
            <input id="__topvpn_url__" type="text" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址并回车">
            <button id="__topvpn_refresh__" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">刷新</button>
            <button id="__topvpn_home__" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">← 返回</button>
          </div>
          <script>
            (function() {
              const proxyBase = '/api/topvpn?url=';
              const originalUrl = ${JSON.stringify(finalUrl.href)};
              
              // 控制栏功能
              const urlInput = document.getElementById('__topvpn_url__');
              urlInput.value = originalUrl;
              urlInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                  let val = this.value.trim();
                  if (!val) return;
                  if (!/^https?:\\/\\//i.test(val)) val = 'https://' + val;
                  window.location.href = proxyBase + encodeURIComponent(val);
                }
              });
              document.getElementById('__topvpn_refresh__').addEventListener('click', () => location.reload());
              document.getElementById('__topvpn_home__').addEventListener('click', () => { window.location.href = '/topvpn.html'; });
            })();
          </script>
        `);
      }
    }

    // 构建 HTMLRewriter
    const rewriter = new HTMLRewriter()
      // 重写各类资源链接
      .on('a[href]', new AttributeRewriter('href'))
      .on('link[href]', new AttributeRewriter('href'))
      .on('area[href]', new AttributeRewriter('href'))
      .on('form[action]', new AttributeRewriter('action'))
      .on('button[formaction]', new AttributeRewriter('formaction'))
      .on('input[formaction]', new AttributeRewriter('formaction'))
      .on('img[src]', new AttributeRewriter('src'))
      .on('script[src]', new AttributeRewriter('src'))
      .on('link[src]', new AttributeRewriter('src'))
      .on('video[src]', new AttributeRewriter('src'))
      .on('audio[src]', new AttributeRewriter('src'))
      .on('source[src]', new AttributeRewriter('src'))
      .on('track[src]', new AttributeRewriter('src'))
      .on('embed[src]', new AttributeRewriter('src'))
      .on('iframe[src]', new AttributeRewriter('src'))
      .on('frame[src]', new AttributeRewriter('src'))
      // 处理 srcset 属性（需要特殊处理）
      .on('img[srcset]', {
        element(element) {
          const srcsetValue = element.getAttribute('srcset');
          if (srcsetValue) {
            const newSrcset = srcsetValue.split(',').map(part => {
              const trimmed = part.trim();
              const [url, ...rest] = trimmed.split(/\s+/);
              if (url && !/^(javascript:|data:)/i.test(url)) {
                try {
                  const absoluteUrl = new URL(url, finalUrl.href).href;
                  return proxyBase + encodeURIComponent(absoluteUrl) + (rest.length ? ' ' + rest.join(' ') : '');
                } catch (e) {
                  return trimmed;
                }
              }
              return trimmed;
            }).join(', ');
            element.setAttribute('srcset', newSrcset);
          }
        }
      })
      // 移除 <base> 标签
      .on('base', new BaseRemover())
      // 移除 <meta> 中的 CSP 指令
      .on('meta[http-equiv]', new MetaCSPRemover())
      // 注入控制栏
      .on('body', new BodyInjector(finalUrl.href));

    // 使用 HTMLRewriter 转换响应
    const transformedResponse = rewriter.transform(response);

    return new Response(transformedResponse.body, {
      status: response.status,
      headers: safeHeaders
    });
  } catch (err) {
    // ... 保留你原来的 errorHtml 处理逻辑，这里不变 ...
    return new Response(errorHtml, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
