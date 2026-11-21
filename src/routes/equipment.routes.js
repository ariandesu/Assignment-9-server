import { Router } from 'express';
import {
  listPublicEquipment,
  getFeaturedEquipment,
  getCategoryCounts,
  getEquipmentAvailability,
} from '../controllers/equipment.controller.js';
import {
  createEquipment,
  getMyEquipmentList,
  getEquipmentById,
  updateEquipment,
  deleteEquipment,
} from '../controllers/ownerEquipment.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { verifyOwner } from '../middlewares/verifyOwner.js';
import { verifyOwnerOrAdmin } from '../middlewares/verifyOwnerOrAdmin.js';

const router = Router();

// Public routes
router.get('/', listPublicEquipment);
router.get('/featured', getFeaturedEquipment);
router.get('/categories', getCategoryCounts);

// Owner routes (must come before /:id)
router.post('/', verifyToken, verifyOwner, createEquipment);
router.get('/mine/list', verifyToken, verifyOwner, getMyEquipmentList);

// Item routes
router.get('/:id', verifyToken, getEquipmentById);
router.get('/:id/availability', verifyToken, getEquipmentAvailability);
router.patch('/:id', verifyToken, verifyOwnerOrAdmin, updateEquipment);
router.delete('/:id', verifyToken, verifyOwnerOrAdmin, deleteEquipment);

export default router;
