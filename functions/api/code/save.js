// functions/api/code/save.js
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
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

  // 2. 解析请求体
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { type, content } = body;
  if (!type || !content || typeof content !== 'string') {
    return new Response(JSON.stringify({ error: '参数错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 只允许 cpp 和 py
  if (type !== 'cpp' && type !== 'py') {
    return new Response(JSON.stringify({ error: '不支持的文件类型' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. 存入 KV
  const key = `code:${user}:${type}`;
  const value = JSON.stringify({
    content,
    updatedAt: Date.now()
  });
  await env.CODE_KV.put(key, value);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ---------- 以下函数与 verify.js 完全相同，确保签名一致 ----------
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
    return decoded.sub;   // 返回用户名
  } catch {
    return null;
  }
}