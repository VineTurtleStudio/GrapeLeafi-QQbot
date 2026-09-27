export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return ((h % 24) * 60 + (m % 60)) % 1440;
}

export function inSpan(nowMin, startMin, endMin) {
  if (startMin === endMin) return false;
  return startMin < endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin;
}

export function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function isQuietNow(quiet) {
  if (!quiet || !quiet.enabled) return false;
  return inSpan(nowMinutes(), toMinutes(quiet.start), toMinutes(quiet.end));
}

export function fmtHHMM(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}