/**
 * @fileoverview Admin Routes
 * Routes for admin dashboard and user management
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import {
    getDashboard,
    getUsers,
    getUserDetails,
    createUser,
    updateUser,
    deleteUser,
    getSystemLogs,
    getSystemSettings
} from '../../controllers/admin/adminController.js';

const router = express.Router();

// Apply authentication and admin check to all admin routes
router.use(requireAuth);
router.use(requireAdmin);

// Dashboard
router.get('/', getDashboard);
router.get('/dashboard', getDashboard);

// User Management
router.get('/users', getUsers);
router.get('/users/create', createUser);
router.post('/users/create', createUser);
router.get('/users/:id', getUserDetails);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// System Management
router.get('/system/logs', getSystemLogs);
router.get('/system/settings', getSystemSettings);

export default router;
