import { SESSION_COOKIE, readCookie } from "../_lib/session.js";

export async function onRequestGet({ request, env }) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(token).run();
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: "/index2.html",
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}
