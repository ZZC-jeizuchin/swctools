export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 验证 token
  const authHeader = request.headers.get('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : '';
  const user = await verifyToken(token, env.JWT_SECRET);
  if (!user) {
    return new Response(JSON.stringify({ error: '未登录或令牌已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 解析请求体
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { type, files } = body;
  if (!type || !files || typeof files !== 'object') {
    return new Response(JSON.stringify({ error: '参数错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (type !== 'cpp' && type !== 'py') {
    return new Response(JSON.stringify({ error: '不支持的文件类型' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const prefix = `code:${user}:${type}`;
  const indexKey = `${prefix}:files`;

  const oldRaw = await env.CODE_KV.get(indexKey);
  let oldFiles = [];
  if (oldRaw) {
    try { oldFiles = JSON.parse(oldRaw); } catch {}
  }

  const newFiles = Object.keys(files);
  const now = Date.now();
  const writePromises = [];

  writePromises.push(env.CODE_KV.put(indexKey, JSON.stringify(newFiles)));

  for (const fname of newFiles) {
    const content = files[fname];
    if (typeof content === 'string') {
      const fileKey = `${prefix}:${fname}`;
      const value = JSON.stringify({ content, updatedAt: now });
      writePromises.push(env.CODE_KV.put(fileKey, value));
    }
  }

  for (const oldFile of oldFiles) {
    if (!newFiles.includes(oldFile)) {
      const fileKey = `${prefix}:${oldFile}`;
      writePromises.push(env.CODE_KV.delete(fileKey));
    }
  }

  await Promise.all(writePromises);

  return new Response(JSON.stringify({ success: true, count: newFiles.length }), {
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
  // 关键修复：Base64URL 安全转换
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
    // 安全 Base64URL 解码
    const decoded = decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))));
    const payloadObj = JSON.parse(decoded);
    if (payloadObj.exp && payloadObj.exp < Math.floor(Date.now() / 1000)) return null;
    return payloadObj.sub;
  } catch {
    return null;
  }
}
