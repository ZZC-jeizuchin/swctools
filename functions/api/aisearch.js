// functions/api/aisearch.js
// 独立搜索代理：支持 Tavily 和 Serper
// 统一响应格式：{ results: [{ title, url, snippet }] }

const MAX_RESULTS = 5;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { password, provider, query, apiKey } = body || {};

  // 密码校验（复用 aiapi 的密码）
  if (!password || password !== env.ADMIN_PASSWORD) {
    return jsonResponse({ error: '密码错误' }, 403);
  }

  if (!provider || !['tavily', 'serper'].includes(provider)) {
    return jsonResponse({ error: '仅支持 tavily 或 serper' }, 400);
  }

  if (!query || !query.trim()) {
    return jsonResponse({ error: '缺少搜索关键词' }, 400);
  }

  if (!apiKey || !apiKey.trim()) {
    return jsonResponse({ error: '未配置搜索 API Key' }, 400);
  }

  try {
    let results;

    if (provider === 'tavily') {
      results = await searchTavily(query.trim(), apiKey.trim());
    } else {
      results = await searchSerper(query.trim(), apiKey.trim());
    }

    return jsonResponse({ results, provider, query: query.trim() });

  } catch (err) {
    return jsonResponse({ error: '搜索失败: ' + (err.message || err) }, 502);
  }
}

// ─── Tavily 搜索 ───
async function searchTavily(query, apiKey) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
      include_images: false
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Tavily HTTP ' + res.status + ': ' + text.slice(0, 200));
  }

  const data = await res.json();
  const results = (data.results || []).map(r => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || ''
  }));

  return results;
}

// ─── Serper 搜索 ───
async function searchSerper(query, apiKey) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: query,
      num: MAX_RESULTS,
      gl: 'cn',
      hl: 'zh-cn'
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Serper HTTP ' + res.status + ': ' + text.slice(0, 200));
  }

  const data = await res.json();
  const results = (data.organic || []).map(r => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || ''
  }));

  return results;
}
