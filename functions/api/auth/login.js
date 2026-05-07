export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return new Response(JSON.stringify({ error: '请求无效' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { username, password, adminPass } = body;
  if (!username) {
    return new Response(JSON.stringify({ error: '缺少用户名' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 管理员密码强制登录
  if (adminPass && adminPass === env.ADMIN_PASSWORD) {
    const userData = await env.AUTH_KV.get(`user:${username}`);
    if (!userData) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    // 更新最后登录时间
    const user = JSON.parse(userData);
    user.lastLogin = Date.now();
    await env.AUTH_KV.put(`user:${username}`, JSON.stringify(user));

    const token = await generateToken(username, env.JWT_SECRET);
    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!password) {
    return new Response(JSON.stringify({ error: '缺少密码' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const userData = await env.AUTH_KV.get(`user:${username}`);
  if (!userData) {
    return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { passwordHash } = JSON.parse(userData);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(password + env.JWT_SECRET)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  if (hash !== passwordHash) {
    return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 更新最后登录时间
  const user = JSON.parse(userData);
  user.lastLogin = Date.now();
  await env.AUTH_KV.put(`user:${username}`, JSON.stringify(user));

  const token = await generateToken(username, env.JWT_SECRET);
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ========== 内联工具函数 ==========
async function generateToken(username, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: username, iat: now, exp: now + 60 * 60 * 24 * 30 };
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = await sign(unsigned, secret);
  return `${unsigned}.${signature}`;
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
