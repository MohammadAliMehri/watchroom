/**
 * In-memory rate limiter for auth routes
 * - IP-based: 10 requests per IP per 15 minutes
 * - Email-based: 5 failed logins per email in 15 minutes -> block for 15 minutes
 */

const ipHits = new Map(); // ip -> Array<timestamps>
const emailFailures = new Map(); // email -> { failures: Array<timestamps>, blockedUntil: number }

const WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 10;
const EMAIL_FAIL_MAX = 5;

export function checkIpRateLimit(ip) {
  const now = Date.now();
  const timestamps = ipHits.get(ip) || [];
  const validTimestamps = timestamps.filter(t => now - t < WINDOW_MS);

  if (validTimestamps.length >= IP_MAX) {
    return false;
  }

  validTimestamps.push(now);
  ipHits.set(ip, validTimestamps);
  return true;
}

export function checkEmailRateLimit(email) {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const record = emailFailures.get(key);

  if (!record) return true;

  if (record.blockedUntil && record.blockedUntil > now) {
    return false;
  }

  const validFailures = record.failures.filter(t => now - t < WINDOW_MS);
  if (validFailures.length >= EMAIL_FAIL_MAX) {
    record.blockedUntil = now + WINDOW_MS;
    return false;
  }

  return true;
}

export function recordEmailFailure(email) {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  const record = emailFailures.get(key) || { failures: [], blockedUntil: 0 };
  const validFailures = record.failures.filter(t => now - t < WINDOW_MS);
  validFailures.push(now);

  if (validFailures.length >= EMAIL_FAIL_MAX) {
    record.blockedUntil = now + WINDOW_MS;
  }
  record.failures = validFailures;
  emailFailures.set(key, record);
}

export function resetEmailFailure(email) {
  const key = email.toLowerCase().trim();
  emailFailures.delete(key);
}

export function clearRateLimits() {
  ipHits.clear();
  emailFailures.clear();
}
