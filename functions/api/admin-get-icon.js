export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 验证管理员权限（复用已有的 JWT 验证逻辑）
  const authHeader = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!authHeader) {
    return new Response(JSON.stringify({ error: '未登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const tokenPayload = await verifyToken(authHeader, env.JWT_SECRET);
  if (!tokenPayload) {
    return new Response(JSON.stringify({ error: 'token无效或已过期' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // 此处可增加管理员角色判断（如需），目前仅要求有效 token
  const targetUser = url.searchParams.get('username');
  if (!targetUser) {
    return new Response(JSON.stringify({ error: '缺少 username 参数' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const iconKey = `icon:${targetUser}`;
  const iconData = await env.KV_ICON.get(iconKey);
  if (!iconData) {
    return new Response(JSON.stringify({ error: '该用户未设置头像' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const parsed = JSON.parse(iconData);
    const binary = atob(parsed.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': parsed.contentType || 'image/png',
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: '头像数据损坏' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// 与 upload-icon.js 完全相同的签名验证函数
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
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
