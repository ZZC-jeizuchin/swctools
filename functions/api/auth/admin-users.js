export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const body = await request.json().catch(() => ({}));
  const { adminPass } = body;

  if (!adminPass || adminPass !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '管理员密码错误' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const listRaw = await env.AUTH_KV.get('userlist');
  const usernames = listRaw ? JSON.parse(listRaw) : [];

  const users = [];
  for (const name of usernames) {
    const data = await env.AUTH_KV.get(`user:${name}`);
    if (data) {
      const parsed = JSON.parse(data);
      users.push({
        username: name,
        passwordHash: parsed.passwordHash || '',
        createdAt: parsed.createdAt || 0,
        lastLogin: parsed.lastLogin || 0
      });
    }
  }

  return new Response(JSON.stringify({ users }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}