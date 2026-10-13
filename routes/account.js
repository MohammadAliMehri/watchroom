import express from 'express';
import { getRepo } from '../db/repo.js';
import { requireUser, hashPassword, comparePassword, hashToken, clearSessionCookie } from '../lib/auth.js';
import { validateDisplayName, validatePassword } from '../lib/validate.js';

const router = express.Router();

router.use(requireUser);

// PATCH /api/account
router.patch('/', async (req, res) => {
  const { displayName } = req.body || {};
  const nameRes = validateDisplayName(displayName);
  if (!nameRes.valid) {
    return res.status(400).json({ error: nameRes.error });
  }

  try {
    const repo = await getRepo();
    const updated = await repo.updateUserProfile(req.user.id, { displayName: nameRes.value });
    return res.status(200).json({
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        createdAt: updated.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/account/password
router.post('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  const passRes = validatePassword(newPassword, req.user.email);
  if (!passRes.valid) {
    return res.status(400).json({ error: passRes.error });
  }

  try {
    const repo = await getRepo();
    const user = await repo.getUserById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(passRes.value);
    await repo.updatePasswordHash(req.user.id, newHash);

    // Delete all OTHER sessions for that user, keeping the current session
    const currentTokenHash = req.sessionToken ? hashToken(req.sessionToken) : null;
    await repo.deleteUserSessions(req.user.id, currentTokenHash);

    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/account
router.delete('/', async (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required to delete account' });
  }

  try {
    const repo = await getRepo();
    const user = await repo.getUserById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }

    await repo.deleteUser(req.user.id);
    clearSessionCookie(res);
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
