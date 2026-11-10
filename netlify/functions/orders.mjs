import { isAdmin, json } from "../lib/auth.mjs";
import { loadConfig, ordersStore, orderKey, numberKey, pad, soldCounts, countOrders, claimSlots, HttpError } from "../lib/data.mjs";
import { wallToEpoch } from "../../shared/time.js";
import { emailEnabled, sendMail, confirmationEmail, ownerEmail } from "../lib/email.mjs";

const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const STATUSES = new Set(["new", "paid", "delivered", "cancelled"]);

async function readOrders(store, week) {
  const { blobs } = await store.list({ prefix: `orders/${week}/` });
  const orders = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return orders.filter(Boolean).sort((x, y) => x.no - y.no);
}

// Confirmation to the customer plus an alert to the owner. Returns "sent" | "failed" | "off".
async function notify(order, week, cfg, req) {
  if (!emailEnabled()) return "off";
  let status = "sent";
  try {
    await sendMail({ to: order.email, replyTo: process.env.OWNER_EMAIL || undefined, ...confirmationEmail(order, week, cfg.paymentNote) });
  } catch (e) {
    console.error("confirmation email failed:", e.message);
    status = "failed";
  }
  if (process.env.OWNER_EMAIL) {
    try {
      await sendMail({ to: process.env.OWNER_EMAIL, replyTo: order.email, ...ownerEmail(order, week, `${new URL(req.url).origin}/admin/`) });
    } catch (e) {
      console.error("owner email failed:", e.message);
    }
  }
  return status;
}

