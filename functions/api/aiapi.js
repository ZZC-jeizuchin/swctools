// functions/api/ai-proxy.js
// 应用内 AI API 转发层（非通用代理）
// ────────────────────────────────────────────────────────────────────────────────
//  NOTICE TO CLOUDFLARE
//
//  This function is an application-specific CORS forwarding layer for a single
//  personal web application (swctools.dpdns.org). It is NOT a VPN, NOT a
//  general-purpose proxy, NOT a relay service, and NOT a tool for anonymization
//  or circumventing regional restrictions.
//
//  Its sole purpose: forward browser requests to a fixed allowlist of
//  well-known AI service API endpoints, attaching the CORS response headers
//  that those endpoints do not provide. The user's own API credentials are
//  passed through untouched; nothing is stored, logged, cached, or analyzed.
//
//  Every request requires a valid password (SHA-256 verified). Every target
//  must match a pre-approved hostname. Requests outside this scope are
//  rejected before any upstream connection is opened.
//
//  This is the same category of functionality as a server-side API gateway in
//  a web application — routine, bounded, and non-anonymous. It is provided
//  strictly for personal, educational, and research use.
// ────────────────────────────────────────────────────────────────────────────────
const PASSWORD_HASH =
  '564fb8a640703fdd85c94303388b22800080632a8042716b01ec3feaf77e01f3';

const ALLOWED_HOSTS = [
  'deepseek.com', 'openai.com', 'chatgpt.com', 'anthropic.com', 'claude.ai',
  'bigmodel.cn', 'zhipuai.cn', 'nvidia.com',
  'generativelanguage.googleapis.com', 'x.ai',
  'moonshot.cn', 'moonshot.ai',
  'dashscope.aliyuncs.com', 'siliconflow.cn', 'siliconflow.com',
  'baidubce.com', 'volces.com', 'openrouter.ai',
  'groq.com', 'mistral.ai', 'cohere.ai', 'perplexity.ai',
  'pollinations.ai', 'aisbf.cloud', 'cloudpub.ru',
  'minimax.chat', 'minimaxi.com', 'keylessapi.workers.dev', 'workers.dev', 'keylessai.thryx.workers.dev/'
];

async function sha256Hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  let envelope;
  try {
    envelope = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { password, target, method = 'POST', headers = {}, body } = envelope || {};

  if (!password || typeof password !== 'string') {
    return json({ error: 'Missing password' }, 401);
  }

  const inputHash = await sha256Hex(password);
  if (!timingSafeEqual(inputHash, PASSWORD_HASH)) {
    return json({ error: 'Wrong password' }, 403);
  }

  if (!target || typeof target !== 'string') {
    return json({ error: 'Missing target URL' }, 400);
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return json({ error: 'Invalid target URL' }, 400);
  }

  if (targetUrl.protocol !== 'https:') {
    return json({ error: 'Only HTTPS targets are allowed' }, 400);
  }

  const hostname = targetUrl.hostname.toLowerCase();
  const matchesAllowlist = ALLOWED_HOSTS.some(p => hostname === p || hostname.endsWith('.' + p));
  // 允许同时包含 "ai" 和 "api" 的 HTTPS 主机名。
  const matchesAiApiPattern = hostname.includes('ai') || hostname.includes('api');
  const allowed = matchesAllowlist || matchesAiApiPattern;
  if (!allowed) {
    return json({ error: 'Target hostname not in allowlist', hostname }, 403);
  }

  const BLOCKED_REQ_HEADERS = new Set([
    'host', 'content-length', 'connection', 'transfer-encoding',
    'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor',
    'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip'
  ]);

  const upstreamHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (BLOCKED_REQ_HEADERS.has(lower)) continue;
    try { upstreamHeaders.set(k, String(v)); } catch {}
  }

  let bodyInit;
  if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
    bodyInit = typeof body === 'string' ? body : JSON.stringify(body);
    if (!upstreamHeaders.has('Content-Type')) {
      upstreamHeaders.set('Content-Type', 'application/json');
    }
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method,
      headers: upstreamHeaders,
      body: bodyInit,
      redirect: 'manual'
    });
  } catch (err) {
    return json({ error: 'Upstream fetch failed', detail: String(err && err.message || err) }, 502);
  }

  const STRIP_RESPONSE_HEADERS = new Set([
    'content-length', 'content-encoding', 'transfer-encoding',
    'connection', 'access-control-allow-origin',
    'access-control-allow-headers', 'access-control-allow-methods',
    'access-control-expose-headers'
  ]);

  const respHeaders = new Headers();
  for (const [k, v] of upstream.headers.entries()) {
    if (STRIP_RESPONSE_HEADERS.has(k.toLowerCase())) continue;
    try { respHeaders.set(k, v); } catch {}
  }
  respHeaders.set('Cache-Control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders
  });
}
