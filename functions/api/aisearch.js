// functions/api/aisearch.js
// 独立搜索代理：支持 Tavily 和 Serper
// 密码校验方式与 aiapi.js 完全一致（SHA-256 哈希比对）

const PASSWORD_HASH =
  '564fb8a640703fdd85c94303388b22800080632a8042716b01ec3feaf77e01f3';

const MAX_RESULTS = 5;

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequest(context) {
  const { request } = context;

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

  if (!password || typeof password !== 'string') {
    return jsonResponse({ error: 'Missing password' }, 401);
  }

  const inputHash = await sha256Hex(password);
  if (!timingSafeEqual(inputHash, PASSWORD_HASH)) {
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
  return (data.results || []).map(r => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || ''
  }));
}

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
  return (data.organic || []).map(r => ({
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || ''
  }));
}
