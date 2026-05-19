export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');

  // 缺少参数 → 返回输入页面
  if (!urlParam) {
    return new Response(/* 输入页 HTML，和你之前一样，这里省略以节省篇幅 */, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return new Response(/* 网址无效页 */, {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
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
    for (const h of headersToKeep) {
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

    // ---- 处理 HTML ----
    let html = await response.text();
    const proxyBase = '/api/topvpn?url=';

    // 移除 <base> 标签
    html = html.replace(/<base\b[^>]*>/gi, '');

    // 辅助函数：将任意 URL 转为代理链接（基于 finalUrl）
    const toProxyUrl = (url) => {
      if (!url || /^(javascript:|mailto:|data:|#)/i.test(url)) return url;
      try {
        const absolute = new URL(url, finalUrl.href).href;
        return proxyBase + encodeURIComponent(absolute);
      } catch {
        return url; // 无法解析的保持原样，不破坏页面
      }
    };

    // 1. 重写所有 href 属性（a、link、area 等）
    html = html.replace(/(\shref)\s*=\s*["']([^"'\s>]+)["']/gi, (match, attr, url) => {
      return `${attr}="${toProxyUrl(url)}"`;
    });

    // 2. 重写所有 action 属性（form）
    html = html.replace(/(\saction)\s*=\s*["']([^"'\s>]+)["']/gi, (match, attr, url) => {
      return `${attr}="${toProxyUrl(url)}"`;
    });

    // 3. 重写 formaction 属性（按钮的提交地址）
    html = html.replace(/(\sformaction)\s*=\s*["']([^"'\s>]+)["']/gi, (match, attr, url) => {
      return `${attr}="${toProxyUrl(url)}"`;
    });

    // 4. 重写 src 和 srcset 等资源链接（不变）
    html = html.replace(/(\ssrc|\ssrcset)\s*=\s*["']([^"']+)["']/gi, (match, attr, url) => {
      if (/^(javascript:|data:)/i.test(url)) return match;
      if (attr.endsWith('srcset')) {
        const parts = url.split(',').map(part => {
          const trimmed = part.trim();
          const [u, ...rest] = trimmed.split(/\s+/);
          if (!u || /^(javascript:|data:)/i.test(u)) return trimmed;
          const full = toProxyUrl(u);
          return [full, ...rest].join(' ').trim();
        });
        return `srcset="${parts.join(', ')}"`;
      }
      return `${attr}="${toProxyUrl(url)}"`;
    });

    // 注入脚本：只处理动态导航、AJAX，不再拦截 a/form 点击（因为已经被重写）
    const interceptorScript = `
      <script>
        (function() {
          const proxyBase = '/api/topvpn?url=';
          const originalUrl = ${JSON.stringify(finalUrl.href)};

          // 控制栏 UI
          const bar = document.createElement('div');
          bar.id = '__topvpn_bar__';
          bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
          bar.innerHTML = '<span style="font-weight:600;">🌐 代理</span>' +
            '<input id="__topvpn_url__" type="text" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址并回车">' +
            '<button id="__topvpn_refresh__" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">刷新</button>' +
            '<button id="__topvpn_home__" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;">← 返回</button>';
          document.documentElement.prepend(bar);
          document.documentElement.style.paddingTop = '48px';

          const urlInput = document.getElementById('__topvpn_url__');
          urlInput.value = originalUrl;
          urlInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
              let val = this.value.trim();
              if (!val) return;
              if (!/^https?:\\/\\//i.test(val)) val = 'https://' + val;
              location.assign(proxyBase + encodeURIComponent(val));
            }
          });
          document.getElementById('__topvpn_refresh__').addEventListener('click', () => location.reload());
          document.getElementById('__topvpn_home__').addEventListener('click', () => {
            window.location.href = '/topvpn.html';
          });

          // 安全转换函数
          function proxyUrl(inputUrl) {
            if (!inputUrl) return inputUrl;
            if (inputUrl.startsWith(proxyBase)) return inputUrl;
            try {
              const absolute = new URL(inputUrl, originalUrl).href;
              return proxyBase + encodeURIComponent(absolute);
            } catch (e) {
              return inputUrl;
            }
          }

          // 保存原始方法
          const originalAssign = window.location.assign.bind(window.location);
          const originalReplace = window.location.replace.bind(window.location);
          const originalPushState = history.pushState.bind(history);
          const originalReplaceState = history.replaceState.bind(history);
          const originalOpen = window.open.bind(window);

          // 拦截 location.href setter（最底层的跳转）
          const hrefDescriptor = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
          if (hrefDescriptor && hrefDescriptor.set) {
            Object.defineProperty(Location.prototype, 'href', {
              get: hrefDescriptor.get,
              set: function(url) {
                originalAssign(proxyUrl(url));
              },
              configurable: false
            });
          }

          // 拦截 location.assign（如果网站直接调用）
          Object.defineProperty(window.location, 'assign', {
            value: function(url) { return originalAssign(proxyUrl(url)); },
            writable: false, configurable: false
          });

          // 拦截 location.replace
          Object.defineProperty(window.location, 'replace', {
            value: function(url) { return originalReplace(proxyUrl(url)); },
            writable: false, configurable: false
          });

          // 拦截 history.pushState
          Object.defineProperty(history, 'pushState', {
            value: function(state, title, url) {
              if (url) arguments[2] = proxyUrl(url);
              return originalPushState.apply(history, arguments);
            },
            writable: false, configurable: false
          });

          // 拦截 history.replaceState
          Object.defineProperty(history, 'replaceState', {
            value: function(state, title, url) {
              if (url) arguments[2] = proxyUrl(url);
              return originalReplaceState.apply(history, arguments);
            },
            writable: false, configurable: false
          });

          // 拦截 window.open（处理 target="_blank" 等新窗口）
          window.open = function(url, target, features) {
            if (url && typeof url === 'string') {
              url = proxyUrl(url);
            }
            return originalOpen(url, target, features);
          };

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

          // 注意：不再需要 a/form 点击拦截，因为所有链接已被后端重写为代理链接
        })();
      </script>
    `;

    html = html.replace(/<head\b[^>]*>/i, '<head>' + interceptorScript);

    return new Response(html, { status: response.status, headers: safeHeaders });
  } catch (err) {
    const errorHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>代理错误</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
.error-box{background:white;padding:2rem;border-radius:1rem;box-shadow:0 4px 12px rgba(0,0,0,0.1);text-align:center;}
h2{color:#c0392b;}p{color:#555;}</style></head>
<body><div class="error-box"><h2>代理请求失败</h2><p>${err.message}</p></div></body></html>`;
    return new Response(errorHtml, { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