// `admin` = the owner adding an order by hand: skips the deadline, honeypot, and the email / transfer-digits requirements.
async function placeOrder(req, admin = false) {
  const b = await req.json().catch(() => null);
  if (!b) throw new HttpError(400, { error: "Bad request" });
  if (!admin && b.hp) return json({ ok: true }); // honeypot: bots fill this in; pretend it worked

  const name = clean(b.name, 60);
  const email = clean(b.email, 120);
  const payment = clean(b.payment, 20);
  const note = clean(b.note, 240);
  if (!name) throw new HttpError(400, { error: "Please enter your name." });
  if (!(admin && !email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, { error: "Please enter a valid email address." });
  if (payment !== "cash" && payment !== "bank") throw new HttpError(400, { error: "Please choose a payment method." });

  let transferLast5 = payment === "bank" ? clean(b.transferLast5, 5) : "";
  if (admin && !/^\d{5}$/.test(transferLast5)) transferLast5 = "";
  if (!admin && payment === "bank" && !/^\d{5}$/.test(transferLast5)) throw new HttpError(400, { error: "Please enter the last 5 digits of the account you transferred from. 請填寫轉帳後五碼。" });

  const cfg = await loadConfig();
  const week = cfg.weeks.find((w) => w.id === b.week);
  if (!week) throw new HttpError(404, { error: "That week isn't available." });
  if (!admin && Date.now() >= wallToEpoch(week.deadline, cfg.timezone)) throw new HttpError(410, { error: "Orders for this week are closed." });

  // merge duplicate lines, validate each bread and quantity
  const qty = new Map();
  for (const l of Array.isArray(b.items) ? b.items : []) {
    const n = Math.floor(Number(l.qty));
    if (n >= 1 && n <= 20) qty.set(String(l.id), (qty.get(String(l.id)) || 0) + n);
  }
  const lines = [];
  for (const [id, n] of qty) {
    const item = week.items.find((it) => it.id === id);
    if (!item) throw new HttpError(400, { error: "A bread in your order isn't on this week's menu." });
    lines.push({ id, zh: item.zh, en: item.en, price: item.price ?? null, qty: n, stock: item.stock ?? null });
  }
  if (!lines.length) throw new HttpError(400, { error: "Your order is empty." });
  const total = lines.every((l) => l.price != null) ? lines.reduce((s, l) => s + l.price * l.qty, 0) : null;

  const store = ordersStore();

  // 1. take the next order number (create-if-absent, so numbers never repeat)
  let no = (await countOrders(store, week.id)) + 1;
  for (let tries = 0; ; no++) {
    const r = await store.setJSON(numberKey(week.id, no), { at: new Date().toISOString() }, { onlyIfNew: true });
    if (r.modified) break;
    if (++tries > 2000) throw new HttpError(503, { error: "We're busy right now. Please try again in a moment." });
  }

  // 2. claim a slot for every loaf; if any bread runs out, give everything back
  let claimed = [];
  let failed = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    claimed = [];
    failed = null;
    for (const l of lines) {
      if (l.stock == null) continue;
      const got = await claimSlots(store, week.id, { id: l.id, stock: l.stock }, l.qty, no);
      claimed.push(...got);
      if (got.length < l.qty) {
        failed = l;
        break;
      }
    }
    if (!failed) break;
    await Promise.all(claimed.map((k) => store.delete(k)));
    const sold = await soldCounts(store, week.id);
    // if what's left would cover us after all (someone else just backed out), try again
    if (Math.max(0, failed.stock - (sold[failed.id] || 0)) < failed.qty) break;
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  if (failed) {
    await store.delete(numberKey(week.id, no));
    const sold = await soldCounts(store, week.id);
    const left = Math.max(0, failed.stock - (sold[failed.id] || 0));
    throw new HttpError(409, {
      error:
        (left === 0 ? `Sorry, ${failed.en || failed.zh} just sold out.` : `Sorry, only ${left} ${failed.en || failed.zh} left.`) +
        (admin ? " Raise its stock in the Menu tab first." : ""),
      sold,
    });
  }

  // 3. save the order
  const order = {
    no,
    at: new Date().toISOString(),
    name, email, payment, ...(transferLast5 ? { transferLast5 } : {}), note,
    items: lines.map(({ stock, ...rest }) => rest),
    total,
    status: admin && STATUSES.has(b.status) && b.status !== "cancelled" ? b.status : "new",
    ...(admin ? { addedByAdmin: true } : {}),
    slots: claimed,
  };
  await store.setJSON(orderKey(week.id, no), order);

  // 4. emails (a failure here never fails the order)
  order.emailStatus = admin ? "off" : await notify(order, week, cfg, req);
  await store.setJSON(orderKey(week.id, no), order);
  return json({ ok: true, no, total, emailed: order.emailStatus === "sent", sold: await soldCounts(store, week.id) });
}

// Owner edits an existing order (any time, deadline doesn't apply). Loaves are re-claimed / released to match.
async function editOrder(b) {
  if (!/^[a-z0-9-]{1,40}$/i.test(b.week || "")) throw new HttpError(400, { error: "Bad request" });
  const store = ordersStore();
  const key = orderKey(b.week, Number(b.no));
  const o = await store.get(key, { type: "json" });
  if (!o) throw new HttpError(404, { error: "Order not found" });
  if (o.status === "cancelled") throw new HttpError(409, { error: "A cancelled order can't be edited." });
  const cfg = await loadConfig();
  const week = cfg.weeks.find((w) => w.id === b.week);
  if (!week) throw new HttpError(404, { error: "That week isn't on the menu any more." });

  const name = clean(b.name, 60);
  const email = clean(b.email, 120);
  const payment = clean(b.payment, 20);
  const note = clean(b.note, 240);
  let transferLast5 = payment === "bank" ? clean(b.transferLast5, 5) : "";
  if (!/^\d{5}$/.test(transferLast5)) transferLast5 = "";
  if (!name) throw new HttpError(400, { error: "Please enter a name." });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, { error: "That email address doesn't look right." });
  if (payment !== "cash" && payment !== "bank") throw new HttpError(400, { error: "Choose a payment method." });

  const qty = new Map();
  for (const l of Array.isArray(b.items) ? b.items : []) {
    const n = Math.floor(Number(l.qty));
    if (n >= 1 && n <= 50) qty.set(String(l.id), (qty.get(String(l.id)) || 0) + n);
  }
  const lines = [];
  for (const [id, n] of qty) {
    const item = week.items.find((it) => it.id === id);
    const prev = o.items.find((i) => i.id === id);
    if (!item && !prev) throw new HttpError(400, { error: "A bread in this order isn't on the menu." });
    lines.push({ id, zh: prev?.zh ?? item.zh, en: prev?.en ?? item.en, price: prev ? prev.price : item.price ?? null, qty: n, stock: item?.stock ?? null });
  }
  if (!lines.length) throw new HttpError(400, { error: "An order needs at least one bread. Cancel it instead." });

  // re-balance loaves: claim extra slots for bigger quantities, release for smaller ones
  const have = {};
  for (const k of o.slots || []) (have[k.split("/")[2]] ||= []).push(k);
  const claimedNew = [];
  const release = [];
  let failed = null;
  for (const l of lines) {
    const cur = have[l.id] || [];
    if (l.stock == null) {
      release.push(...cur);
    } else if (l.qty > cur.length) {
      const got = await claimSlots(store, week.id, { id: l.id, stock: l.stock }, l.qty - cur.length, o.no);
      claimedNew.push(...got);
      if (got.length < l.qty - cur.length) {
        failed = l;
        break;
      }
    } else if (l.qty < cur.length) {
      release.push(...cur.slice(l.qty));
    }
  }
  for (const id of Object.keys(have)) if (!lines.some((l) => l.id === id)) release.push(...have[id]);
  if (failed) {
    await Promise.all(claimedNew.map((k) => store.delete(k)));
    const sold = await soldCounts(store, week.id);
    const left = Math.max(0, failed.stock - (sold[failed.id] || 0));
    throw new HttpError(409, { error: `Only ${left} ${failed.en || failed.zh} left. Raise its stock in the Menu tab first.`, sold });
  }

  if (email !== (o.email || "")) delete o.emailStatus;
  o.name = name;
  o.email = email;
  o.payment = payment;
  o.note = note;
  if (transferLast5) o.transferLast5 = transferLast5;
  else delete o.transferLast5;
  o.items = lines.map(({ stock, ...rest }) => rest);
  o.total = lines.every((l) => l.price != null) ? lines.reduce((s, l) => s + l.price * l.qty, 0) : null;
  o.slots = (o.slots || []).filter((k) => !release.includes(k)).concat(claimedNew);
  o.edited = new Date().toISOString();
  await store.setJSON(key, o);
  await Promise.all(release.map((k) => store.delete(k)));
  return json({ ok: true, sold: await soldCounts(store, week.id) });
}

