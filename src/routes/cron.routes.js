import { Router } from 'express';
import { runCompleteBookings } from '../jobs/completeBookings.js';

const router = Router();

router.get('/complete-bookings', runCompleteBookings);

export default router;
