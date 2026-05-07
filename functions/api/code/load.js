// functions/api/code/load.js
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 1. 验证 token
  const authHeader = request.headers.get('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : '';
  const user = await verifyToken(token, env.JWT_SECRET);
  if (!user) {
    return new Response(JSON.stringify({ error: '未登录或令牌已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. 获取查询参数
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (!type || (type !== 'cpp' && type !== 'py')) {
    return new Response(JSON.stringify({ error: '缺少或无效的文件类型' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. 从 KV 读取
  const key = `code:${user}:${type}`;
  const raw = await env.CODE_KV.get(key);
  if (!raw) {
    return new Response(JSON.stringify({ found: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let data;
  try { data = JSON.parse(raw); } catch { data = { content: '' }; }

  return new Response(JSON.stringify({
    found: true,
    content: data.content || '',
    updatedAt: data.updatedAt || null
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ---------- 与 save.js 完全相同的签名/验证函数 ----------
async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '');
}

async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const unsigned = `${header}.${payload}`;
    const expected = await sign(unsigned, secret);
    if (signature !== expected) return null;
    const decoded = JSON.parse(atob(payload));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}