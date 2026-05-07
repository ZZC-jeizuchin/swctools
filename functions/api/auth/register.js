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
  if (!username || !password || !adminPass) {
    return new Response(JSON.stringify({ error: '请填写所有字段' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (adminPass !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '管理员密码错误' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 密码复杂度校验：仅允许大小写字母和数字
  const passwordPattern = /^[A-Za-z0-9]+$/;
  if (!passwordPattern.test(password)) {
    return new Response(JSON.stringify({ error: '密码只能包含大小写字母和数字' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const existing = await env.AUTH_KV.get(`user:${username}`);
  if (existing) {
    return new Response(JSON.stringify({ error: '用户名已存在' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(password + env.JWT_SECRET)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const now = Date.now();
  await env.AUTH_KV.put(`user:${username}`, JSON.stringify({
    passwordHash,
    createdAt: now,
    lastLogin: 0
  }));

  // 更新用户列表
  let list = await env.AUTH_KV.get('userlist');
  list = list ? JSON.parse(list) : [];
  list.push(username);
  await env.AUTH_KV.put('userlist', JSON.stringify(list));

  const token = await generateToken(username, env.JWT_SECRET);
  return new Response(JSON.stringify({ token }), {
    status: 201,
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
