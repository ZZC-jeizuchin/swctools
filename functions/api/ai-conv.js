// functions/api/ai-conv.js
// 用户对话云同步，存储在 AIKV 命名空间下
//
// 键结构（第一级为用户名）：
//   <username>:index         → 会话索引 [{id, title, updatedAt, turnCount, model}]
//   <username>:conv:<id>     → 单个会话完整数据 {title, model, turns, ...}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyToken(token, secret) {
  if (!token || !secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const unsigned = `${h}.${p}`;
    const expected = await sign(unsigned, secret);
    if (s !== expected) return null;
    const decoded = decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/'))));
    const payload = JSON.parse(decoded);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

const MAX_CONV_SIZE = 20 * 1024 * 1024;  // 20 MB
const MAX_INDEX_SIZE = 100;

export async function onRequest(context) {
  const { request, env } = context;

  const auth = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!auth) return json({ error: '未登录' }, 401);

  const payload = await verifyToken(auth, env.JWT_SECRET);
  if (!payload) return json({ error: 'token 无效或已过期' }, 401);

  const username = payload.sub;
  if (!username) return json({ error: 'token 缺少用户名' }, 401);

  if (!env.AIKV) return json({ error: 'AIKV 未绑定，请在 Pages 设置中添加 KV 命名空间绑定' }, 500);

  const url = new URL(request.url);
  const method = request.method;

  // ─── GET：拉取索引或单个会话 ───
  if (method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) {
      const raw = await env.AIKV.get(`${username}:conv:${id}`);
      if (!raw) return json({ error: '会话不存在' }, 404);
      try { return json({ conversation: JSON.parse(raw) }); }
      catch { return json({ error: '会话数据损坏' }, 500); }
    }
    const raw = await env.AIKV.get(`${username}:index`);
    let index = [];
    try { index = raw ? JSON.parse(raw) : []; } catch {}
    return json({ index });
  }

  // ─── PUT：保存会话 ───
  if (method === 'PUT') {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON body' }, 400); }

    if (!body || typeof body.id !== 'string' || !body.conversation) {
      return json({ error: '缺少 id 或 conversation' }, 400);
    }

    const { id, conversation } = body;
    const rawData = JSON.stringify(conversation);
    if (rawData.length > MAX_CONV_SIZE) {
      return json({ error: `会话过大（${(rawData.length / 1024 / 1024).toFixed(1)}MB），上限 20MB` }, 413);
    }

    await env.AIKV.put(`${username}:conv:${id}`, rawData);

    let index = [];
    try {
      const raw = await env.AIKV.get(`${username}:index`);
      index = raw ? JSON.parse(raw) : [];
    } catch {}

    index = index.filter(x => x.id !== id);
    index.unshift({
      id,
      title: conversation.title || '未命名对话',
      updatedAt: conversation.updatedAt || Date.now(),
      turnCount: Array.isArray(conversation.turns) ? conversation.turns.length : 0,
      model: conversation.model || ''
    });
    if (index.length > MAX_INDEX_SIZE) index = index.slice(0, MAX_INDEX_SIZE);
    await env.AIKV.put(`${username}:index`, JSON.stringify(index));

    return json({ success: true, index });
  }

  // ─── DELETE：删除会话 ───
  if (method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: '缺少 id' }, 400);

    await env.AIKV.delete(`${username}:conv:${id}`);

    let index = [];
    try {
      const raw = await env.AIKV.get(`${username}:index`);
      index = raw ? JSON.parse(raw) : [];
    } catch {}
    index = index.filter(x => x.id !== id);
    await env.AIKV.put(`${username}:index`, JSON.stringify(index));

    return json({ success: true, index });
  }

  return json({ error: 'Method Not Allowed' }, 405);
}
