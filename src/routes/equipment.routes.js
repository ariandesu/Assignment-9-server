import { Router } from 'express';
import {
  listPublicEquipment,
  getFeaturedEquipment,
  getCategoryCounts,
} from '../controllers/equipment.controller.js';

const router = Router();

router.get('/', listPublicEquipment);
router.get('/featured', getFeaturedEquipment);
router.get('/categories', getCategoryCounts);

export default router;
