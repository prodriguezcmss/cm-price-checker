function readFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function isPosHandoffEnabled() {
  return readFlag("POS_HANDOFF_ENABLED", false);
}
