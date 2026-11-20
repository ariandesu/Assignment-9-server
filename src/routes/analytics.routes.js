import { Router } from 'express';
import { getAdminAnalytics, getOwnerAnalytics } from '../controllers/analytics.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { verifyAdmin } from '../middlewares/verifyAdmin.js';
import { verifyOwner } from '../middlewares/verifyOwner.js';

const router = Router();

router.get('/admin', verifyToken, verifyAdmin, getAdminAnalytics);
router.get('/owner', verifyToken, verifyOwner, getOwnerAnalytics);

export default router;
