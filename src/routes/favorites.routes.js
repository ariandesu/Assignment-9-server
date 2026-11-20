import { Router } from 'express';
import {
  listFavorites,
  getFavoriteIds,
  addFavorite,
  removeFavorite,
} from '../controllers/favorites.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { verifyRenter } from '../middlewares/verifyRenter.js';

const router = Router();

router.get('/', verifyToken, verifyRenter, listFavorites);
router.get('/ids', verifyToken, verifyRenter, getFavoriteIds);
router.post('/', verifyToken, verifyRenter, addFavorite);
router.delete('/:equipmentId', verifyToken, verifyRenter, removeFavorite);

export default router;
