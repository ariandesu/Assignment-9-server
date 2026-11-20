import { Router } from 'express';
import {
  createBooking,
  listMyBookings,
  listOwnerBookings,
} from '../controllers/bookings.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { verifyRenter } from '../middlewares/verifyRenter.js';
import { verifyOwner } from '../middlewares/verifyOwner.js';

const router = Router();

router.post('/', verifyToken, verifyRenter, createBooking);
router.get('/mine', verifyToken, verifyRenter, listMyBookings);
router.get('/owner', verifyToken, verifyOwner, listOwnerBookings);

export default router;
