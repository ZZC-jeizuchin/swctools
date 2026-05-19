export async function onRequest(context) {
  const { request } = context;
  const urlParam = new URL(request.url).searchParams.get('url');

  if (!urlParam) {
    return new Response(JSON.stringify({ error: '缺少 url 参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 只允许 http 和 https 协议
  if (!/^https?:\/\//i.test(urlParam)) {
    return new Response(JSON.stringify({ error: '仅支持 http 或 https 协议' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const targetRes = await fetch(urlParam, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'SwCTools-VPN/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const responseHeaders = new Headers(targetRes.headers);
    // 移除阻止在 iframe 中显示的头部
    responseHeaders.delete('x-frame-options');
    responseHeaders.delete('content-security-policy');
    // 不把目标网站的 cookie 传给用户浏览器
    responseHeaders.delete('set-cookie');
    // 允许被任意页面嵌入
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(targetRes.body, {
      status: targetRes.status,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: '代理请求失败: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
