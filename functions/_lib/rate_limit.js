export async function checkRateLimit(env, key, maxRequests, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT window_start, count FROM rate_limits WHERE key = ?1`
  ).bind(key).first();

  if (!row || now - row.window_start >= windowSeconds) {
    await env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET window_start = ?2, count = 1`
    ).bind(key, now).run();
    return true;
  }

  if (row.count >= maxRequests) {
    return false;
  }

  await env.DB.prepare(
    `UPDATE rate_limits SET count = count + 1 WHERE key = ?1`
  ).bind(key).run();
  return true;
}
