const GLOBAL_KEY = "__cm_price_checker_rate_limits";

function getStore() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new Map();
  }
  return globalThis[GLOBAL_KEY];
}

function cleanup(entries, now, windowMs) {
  const threshold = now - windowMs;
  let start = 0;
  while (start < entries.length && entries[start] <= threshold) {
    start += 1;
  }
  if (start > 0) entries.splice(0, start);
}

export function getClientIp(request) {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  return "unknown";
}

export function checkRateLimit({ key, namespace, maxRequests, windowMs }) {
  const now = Date.now();
  const scopedKey = `${namespace}:${key}`;
  const store = getStore();

  if (!store.has(scopedKey)) {
    store.set(scopedKey, []);
  }

  const entries = store.get(scopedKey);
  cleanup(entries, now, windowMs);

  if (entries.length >= maxRequests) {
    const retryAtMs = entries[0] + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((retryAtMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds
    };
  }

  entries.push(now);

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - entries.length),
    retryAfterSeconds: 0
  };
}
