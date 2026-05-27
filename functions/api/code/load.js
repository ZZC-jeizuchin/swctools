export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : '';
  const user = await verifyToken(token, env.JWT_SECRET);
  if (!user) {
    return new Response(JSON.stringify({ error: '未登录或令牌已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (!type || (type !== 'cpp' && type !== 'py')) {
    return new Response(JSON.stringify({ error: '缺少或无效的文件类型' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const prefix = `code:${user}:${type}`;
  const indexKey = `${prefix}:files`;

  const rawIndex = await env.CODE_KV.get(indexKey);
  if (!rawIndex) {
    return new Response(JSON.stringify({ files: {}, updatedAt: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let fileList = [];
  try { fileList = JSON.parse(rawIndex); } catch {}

  const files = {};
  let latestUpdate = 0;
  const readPromises = fileList.map(async (fname) => {
    const fileKey = `${prefix}:${fname}`;
    const raw = await env.CODE_KV.get(fileKey);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        files[fname] = data.content || '';
        if (data.updatedAt > latestUpdate) latestUpdate = data.updatedAt;
      } catch {
        files[fname] = '';
      }
    }
  });

  await Promise.all(readPromises);

  return new Response(JSON.stringify({
    files,
    updatedAt: latestUpdate || null
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ---------- 与 verify.js 完全一致的签名函数 ----------
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

async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const unsigned = `${header}.${payload}`;
    const expected = await sign(unsigned, secret);
    if (signature !== expected) return null;
    const decoded = decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))));
    const payloadObj = JSON.parse(decoded);
    if (payloadObj.exp && payloadObj.exp < Math.floor(Date.now() / 1000)) return null;
    return payloadObj.sub;
  } catch {
    return null;
  }
}
