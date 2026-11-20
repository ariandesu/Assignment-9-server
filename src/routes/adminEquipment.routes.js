import { Router } from 'express';
import {
  listAdminEquipment,
  updateAdminEquipmentStatus,
} from '../controllers/adminEquipment.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { verifyAdmin } from '../middlewares/verifyAdmin.js';

const router = Router();

router.get('/equipment', verifyToken, verifyAdmin, listAdminEquipment);
router.patch('/equipment/:id/status', verifyToken, verifyAdmin, updateAdminEquipmentStatus);

export default router;
