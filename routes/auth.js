import express from 'express';
import crypto from 'node:crypto';
import { getRepo } from '../db/repo.js';
import {
  hashPassword,
  comparePassword,
  dummyComparePassword,
  generateSessionToken,
  hashToken,
  setSessionCookie,
  clearSessionCookie,
  getSessionLifetimeMs
} from '../lib/auth.js';
import { validateEmail, validateDisplayName, validatePassword } from '../lib/validate.js';
import {
  checkIpRateLimit,
  checkEmailRateLimit,
  recordEmailFailure,
  resetEmailFailure
} from '../lib/rateLimit.js';

const router = express.Router();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const ip = getClientIp(req);
  if (!checkIpRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { email, displayName, password } = req.body || {};

  const emailRes = validateEmail(email);
  if (!emailRes.valid) {
    return res.status(400).json({ error: emailRes.error });
  }

  const nameRes = validateDisplayName(displayName);
  if (!nameRes.valid) {
    return res.status(400).json({ error: nameRes.error });
  }

  const passRes = validatePassword(password, emailRes.value);
  if (!passRes.valid) {
    return res.status(400).json({ error: passRes.error });
  }

  try {
    const repo = await getRepo();
    const existing = await repo.getUserByEmail(emailRes.value);
    if (existing) {
      return res.status(409).json({ error: 'That email is already registered' });
    }

    const passwordHash = await hashPassword(passRes.value);
    const userId = crypto.randomUUID();
    const user = await repo.createUser({
      id: userId,
      email: emailRes.value,
      displayName: nameRes.value,
      passwordHash
    });

    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + getSessionLifetimeMs();
    await repo.createSession({ tokenHash, userId: user.id, expiresAt });

    setSessionCookie(res, token, req);
    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const ip = getClientIp(req);
  if (!checkIpRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }

  const emailClean = typeof email === 'string' ? email.toLowerCase().trim() : '';
  if (!checkEmailRateLimit(emailClean)) {
    return res.status(429).json({ error: 'Too many failed login attempts. Please try again in 15 minutes.' });
  }

  try {
    const repo = await getRepo();
    const user = await repo.getUserByEmail(emailClean);

    if (!user) {
      // Dummy compare to avoid timing oracle
      await dummyComparePassword(password);
      recordEmailFailure(emailClean);
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      recordEmailFailure(emailClean);
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }

    resetEmailFailure(emailClean);

    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + getSessionLifetimeMs();
    await repo.createSession({ tokenHash, userId: user.id, expiresAt });

    setSessionCookie(res, token, req);
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    if (req.sessionToken) {
      const tokenHash = hashToken(req.sessionToken);
      const repo = await getRepo();
      await repo.deleteSession(tokenHash);
    }
  } catch (err) {
    // Continue even on error to clear cookie
  }

  clearSessionCookie(res);
  return res.status(204).end();
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  return res.status(200).json({
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
      createdAt: req.user.createdAt
    }
  });
});

export default router;
