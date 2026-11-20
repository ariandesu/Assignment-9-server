import { Router } from 'express';
import {
  createCheckoutSession,
  confirmPayment,
} from '../controllers/payments.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { verifyRenter } from '../middlewares/verifyRenter.js';

const router = Router();

router.post('/checkout', verifyToken, verifyRenter, createCheckoutSession);
router.post('/confirm', verifyToken, verifyRenter, confirmPayment);

export default router;
