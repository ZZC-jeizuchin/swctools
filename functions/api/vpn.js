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

      // 重写相对路径资源，使其指向代理
      html = html.replace(/(href|src|action)\s*=\s*["'](?!https?:\/\/|\/\/|#|javascript:|mailto:|data:)([^"'\s>]+)["']/gi, (match, attr, path) => {
        const fullUrl = new URL(path, targetUrl.origin).href;
        return `${attr}="${proxyBase}${encodeURIComponent(fullUrl)}"`;
      });

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
