import crypto from "crypto";

const STAFF_COOKIE_NAME = "cm_staff_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

function getSecret() {
  return String(process.env.STAFF_AUTH_SECRET || "").trim();
}

function getAllowedPin() {
  return String(process.env.STAFF_LOGIN_PIN || "").trim();
}

function normalizeStaffId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signPayload(payloadBase64) {
  const secret = getSecret();
  if (!secret) return null;

  return crypto
    .createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function isStaffAuthConfigured() {
  return Boolean(getSecret() && getAllowedPin());
}

export function validateStaffPinLogin({ staffId, pin }) {
  const normalizedStaffId = normalizeStaffId(staffId);
  const normalizedPin = String(pin || "").trim();

  if (!isStaffAuthConfigured()) {
    return { ok: false, reason: "Staff auth not configured" };
  }

  if (!normalizedStaffId) {
    return { ok: false, reason: "Staff ID is required" };
  }

  if (normalizedPin !== getAllowedPin()) {
    return { ok: false, reason: "Invalid credentials" };
  }

  return { ok: true, staffId: normalizedStaffId };
}

export function createStaffSessionToken(staffId) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    staffId,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_DURATION_SECONDS
  };

  const payloadBase64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);
  if (!signature) return null;

  return `${payloadBase64}.${signature}`;
}

export function verifyStaffSessionToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  const [payloadBase64, signature] = raw.split(".");
  if (!payloadBase64 || !signature) return null;

  const expected = signPayload(payloadBase64);
  if (!expected || !timingSafeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadBase64));
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload?.staffId || !payload?.exp || payload.exp < nowSeconds) {
      return null;
    }

    return {
      staffId: String(payload.staffId),
      exp: payload.exp,
      iat: payload.iat
    };
  } catch {
    return null;
  }
}

export function getStaffSessionFromRequest(request) {
  const token = request.cookies.get(STAFF_COOKIE_NAME)?.value || "";
  return verifyStaffSessionToken(token);
}

export function getStaffSessionCookieName() {
  return STAFF_COOKIE_NAME;
}

export function getStaffSessionMaxAge() {
  return SESSION_DURATION_SECONDS;
}
