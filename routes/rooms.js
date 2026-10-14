import express from 'express';
import { getRepo } from '../db/repo.js';
import { requireUser } from '../lib/auth.js';
import { validateRoomName } from '../lib/validate.js';

const router = express.Router();

router.use(requireUser);

// GET /api/rooms
// Returns rooms the user owns or has joined
router.get('/', async (req, res) => {
  try {
    const repo = await getRepo();
    const rooms = await repo.listRoomsForUser(req.user.id);
    return res.status(200).json({ rooms });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/rooms/:id
// Owner only. Body: { name }
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};

  const nameRes = validateRoomName(name);
  if (!nameRes.valid) {
    return res.status(400).json({ error: nameRes.error });
  }

  try {
    const repo = await getRepo();
    const room = await repo.getRoom(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Only the room owner can rename the room' });
    }

    const updated = await repo.updateRoom(id, { name: nameRes.value });
    req.app.get('roomManager')?.renameRoom(id, updated.name);
    return res.status(200).json({
      room: {
        id: updated.id,
        name: updated.name,
        ownerId: updated.ownerId,
        ownerName: updated.ownerName
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/rooms/:id
// Owner only
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const repo = await getRepo();
    const room = await repo.getRoom(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Only the room owner can delete the room' });
    }

    await repo.deleteRoom(id);

    await req.app.get('roomManager')?.removeRoom(id);

    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
