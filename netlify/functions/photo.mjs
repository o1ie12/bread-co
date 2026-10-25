import { getStore } from "@netlify/blobs";
import { isAdmin, json } from "../lib/auth.mjs";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 4 * 1024 * 1024;

export default async (req) => {
  const store = getStore("bread-co-photos");

  if (req.method === "POST") {
    if (!(await isAdmin(req))) return json({ error: "Wrong password" }, 401);
    const type = (req.headers.get("content-type") || "").split(";")[0];
    if (!TYPES.has(type)) return json({ error: "Use a JPG, PNG or WebP image" }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX) return json({ error: "Image is too large" }, 413);
    const id = crypto.randomUUID();
    await store.set(id, buf, { metadata: { type } });
    return json({ url: `/api/photo/${id}` });
  }

  if (req.method === "GET") {
    const id = new URL(req.url).pathname.split("/").pop();
    if (!/^[a-z0-9-]+$/i.test(id)) return new Response("Not found", { status: 404 });
    const res = await store.getWithMetadata(id, { type: "arrayBuffer" });
    if (!res) return new Response("Not found", { status: 404 });
    return new Response(res.data, {
      headers: { "content-type": res.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
    });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: ["/api/photo", "/api/photo/*"] };
