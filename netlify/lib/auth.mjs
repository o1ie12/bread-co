import { timingSafeEqual, createHash } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest();

// Admin requests carry the password in the x-admin-password header.
// The password lives in the ADMIN_PASSWORD environment variable on Netlify.
export async function isAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const given = req.headers.get("x-admin-password") || "";
  const ok = timingSafeEqual(sha(given), sha(expected));
  if (!ok) await new Promise((r) => setTimeout(r, 600)); // slow down guessing
  return ok;
}

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
