export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  // JWT 验证（所有操作都需要登录）
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

  // GET：列出所有属于自己的 KV 数据
  if (method === 'GET') {
    const items = [];

    // AUTH_KV
    try {
      const userKey = `user:${username}`;
      const userData = await env.AUTH_KV.get(userKey);
      if (userData) items.push({ key: userKey, value: userData });
    } catch (e) {}

    // CODE_KV
    try {
      const codePrefix = `code:${username}:`;
      const codeList = await env.CODE_KV.list({ prefix: codePrefix });
      for (const key of codeList.keys) {
        const value = await env.CODE_KV.get(key.name);
        if (value !== null) items.push({ key: key.name, value });
      }
    } catch (e) {}

    // KV_ICON
    try {
      const iconKey = `icon:${username}`;
      const iconData = await env.KV_ICON.get(iconKey);
      if (iconData) items.push({ key: iconKey, value: iconData });
    } catch (e) {}

    return new Response(JSON.stringify({ username, items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // POST：删除指定的键（需要管理员密码）
  if (method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { action, key, adminPass } = body;
    if (action !== 'delete' || !key) {
      return new Response(JSON.stringify({ error: '无效操作' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 验证管理员密码
    if (!adminPass || adminPass !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: '管理员密码错误' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 管理员密码正确，允许删除任意键
    try {
      if (key.startsWith('user:')) {
        await env.AUTH_KV.delete(key);
      } else if (key.startsWith('code:')) {
        await env.CODE_KV.delete(key);
      } else if (key.startsWith('icon:')) {
        await env.KV_ICON.delete(key);
      } else {
        return new Response(JSON.stringify({ error: '不支持的键前缀' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: '删除失败: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
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
    const decoded = decodeURIComponent(escape(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))));
    const payload = JSON.parse(decoded);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
