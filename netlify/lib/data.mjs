import { getStore } from "@netlify/blobs";
import seed from "../../data/weeks.json";

// The saved menu (from /admin), or the starting menu in data/weeks.json if nothing valid is saved yet.
export async function loadConfig() {
  const saved = await getStore("bread-co").get("weeks", { type: "json" });
  return saved?.v === 2 ? saved : seed;
}

export const ordersStore = () => getStore({ name: "bread-orders", consistency: "strong" });

export const pad = (n) => String(n).padStart(5, "0");
export const orderKey = (week, no) => `orders/${week}/${pad(no)}`;
export const numberKey = (week, no) => `no/${week}/${pad(no)}`;
export const slotKey = (week, item, k) => `slot/${week}/${item}/${k}`;

export class HttpError extends Error {
  constructor(status, body) {
    super(body?.error || "error");
    this.status = status;
    this.body = body;
  }
}

async function keys(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return blobs.map((b) => b.key);
}

export const countOrders = async (store, week) => (await keys(store, `no/${week}/`)).length;

// How many of each bread are taken. Every taken loaf is one "slot" blob, so this is just a count.
export async function soldCounts(store, week) {
  const sold = {};
  for (const k of await keys(store, `slot/${week}/`)) {
    const id = k.split("/")[2];
    sold[id] = (sold[id] || 0) + 1;
  }
  return sold;
}

// Try to take `qty` loaves of a bread. Each numbered slot can be created only once ("create if absent"),
// so two people can never get the same loaf, even if they order at the same instant.
export async function claimSlots(store, week, item, qty, no) {
  const got = [];
  for (let k = 1; k <= item.stock && got.length < qty; k++) {
    const key = slotKey(week, item.id, k);
    const r = await store.setJSON(key, { no }, { onlyIfNew: true });
    if (r.modified) got.push(key);
  }
  return got;
}
