import crypto from "crypto";

const STAFF_COOKIE_NAME = "cm_staff_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

function getSecret() {
  return String(process.env.STAFF_AUTH_SECRET || "").trim();
}

function getAllowedEmail() {
  return String(process.env.STAFF_LOGIN_EMAIL || "").trim().toLowerCase();
}

function getAllowedPassword() {
  return String(process.env.STAFF_LOGIN_PASSWORD || "").trim();
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

  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadBase64)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return signature;
}

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function isStaffAuthConfigured() {
  return Boolean(getSecret() && getAllowedEmail() && getAllowedPassword());
}

export function validateStaffCredentials(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  if (!isStaffAuthConfigured()) {
    return { ok: false, reason: "Staff auth not configured" };
  }

  if (normalizedEmail !== getAllowedEmail()) {
    return { ok: false, reason: "Invalid credentials" };
  }

  if (normalizedPassword !== getAllowedPassword()) {
    return { ok: false, reason: "Invalid credentials" };
  }

  return { ok: true, email: normalizedEmail };
}

export function createStaffSessionToken(email) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    email,
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
    if (!payload?.email || !payload?.exp || payload.exp < nowSeconds) {
      return null;
    }

    return {
      email: String(payload.email).toLowerCase(),
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
