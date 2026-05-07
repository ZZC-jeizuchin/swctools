export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await request.json().catch(() => ({}));
  const { token } = body;
  if (!token) {
    return new Response(JSON.stringify({ valid: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return respond(false);
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const unsigned = `${headerB64}.${payloadB64}`;
    const expectedSig = await sign(unsigned, env.JWT_SECRET);

    if (signatureB64 !== expectedSig) {
      return respond(false);
    }

    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return respond(false);
    }

    return respond(true, payload.sub);
  } catch {
    return respond(false);
  }
}

function respond(valid, username) {
  return new Response(JSON.stringify({ valid, username }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
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
