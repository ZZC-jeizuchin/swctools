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
  } catch (e) {
    // AUTH_KV 读取失败不影响后续
  }

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
  } catch (e) {
    // CODE_KV 未绑定或读取失败时，忽略错误并继续返回已有数据
  }

  return new Response(JSON.stringify({ username, items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ========== 内联签名验证函数 ==========
async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const unsigned = `${headerB64}.${payloadB64}`;
    const expectedSig = await sign(unsigned, secret);
    if (signatureB64 !== expectedSig) return null;
    const payload = JSON.parse(atob(payloadB64));
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
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '');
}
