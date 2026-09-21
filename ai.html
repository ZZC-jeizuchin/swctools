// functions/api/ai-conv.js
// 用户配置 + 对话云同步，存储在 AIKV
//
// 键结构：
//   <username>:cfg_index        → 配置索引 [{id, name, savedAt, apiBase, model}]
//   <username>:cfg:<id>         → 单套配置完整 JSON
//   <username>:index            → 会话索引 [{id, title, ..., savedAt, turnCount}]
//   <username>:conv:<id>        → 单个会话 {schema, id, title, ..., turns}

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

const MAX_CONV_SIZE = 20 * 1024 * 1024;
const MAX_CONFIG_SIZE = 200 * 1024;
const MAX_INDEX_SIZE = 200;

function upgradeConv(c) {
  if (!c) return c;
  if (!c.schema || c.schema < 2) {
    c.schema = 2;
    c.savedAt = c.savedAt || c.updatedAt || c.createdAt || Date.now();
  }
  return c;
}
function upgradeIndexItem(x) {
  if (!x) return x;
  return { ...x, savedAt: x.savedAt || x.updatedAt || x.createdAt || 0 };
}

export async function onRequest(context) {
  const { request, env } = context;

  const auth = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!auth) return json({ error: '未登录' }, 401);
  const payload = await verifyToken(auth, env.JWT_SECRET);
  if (!payload) return json({ error: 'token 无效或已过期' }, 401);
  const username = payload.sub;
  if (!username) return json({ error: 'token 缺少用户名' }, 401);
  if (!env.AIKV) return json({ error: 'AIKV 未绑定' }, 500);

  const url = new URL(request.url);
  const method = request.method;
  const type = url.searchParams.get('type') || 'conv';
  const id = url.searchParams.get('id');
  const metaOnly = url.searchParams.get('meta') === '1';

  // ═══════════ 配置 ═══════════
  if (type === 'config') {
    // 尝试迁移旧的 <user>:configs
    await migrateOldConfigs(env, username);

    // GET
    if (method === 'GET') {
      if (id) {
        const raw = await env.AIKV.get(`${username}:cfg:${id}`);
        if (!raw) return json({ error: '配置不存在' }, 404);
        try { return json({ config: JSON.parse(raw) }); }
        catch { return json({ error: '配置数据损坏' }, 500); }
      }
      const raw = await env.AIKV.get(`${username}:cfg_index`);
      let index = [];
      try { index = raw ? JSON.parse(raw) : []; } catch {}
      return json({ index });
    }

    // PUT
    if (method === 'PUT') {
      if (!id) return json({ error: '缺少 id' }, 400);
      let body;
      try { body = await request.json(); }
      catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!body || !body.config) return json({ error: '缺少 config' }, 400);
      const cfg = body.config;
      if (cfg.id !== id) return json({ error: 'id 不匹配' }, 400);

      const raw = JSON.stringify(cfg);
      if (raw.length > MAX_CONFIG_SIZE) return json({ error: '配置过大' }, 413);

      await env.AIKV.put(`${username}:cfg:${id}`, raw);

      let index = [];
      try {
        const ir = await env.AIKV.get(`${username}:cfg_index`);
        index = ir ? JSON.parse(ir) : [];
      } catch {}
      index = index.filter(x => x.id !== id);
      index.unshift({
        id: cfg.id,
        name: cfg.name || '未命名',
        savedAt: cfg.savedAt || Date.now(),
        apiBase: cfg.apiBase || '',
        model: cfg.model || ''
      });
      if (index.length > MAX_INDEX_SIZE) index = index.slice(0, MAX_INDEX_SIZE);
      await env.AIKV.put(`${username}:cfg_index`, JSON.stringify(index));

      return json({ success: true });
    }

    // DELETE
    if (method === 'DELETE') {
      if (!id) return json({ error: '缺少 id' }, 400);
      await env.AIKV.delete(`${username}:cfg:${id}`);
      let index = [];
      try {
        const ir = await env.AIKV.get(`${username}:cfg_index`);
        index = ir ? JSON.parse(ir) : [];
      } catch {}
      index = index.filter(x => x.id !== id);
      await env.AIKV.put(`${username}:cfg_index`, JSON.stringify(index));
      return json({ success: true });
    }

    return json({ error: 'Method Not Allowed' }, 405);
  }

  // ═══════════ 会话 ═══════════
  if (method === 'GET') {
    if (id) {
      const raw = await env.AIKV.get(`${username}:conv:${id}`);
      if (!raw) return json({ error: '会话不存在' }, 404);
      let conv;
      try { conv = JSON.parse(raw); }
      catch { return json({ error: '数据损坏' }, 500); }
      conv = upgradeConv(conv);
      if (metaOnly) {
        const { turns, ...meta } = conv;
        return json({ meta });
      }
      return json({ conversation: conv });
    }
    const raw = await env.AIKV.get(`${username}:index`);
    let index = [];
    try { index = raw ? JSON.parse(raw) : []; } catch {}
    index = index.map(upgradeIndexItem);
    return json({ index });
  }

  if (method === 'PUT') {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body.id !== 'string' || !body.conversation) {
      return json({ error: '缺少 id 或 conversation' }, 400);
    }
    const conv = upgradeConv({ ...body.conversation });
    const rawData = JSON.stringify(conv);
    if (rawData.length > MAX_CONV_SIZE) return json({ error: '会话过大' }, 413);

    await env.AIKV.put(`${username}:conv:${body.id}`, rawData);

    let index = [];
    try {
      const raw = await env.AIKV.get(`${username}:index`);
      index = raw ? JSON.parse(raw) : [];
    } catch {}
    index = index.map(upgradeIndexItem);
    index = index.filter(x => x.id !== body.id);
    index.unshift({
      id: body.id,
      title: conv.title || '未命名',
      configId: conv.configId || '',
      configName: conv.configName || '',
      model: conv.model || '',
      reasoning: conv.reasoning || '',
      savedAt: conv.savedAt || Date.now(),
      turnCount: Array.isArray(conv.turns) ? conv.turns.length : 0
    });
    if (index.length > MAX_INDEX_SIZE) index = index.slice(0, MAX_INDEX_SIZE);
    await env.AIKV.put(`${username}:index`, JSON.stringify(index));
    return json({ success: true });
  }

  if (method === 'DELETE') {
    if (!id) return json({ error: '缺少 id' }, 400);
    await env.AIKV.delete(`${username}:conv:${id}`);
    let index = [];
    try {
      const raw = await env.AIKV.get(`${username}:index`);
      index = raw ? JSON.parse(raw) : [];
    } catch {}
    index = index.map(upgradeIndexItem).filter(x => x.id !== id);
    await env.AIKV.put(`${username}:index`, JSON.stringify(index));
    return json({ success: true });
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

// 旧键迁移：<user>:configs → <user>:cfg_index + <user>:cfg:<id>
async function migrateOldConfigs(env, username) {
  try {
    const oldRaw = await env.AIKV.get(`${username}:configs`);
    if (!oldRaw) return;

    // 已经有新索引，说明迁移过了，清理旧键
    const idxRaw = await env.AIKV.get(`${username}:cfg_index`);
    if (idxRaw) {
      await env.AIKV.delete(`${username}:configs`);
      return;
    }

    let oldConfigs = [];
    try { oldConfigs = JSON.parse(oldRaw); } catch { oldConfigs = []; }
    if (!Array.isArray(oldConfigs) || oldConfigs.length === 0) {
      await env.AIKV.delete(`${username}:configs`);
      return;
    }

    const index = [];
    const now = Date.now();
    for (const c of oldConfigs) {
      if (!c || !c.id) continue;
      if (!c.savedAt) c.savedAt = now;
      await env.AIKV.put(`${username}:cfg:${c.id}`, JSON.stringify(c));
      index.push({
        id: c.id,
        name: c.name || '未命名',
        savedAt: c.savedAt,
        apiBase: c.apiBase || '',
        model: c.model || ''
      });
    }
    await env.AIKV.put(`${username}:cfg_index`, JSON.stringify(index));
    await env.AIKV.delete(`${username}:configs`);
  } catch {
    // 静默
  }
}