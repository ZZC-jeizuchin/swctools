export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 1. 验证 token
  const authHeader = request.headers.get('Authorization');
  const token = authHeader ? authHeader.replace('Bearer ', '') : '';
  const user = await verifyToken(token, env.JWT_SECRET);
  if (!user) {
    return new Response(JSON.stringify({ error: '未登录或令牌已过期' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. 解析请求体
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { type, files } = body;
  if (!type || !files || typeof files !== 'object') {
    return new Response(JSON.stringify({ error: '参数错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 只允许 cpp 和 py
  if (type !== 'cpp' && type !== 'py') {
    return new Response(JSON.stringify({ error: '不支持的文件类型' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const prefix = `code:${user}:${type}`;
  const indexKey = `${prefix}:files`;

  // 3. 获取旧文件列表
  const oldRaw = await env.CODE_KV.get(indexKey);
  let oldFiles = [];
  if (oldRaw) {
    try { oldFiles = JSON.parse(oldRaw); } catch {}
  }

  // 4. 写入新文件，删除不再需要的旧文件
  const newFiles = Object.keys(files);
  const now = Date.now();
  const writePromises = [];

  // 写入索引
  writePromises.push(env.CODE_KV.put(indexKey, JSON.stringify(newFiles)));

  // 写入每个文件内容
  for (const fname of newFiles) {
    const content = files[fname];
    if (typeof content === 'string') {
      const fileKey = `${prefix}:${fname}`;
      const value = JSON.stringify({ content, updatedAt: now });
      writePromises.push(env.CODE_KV.put(fileKey, value));
    }
  }

  // 删除不再存在的旧文件
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

// ---------- 签名与验证（与 verify.js 完全一致） ----------
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

async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const unsigned = `${header}.${payload}`;
    const expected = await sign(unsigned, secret);
    if (signature !== expected) return null;
    const decoded = JSON.parse(atob(payload));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded.sub;   // 返回用户名
  } catch {
    return null;
  }
}
