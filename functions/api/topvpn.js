export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');
  const myOrigin = new URL(request.url).origin;

  if (!urlParam) {
    const inputPage = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>顶层代理</title>
  <style>
    :root{--bg:#e8edf2;--panel-bg:rgba(255,255,255,0.9);--border:#bdd1e6;--text:#173e58;--btn:#4f7f9e;--btn-hover:#3a6b8c}
    *{margin:0;padding:0;box-sizing:border-box;font-family:system-ui,sans-serif}
    body{background:var(--bg);height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .panel{background:var(--panel-bg);border-radius:24px;box-shadow:0 12px 28px rgba(30,65,90,0.15);border:1px solid var(--border);padding:32px 24px;width:100%;max-width:560px}
    h1{font-size:1.8rem;font-weight:600;color:#1e4b6e;margin-bottom:24px;text-align:center}
    .row{display:flex;gap:10px;margin-bottom:12px}
    input{flex:1;padding:12px 18px;border:1.5px solid var(--border);border-radius:36px;font-size:1rem;outline:none}
    button{padding:12px 24px;border-radius:36px;font-weight:600;cursor:pointer;border:none;background:var(--btn);color:#fff}
    button:hover{background:var(--btn-hover)}
    button.outline{background:transparent;color:var(--btn);border:1.5px solid var(--btn)}
  </style>
</head>
<body>
  <div class="panel">
    <h1>🌐 顶层代理</h1>
    <p style="text-align:center;color:#555;margin-bottom:16px">请输入网址</p>
    <div class="row"><input id="urlInput" placeholder="https://example.com" autofocus></div>
    <div class="row">
      <button id="goBtn">打开</button>
      <button class="outline" onclick="location='/topvpn.html'">返回</button>
    </div>
  </div>
  <script>
    document.getElementById('goBtn').onclick=()=>{
      let v=document.getElementById('urlInput').value.trim();
      if(!v)return;
      if(!/^https?:\/\//i.test(v))v='https://'+v;
      location.href='/api/topvpn?url='+encodeURIComponent(v);
    };
  </script>
</body>
</html>`;
    return new Response(inputPage, { status:200, headers:{'content-type':'text/html;charset=utf-8'} });
  }

  let targetUrl;
  try { targetUrl = new URL(urlParam); } catch {
    return new Response('<!DOCTYPE html><html><head><title>无效网址</title></head><body><h2>网址格式无效</h2><a href="/topvpn.html">返回</a></body></html>', { status:400, headers:{'content-type':'text/html;charset=utf-8'} });
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });

    const finalUrl = new URL(response.url);
    const contentType = response.headers.get('Content-Type') || '';
    const isHTML = contentType.includes('text/html');

    const safeHeaders = new Headers();
    ['content-type','content-encoding','content-language','cache-control','expires','last-modified','etag','content-length'].forEach(h=>{
      const v = response.headers.get(h);
      if(v !== null && v !== undefined) safeHeaders.set(h, v);
    });
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    ['X-Frame-Options','Content-Security-Policy','X-Content-Type-Options','Strict-Transport-Security','Set-Cookie'].forEach(h=> safeHeaders.delete(h));

    if (!isHTML) return new Response(response.body, { status:response.status, headers:safeHeaders });

    let html = await response.text();
    const proxyBase = myOrigin + '/api/topvpn?url=';

    // 移除 <base> 和 CSP meta
    html = html.replace(/<base\b[^>]*>/gi, '');
    html = html.replace(/<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*\/?>/gi, '');

    // 转换函数：生成绝对代理 URL（不编码）
    const toProxy = (url) => {
      if (!url || /^(javascript:|mailto:|data:|#|about:)/i.test(url)) return url;
      if (url.startsWith(proxyBase) || url.startsWith('/api/topvpn?url=')) return url;
      try {
        const abs = new URL(url, finalUrl.href).href;
        return proxyBase + abs;
      } catch { return url; }
    };

    // 重写所有导航及资源链接
    html = html.replace(/(\shref)\s*=\s*["']([^"'\s>]+)["']/gi, (_, attr, url) => `${attr}="${toProxy(url)}"`);
    html = html.replace(/(\saction|\sformaction)\s*=\s*["']([^"'\s>]+)["']/gi, (_, attr, url) => `${attr}="${toProxy(url)}"`);
    html = html.replace(/(\ssrc|\ssrcset)\s*=\s*["']([^"']+)["']/gi, (_, attr, url) => {
      if (/^(javascript:|data:)/i.test(url)) return _;
      if (attr.endsWith('srcset')) {
        const parts = url.split(',').map(p => {
          const t = p.trim();
          const [u, ...r] = t.split(/\s+/);
          if (!u || /^(javascript:|data:)/i.test(u)) return t;
          return [toProxy(u), ...r].join(' ');
        });
        return `srcset="${parts.join(', ')}"`;
      }
      return `${attr}="${toProxy(url)}"`;
    });

    // 处理 meta refresh
    html = html.replace(/<meta\s+http-equiv\s*=\s*["']?refresh["']?([^>]*?)>/gi, (_, attrs) => {
      const cm = attrs.match(/content\s*=\s*["']([^"']*)["']/i);
      if (cm) {
        let content = cm[1];
        content = content.replace(/url\s*=\s*([^;]*)/i, (_, u) => {
          let url = u.trim().replace(/^['"]|['"]$/g, '');
          if (url) return `url=${toProxy(url)}`;
          return _;
        });
        return `<meta http-equiv="refresh" content="${content}">`;
      }
      return _;
    });

    // 极简且坚固的前端注入脚本
    const injectedScript = `
<script>
(function() {
  try {
    // 控制栏 UI
    var bar = document.createElement('div');
    bar.id = '__topvpn_bar__';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    bar.innerHTML = '<span style="font-weight:600;">🌐 代理</span>'+
      '<input id="__topvpn_url__" type="text" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址">'+
      '<button id="__topvpn_refresh__" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">刷新</button>'+
      '<button id="__topvpn_home__" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">返回</button>';
    document.documentElement.prepend(bar);
    document.documentElement.style.paddingTop = '48px';
    document.getElementById('__topvpn_url__').value = ${JSON.stringify(finalUrl.href)};
    document.getElementById('__topvpn_refresh__').onclick = function(){ location.reload(); };
    document.getElementById('__topvpn_home__').onclick = function(){ location.href = '/topvpn.html'; };
  } catch(e) { console.error('topvpn bar error', e); }

  // 核心锁定
  try {
    var proxyBase = ${JSON.stringify(proxyBase)};
    var originalUrl = ${JSON.stringify(finalUrl.href)};
    var originalAssign = window.location.assign.bind(window.location);
    var originalReplace = window.location.replace.bind(window.location);
    var originalPushState = history.pushState.bind(history);
    var originalReplaceState = history.replaceState.bind(history);
    var originalOpen = window.open.bind(window);

    function proxyUrl(u) {
      if (!u) return u;
      if (u.startsWith(proxyBase) || u.startsWith('/api/topvpn?url=')) return u;
      if (/^(javascript:|mailto:|data:|#|about:)/i.test(u)) return u;
      try {
        return proxyBase + (new URL(u, originalUrl)).href;
      } catch(e) { return proxyBase + originalUrl; }
    }

    try { Object.defineProperty(window.location, 'assign', { value: function(url){ return originalAssign(proxyUrl(url)); }, writable:false, configurable:false }); } catch(e) {}
    try { Object.defineProperty(window.location, 'replace', { value: function(url){ return originalReplace(proxyUrl(url)); }, writable:false, configurable:false }); } catch(e) {}
    try { Object.defineProperty(history, 'pushState', { value: function(s,t,url){ if(url) arguments[2]=proxyUrl(url); return originalPushState.apply(history,arguments); }, writable:false, configurable:false }); } catch(e) {}
    try { Object.defineProperty(history, 'replaceState', { value: function(s,t,url){ if(url) arguments[2]=proxyUrl(url); return originalReplaceState.apply(history,arguments); }, writable:false, configurable:false }); } catch(e) {}
    try { window.open = function(url,target,features){ if(url&&typeof url==='string') url=proxyUrl(url); return originalOpen(url,target,features); }; } catch(e) {}

    // 拦截 fetch / XHR（尽量简略）
    var originalFetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string') return originalFetch(proxyUrl(input), init);
      if (input instanceof Request) return originalFetch(new Request(proxyUrl(input.url), input), init);
      return originalFetch(proxyUrl(input.toString()), init);
    };
    var OrigXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      var xhr = new OrigXHR();
      var origOpen = xhr.open;
      xhr.open = function(method, url) {
        arguments[1] = proxyUrl(url);
        return origOpen.apply(xhr, arguments);
      };
      return xhr;
    };

    // 表单提交最小拦截（防止编程式提交逃逸）
    var origSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function() {
      var form = this;
      var action = form.getAttribute('action') || originalUrl;
      if (!/^https?:\/\//i.test(action)) {
        try { action = new URL(action, originalUrl).href; } catch(e) { action = originalUrl; }
      } else if (action.startsWith(myOrigin)) {
        // 已经是代理链接，但需确保完整（实际上后端已重写为绝对代理，这里不应进入）
      }
      // 如果 action 未以 myOrigin 开头，则是外站，需要代理
      if (action && action.indexOf(myOrigin) !== 0 && /^https?:\/\//i.test(action)) {
        action = proxyUrl(action);
      }
      // 简单导航
      originalAssign(action);
    };

  } catch(e) { console.error('topvpn lock error', e); }
})();
</script>`;

    // 将脚本插入 <head> 最前，确保最先执行
    html = html.replace(/<head\b[^>]*>/i, '<head>' + injectedScript);

    return new Response(html, { status: response.status, headers: safeHeaders });
  } catch (err) {
    return new Response(`<html><body><h2>代理错误</h2><p>${err.message}</p></body></html>`, { status:502, headers:{'content-type':'text/html;charset=utf-8'} });
  }
}
