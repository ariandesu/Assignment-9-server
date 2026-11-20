import express from 'express';
import { verifyToken } from '../middlewares/verifyToken.js';
import { getMe, updateMe } from '../controllers/users.controller.js';

const router = express.Router();

router.get('/me', verifyToken, getMe);
router.patch('/me', verifyToken, updateMe);

export default router;
