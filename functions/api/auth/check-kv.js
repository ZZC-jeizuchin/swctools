export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const authHeader = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const tokenPayload = await verifyToken(authHeader, env.JWT_SECRET);
  if (!tokenPayload) {
    return new Response(JSON.stringify({ error: 'token无效或已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const username = tokenPayload.sub;
  const items = [];

  // 1. 从 AUTH_KV 读取用户账户信息
  try {
    const userKey = `user:${username}`;
    const userData = await env.AUTH_KV.get(userKey);
    if (userData) {
      items.push({ key: userKey, value: userData });
    }
  } catch (e) {}

  // 2. 从 CODE_KV 列出并读取所有以 code:<用户名>: 开头的键
  const codePrefix = `code:${username}:`;
  try {
    const codeList = await env.CODE_KV.list({ prefix: codePrefix });
    for (const key of codeList.keys) {
      const value = await env.CODE_KV.get(key.name);
      if (value !== null) {
        items.push({ key: key.name, value });
      }
    }
  } catch (e) {}

  return new Response(JSON.stringify({ username, items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ========== 内联签名验证函数（已修复中文解码） ==========
async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const unsigned = `${headerB64}.${payloadB64}`;
    const expectedSig = await sign(unsigned, secret);
    if (signatureB64 !== expectedSig) return null;

    const decoded = decodeURIComponent(escape(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))));
    const payload = JSON.parse(decoded);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