export default async (req) => {
  const url = new URL(req.url);
  try {
    // public: how many of each bread are already taken this week
    if (url.pathname === "/api/stock" && req.method === "GET") {
      const week = url.searchParams.get("week") || "";
      if (!/^[a-z0-9-]{1,40}$/i.test(week)) return json({ error: "Bad week" }, 400);
      return json({ sold: await soldCounts(ordersStore(), week) });
    }

    if (url.pathname === "/api/order" && req.method === "POST") return await placeOrder(req);

    // admin: list orders / change an order's status
    if (url.pathname === "/api/admin/orders") {
      if (!(await isAdmin(req))) return json({ error: "Wrong password" }, 401);
      if (req.method === "GET") {
        const week = url.searchParams.get("week") || "";
        if (!/^[a-z0-9-]{1,40}$/i.test(week)) return json({ error: "Bad week" }, 400);
        const store = ordersStore();
        return json({ orders: await readOrders(store, week), sold: await soldCounts(store, week) });
      }
      if (req.method === "POST") return await placeOrder(req, true);
      if (req.method === "PATCH") {
        const b = await req.json().catch(() => ({}));
        if (b.action === "edit") return await editOrder(b);
        if (b.action === "resend") {
          if (!/^[a-z0-9-]{1,40}$/i.test(b.week || "")) return json({ error: "Bad request" }, 400);
          if (!emailEnabled()) return json({ error: "Email isn't set up yet (see README)." }, 400);
          const store = ordersStore();
          const key = orderKey(b.week, Number(b.no));
          const o = await store.get(key, { type: "json" });
          const cfg = await loadConfig();
          const week = cfg.weeks.find((w) => w.id === b.week);
          if (!o || !week || !o.email) return json({ error: "Order not found" }, 404);
          try {
            await sendMail({ to: o.email, replyTo: process.env.OWNER_EMAIL || undefined, ...confirmationEmail(o, week, cfg.paymentNote) });
            o.emailStatus = "sent";
          } catch (e) {
            console.error("resend failed:", e.message);
            o.emailStatus = "failed";
          }
          await store.setJSON(key, o);
          return json({ ok: o.emailStatus === "sent", emailStatus: o.emailStatus });
        }
        if (!/^[a-z0-9-]{1,40}$/i.test(b.week || "") || !STATUSES.has(b.status)) return json({ error: "Bad request" }, 400);
        const store = ordersStore();
        const key = orderKey(b.week, Number(b.no));
        const o = await store.get(key, { type: "json" });
        if (!o) return json({ error: "Order not found" }, 404);
        if (o.status === "cancelled" && b.status !== "cancelled") return json({ error: "A cancelled order can't be reopened. Ask the customer to order again." }, 409);
        if (b.status === "cancelled" && o.status !== "cancelled") {
          await Promise.all((o.slots || []).map((k) => store.delete(k))); // frees the loaves
        }
        o.status = b.status;
        await store.setJSON(key, o);
        const out = { ok: true, sold: await soldCounts(store, b.week) };
        return json(out);
      }
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json(e.body, e.status);
    console.error(e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
};

export const config = { path: ["/api/stock", "/api/order", "/api/admin/orders"] };
