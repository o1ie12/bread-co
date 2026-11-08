import { getStore } from "@netlify/blobs";
import { isAdmin, json } from "../lib/auth.mjs";

const TONE = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const IMG = /^\/api\/photo\/[a-z0-9-]+$/i;
const ID = /^[a-z0-9-]{1,40}$/i;

const num = (v, int) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > (int ? 500 : 100000)) throw new Error("Invalid price or stock");
  return int ? Math.floor(n) : Math.round(n * 100) / 100;
};

// Accept only the shape we expect, and trim everything to sane lengths.
function clean(body) {
  if (!body || !Array.isArray(body.weeks) || body.weeks.length > 60) throw new Error("Invalid weeks");
  const timezone = String(body.timezone || "Asia/Taipei");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error("Invalid timezone");
  }
  const weekIds = new Set();
  return {
    v: 2,
    timezone,
    paymentNote: String(body.paymentNote ?? "").trim().slice(0, 600),
    weeks: body.weeks.map((w) => {
      if (!ID.test(w.id || "") || weekIds.has(w.id)) throw new Error("Invalid week id");
      weekIds.add(w.id);
      if (!DATETIME.test(w.deadline) || !DATE.test(w.delivery)) throw new Error("Invalid date");
      if (!Array.isArray(w.items) || w.items.length < 1 || w.items.length > 8) throw new Error("Invalid items");
      const itemIds = new Set();
      return {
        id: w.id,
        deadline: w.deadline,
        delivery: w.delivery,
        items: w.items.map((it) => {
          if (!ID.test(it.id || "") || itemIds.has(it.id)) throw new Error("Invalid bread id");
          itemIds.add(it.id);
          return {
            id: it.id,
            zh: String(it.zh ?? "").trim().slice(0, 40),
            en: String(it.en ?? "").trim().slice(0, 60),
            tone: TONE.test(it.tone) ? it.tone : "#d9a35f",
            img: IMG.test(it.img || "") ? it.img : "",
            price: num(it.price, false),
            stock: num(it.stock, true),
          };
        }),
      };
    }),
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const store = getStore("bread-co");

  if (url.pathname === "/api/auth") {
    return (await isAdmin(req)) ? json({ ok: true }) : json({ error: "Wrong password" }, 401);
  }

  if (req.method === "GET") {
    const data = await store.get("weeks", { type: "json" });
    // only hand out menus saved in the current format; otherwise the site uses data/weeks.json
    return json(data?.v === 2 ? data : { weeks: null }, 200, { "cache-control": "public, max-age=0, must-revalidate" });
  }

  if (req.method === "PUT") {
    if (!(await isAdmin(req))) return json({ error: "Wrong password" }, 401);
    try {
      const data = clean(await req.json());
      await store.setJSON("weeks", data);
      return json({ ok: true });
    } catch (e) {
      return json({ error: e.message || "Bad request" }, 400);
    }
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: ["/api/weeks", "/api/auth"] };
