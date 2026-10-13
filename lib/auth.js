import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getRepo } from '../db/repo.js';

export const COOKIE_NAME = 'wr_session';
const BCRYPT_COST = 12;
const DUMMY_HASH = '$2a$12$e80yq73q.53J88LkJp8dDeu2L83m8tTf287.r8eCgXk7w10m3GqKK'; // Pre-computed cost 12 dummy hash for timing attacks

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function dummyComparePassword(password) {
  return bcrypt.compare(password, DUMMY_HASH);
}

export function generateSessionToken() {
  const bytes = crypto.randomBytes(32);
  return bytes.toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [name, ...rest] = part.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  }
  return cookies;
}

export function getSessionDays() {
  const days = parseInt(process.env.SESSION_DAYS, 10);
  return isNaN(days) || days <= 0 ? 30 : days;
}

export function getSessionLifetimeMs() {
  return getSessionDays() * 24 * 60 * 60 * 1000;
}

export function setSessionCookie(res, token, req) {
  const maxAge = Math.floor(getSessionLifetimeMs() / 1000);
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = req && (req.secure || req.headers['x-forwarded-proto'] === 'https');
  const secureFlag = isProd && isHttps ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`
  );
}

export async function attachUser(req, res, next) {
  req.user = null;
  req.session = null;
  req.sessionToken = null;

  try {
    const cookieHeader = req.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];

    if (!token) {
      return next();
    }

    const tokenHash = hashToken(token);
    const repo = await getRepo();
    const result = await repo.getSessionUser(tokenHash);

    if (!result) {
      return next();
    }

    const { session, user } = result;
    req.user = user;
    req.session = session;
    req.sessionToken = token;

    // If last_seen_at is more than 1 day old, touch session
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - session.lastSeenAt > ONE_DAY_MS) {
      const newExpiresAt = Date.now() + getSessionLifetimeMs();
      await repo.touchSession(tokenHash, newExpiresAt);
    }

    next();
  } catch (err) {
    next(err);
  }
}

export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  next();
}
