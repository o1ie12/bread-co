// Shop-time helpers shared by the site, the admin page and the Netlify functions.
// Deadlines are stored as wall-clock strings ("2026-11-09T17:00") in the shop's timezone.

function tzOffsetMs(epoch, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(epoch));
  const g = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second);
  return asUTC - Math.floor(epoch / 1000) * 1000;
}

// "2026-11-09T17:00" in `tz`  ->  epoch milliseconds
export function wallToEpoch(str, tz) {
  const [d, t = "00:00"] = str.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, dd, hh, mm);
  const first = guess - tzOffsetMs(guess, tz);
  return guess - tzOffsetMs(first, tz);
}
