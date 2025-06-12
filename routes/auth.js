/**
 * @fileoverview Authentication Routes for ETF Portfolio Manager
 * Handles user registration, login, logout, and profile management
 */

import express from 'express';
import { 
    registerUser,
    loginUser,
    logoutUser,
    getUserProfile,
    updateUserProfile,
    registerValidation,
    loginValidation,
    authRateLimit
} from '../controllers/authController.js';
import { requireAuth, requireGuest } from '../middleware/auth.js';

const router = express.Router();

// Guest-only routes (not logged in)
router.get('/login', requireGuest, (req, res) => {
    res.render('auth/login', { 
        title: 'Accedi',
        error: null 
    });
});

router.get('/register', requireGuest, (req, res) => {
    res.render('auth/register', { 
        title: 'Registrati',
        error: null 
    });
});

// Authentication endpoints with rate limiting
router.post('/login', 
    requireGuest,
    authRateLimit,
    loginValidation,
    loginUser
);

router.post('/register', 
    requireGuest,
    authRateLimit,
    registerValidation,
    registerUser
);

// Protected routes (requires authentication)
router.post('/logout', requireAuth, logoutUser);
router.get('/logout', requireAuth, logoutUser);

router.get('/profile', requireAuth, getUserProfile);

router.put('/profile', requireAuth, updateUserProfile);

export default router;
