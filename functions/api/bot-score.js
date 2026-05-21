// functions/api/bot-score.js
export async function onRequest(context) {
  // 从 Cloudflare 自动提供的 cf 对象中获取机器人评分
  const score = context.request.cf?.botManagement?.score;

  // 如果没拿到分数，返回一个错误提示
  if (score === undefined) {
    return new Response(JSON.stringify({ error: 'Bot score not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 成功返回真实评分
  return new Response(JSON.stringify({ botScore: score }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
