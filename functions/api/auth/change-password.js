export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const authHeader = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 完整的签名验证
  const payload = await verifyToken(authHeader, env.JWT_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'token无效或已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.newPassword) {
    return new Response(JSON.stringify({ error: '缺少新密码' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 密码复杂度：仅允许大小写字母和数字
  const passwordPattern = /^[A-Za-z0-9]+$/;
  if (!passwordPattern.test(body.newPassword)) {
    return new Response(JSON.stringify({ error: '密码只能包含大小写字母和数字' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const username = payload.sub;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(body.newPassword + env.JWT_SECRET)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const newHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const existing = await env.AUTH_KV.get(`user:${username}`);
  if (!existing) {
    return new Response(JSON.stringify({ error: '用户不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const user = JSON.parse(existing);
  user.passwordHash = newHash;
  await env.AUTH_KV.put(`user:${username}`, JSON.stringify(user));

  return new Response(JSON.stringify({ success: true }), {
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
