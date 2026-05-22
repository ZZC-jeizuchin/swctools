export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 验证 JWT
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
  const iconKey = `icon:${username}`;

  // 处理 GET 请求：获取头像
  if (request.method === 'GET') {
    const iconData = await env.KV_ICON.get(iconKey);
    if (!iconData) {
      return new Response(JSON.stringify({ error: '头像未设置' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    try {
      const parsed = JSON.parse(iconData);
      // 返回 base64 图片，带正确的 MIME 类型
      const binary = atob(parsed.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': parsed.contentType || 'image/png',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    } catch {
      return new Response(JSON.stringify({ error: '头像数据损坏' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // 处理 POST 请求：上传头像
  if (request.method === 'POST') {
    try {
      const formData = await request.formData();
      const file = formData.get('icon');
      if (!file || !file.name) {
        return new Response(JSON.stringify({ error: '未选择文件' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 限制文件大小（2MB）
      const maxSize = 2 * 1024 * 1024;
      if (file.size > maxSize) {
        return new Response(JSON.stringify({ error: '文件过大，最大2MB' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 限制文件类型
      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        return new Response(JSON.stringify({ error: '不支持的图片类型，仅允许 PNG/JPG/GIF/WebP' }), {
          status: 415,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      // 转 base64
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      const iconObject = {
        contentType: file.type,
        data: base64Data,
        uploadedAt: Date.now()
      };

      await env.KV_ICON.put(iconKey, JSON.stringify(iconObject));

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: '上传失败: ' + err.message }), {
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

// ========== 内联签名验证函数（与 auth 系统一致） ==========
async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const unsigned = `${headerB64}.${payloadB64}`;
    const expectedSig = await sign(unsigned, secret);
    if (signatureB64 !== expectedSig) return null;
    // 安全 Base64URL 解码，支持中文
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
