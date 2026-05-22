export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const body = await request.json().catch(() => ({}));
  const authHeader = request.headers.get('Authorization')?.split('Bearer ')[1];
  const { username: targetUser, adminPass } = body;

  // 管理员密码方式删除任意用户
  if (adminPass && adminPass === env.ADMIN_PASSWORD && targetUser) {
    const userData = await env.AUTH_KV.get(`user:${targetUser}`);
    if (!userData) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    await env.AUTH_KV.delete(`user:${targetUser}`);
    let list = await env.AUTH_KV.get('userlist');
    if (list) {
      list = JSON.parse(list).filter(u => u !== targetUser);
      await env.AUTH_KV.put('userlist', JSON.stringify(list));
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 普通用户通过 JWT 删除自己
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '未登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const payload = await verifyToken(authHeader, env.JWT_SECRET);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'token无效或已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const currentUser = payload.sub;

  // 普通用户删除自己，需要验证密码
  if (!adminPass) {
    return new Response(JSON.stringify({ error: '请输入密码以确认删除' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userData = await env.AUTH_KV.get(`user:${currentUser}`);
  if (!userData) {
    return new Response(JSON.stringify({ error: '用户不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { passwordHash } = JSON.parse(userData);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(adminPass + env.JWT_SECRET)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  if (inputHash !== passwordHash) {
    return new Response(JSON.stringify({ error: '密码错误，无法删除账号' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await env.AUTH_KV.delete(`user:${currentUser}`);

  let list = await env.AUTH_KV.get('userlist');
  if (list) {
    list = JSON.parse(list).filter(u => u !== currentUser);
    await env.AUTH_KV.put('userlist', JSON.stringify(list));
  }

  return new Response(JSON.stringify({ success: true }), {
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
