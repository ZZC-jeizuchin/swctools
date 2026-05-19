export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');
  const myOrigin = new URL(request.url).origin;

  // 缺少参数 → 输入页面
  if (!urlParam) {
    const inputPage = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>顶层代理</title>
  <style>
    :root{--bg:#e8edf2;--panel-bg:rgba(255,255,255,0.9);--border:#bdd1e6;--btn:#4f7f9e}
    *{margin:0;padding:0;box-sizing:border-box;font-family:system-ui,sans-serif}
    body{background:var(--bg);height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .panel{background:var(--panel-bg);border-radius:24px;box-shadow:0 12px 28px rgba(30,65,90,0.15);border:1px solid var(--border);padding:32px 24px;width:100%;max-width:560px}
    h1{font-size:1.8rem;color:#1e4b6e;margin-bottom:24px;text-align:center}
    .row{display:flex;gap:10px;margin-bottom:12px}
    input{flex:1;padding:12px 18px;border:1.5px solid var(--border);border-radius:36px;font-size:1rem;outline:none}
    button{padding:12px 24px;border-radius:36px;font-weight:600;cursor:pointer;border:none;background:var(--btn);color:#fff}
    .outline{background:transparent;color:var(--btn);border:1.5px solid var(--btn)}
  </style>
</head>
<body>
  <div class="panel">
    <h1>🌐 顶层代理</h1>
    <p style="text-align:center;color:#555;margin-bottom:16px">请输入网址</p>
    <div class="row"><input id="urlInput" placeholder="https://example.com" autofocus></div>
    <div class="row">
      <button onclick="var v=document.getElementById('urlInput').value.trim();if(v){if(!/^https?:\\/\\//i.test(v))v='https://'+v;location.href='/api/topvpn?url='+encodeURIComponent(v)}">打开</button>
      <button class="outline" onclick="location.href='/topvpn.html'">返回</button>
    </div>
  </div>
</body>
</html>`;
    return new Response(inputPage, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(urlParam);
  } catch {
    return new Response('<!DOCTYPE html><html><head><title>无效网址</title></head><body><h2>网址格式无效</h2><a href="/topvpn.html">返回</a></body></html>', {
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
    ['content-type','content-encoding','content-language','cache-control','expires','last-modified','etag','content-length'].forEach(h => {
      const val = response.headers.get(h);
      if (val !== null && val !== undefined) safeHeaders.set(h, val);
    });
    safeHeaders.set('Access-Control-Allow-Origin', '*');
    ['X-Frame-Options','Content-Security-Policy','X-Content-Type-Options','Strict-Transport-Security','Set-Cookie'].forEach(h => safeHeaders.delete(h));

    if (!isHTML) {
      return new Response(response.body, { status: response.status, headers: safeHeaders });
    }

    let html = await response.text();
    const proxyBase = myOrigin + '/api/topvpn?url=';

    // 移除原有 <base> 标签和 CSP meta
    html = html.replace(/<base\b[^>]*>/gi, '');
    html = html.replace(/<meta\s+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*\/?>/gi, '');

    // 辅助函数：将任意 URL 转换为绝对代理链接
    const toProxy = (url) => {
      if (!url || /^(javascript:|mailto:|data:|#|about:)/i.test(url)) return url;
      // 已经是代理链接则跳过
      if (url.startsWith(proxyBase) || url.startsWith('/api/topvpn?url=')) return url;
      try {
        // 基于目标网站 URL 解析相对路径，然后直接拼接代理前缀
        const absolute = new URL(url, finalUrl.href).href;
        return proxyBase + absolute;
      } catch { return url; }
    };

    // 1. 重写所有链接（href, action, formaction）
    html = html.replace(/(\shref)\s*=\s*["']([^"'\s>]+)["']/gi, (_, attr, url) => `${attr}="${toProxy(url)}"`);
    html = html.replace(/(\saction|\sformaction)\s*=\s*["']([^"'\s>]+)["']/gi, (_, attr, url) => `${attr}="${toProxy(url)}"`);

    // 2. 重写资源链接（src, srcset）
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

    // 3. 处理 meta refresh
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

    // 4. 注入极简控制栏（纯 HTML 内联事件，不拦截任何脚本）
    const controlBar = `
<div id="__topvpn_bar__" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1e293b;color:white;display:flex;align-items:center;padding:8px 12px;gap:10px;font-family:system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
  <span style="font-weight:600;">🌐 代理</span>
  <input id="__topvpn_url__" type="text" value="${finalUrl.href}" style="flex:1;padding:6px 12px;border-radius:20px;border:none;font-size:14px;background:#334155;color:white;outline:none;" placeholder="输入新网址">
  <button onclick="location.href='${proxyBase}'+encodeURIComponent(document.getElementById('__topvpn_url__').value)" style="background:#3b82f6;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">打开</button>
  <button onclick="location.reload()" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">刷新</button>
  <button onclick="location.href='/topvpn.html'" style="background:#475569;border:none;color:white;padding:6px 14px;border-radius:20px;cursor:pointer;">返回</button>
</div>`;

    // 把控制栏放在 <body> 最前面，并用 margin-top 把页面整体下移
    html = html.replace(/<body\b[^>]*>/i, `<body>${controlBar}`);
    // 添加一个 style 标签，给 html 增加上边距，避免控制栏遮挡内容
    html = `<style>html{margin-top:52px;}</style>` + html;

    return new Response(html, { status: response.status, headers: safeHeaders });
  } catch (err) {
    return new Response(`<html><body><h2>代理错误</h2><p>${err.message}</p></body></html>`, {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
