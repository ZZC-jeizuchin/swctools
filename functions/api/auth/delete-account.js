export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json().catch(() => ({}));
  const authHeader = request.headers.get('Authorization')?.split('Bearer ')[1];
  const { username: targetUser, adminPass } = body;

  // ========== 管理员路径：通过管理员密码直接删除任意用户 ==========
  if (adminPass && adminPass === env.ADMIN_PASSWORD) {
    // 必须指明要删除的目标用户
    if (!targetUser) {
      return new Response(JSON.stringify({ error: '缺少要删除的用户名' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userData = await env.AUTH_KV.get(`user:${targetUser}`);
    if (!userData) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.AUTH_KV.delete(`user:${targetUser}`);

    // 从用户列表中移除
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

  // ========== 普通用户路径：必须携带 JWT 并验证密码 ==========
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

  const currentUser = tokenPayload.sub;

  // 普通用户必须再次输入密码（自己的密码或管理员密码）才能删除
  if (!adminPass) {
    return new Response(JSON.stringify({ error: '请输入密码以确认删除' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 获取当前用户的密码哈希
  const userData = await env.AUTH_KV.get(`user:${currentUser}`);
  if (!userData) {
    return new Response(JSON.stringify({ error: '用户不存在' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { passwordHash } = JSON.parse(userData);

  // 验证输入的密码是否正确
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

  // 密码正确，执行删除自己的账号
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
