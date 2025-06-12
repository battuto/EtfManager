/**
 * @fileoverview Authentication Controller for Multi-User ETF Manager
 * Handles user registration, login, logout, and profile management
 */

import { get, getAll, runQuery } from '../config/database.js';
import { validationResult, body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';

/**
 * Rate limiting for authentication endpoints
 */
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMIT'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Input validation rules
 */
export const registerValidation = [
    body('username')
        .isLength({ min: 3, max: 50 })
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username must be 3-50 characters, alphanumeric and underscore only'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email address required'),
    body('password')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must be at least 8 characters with uppercase, lowercase, number and special character'),
    body('first_name')
        .optional()
        .isLength({ max: 100 })
        .trim(),
    body('last_name')
        .optional()
        .isLength({ max: 100 })
        .trim()
];

export const loginValidation = [
    body('username')
        .notEmpty()
        .withMessage('Username or email required'),
    body('password')
        .notEmpty()
        .withMessage('Password required')
];

/**
 * User registration
 * POST /auth/register
 */
export const register = async (req, res) => {
    try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { username, email, password, first_name, last_name } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [
                    { username: username },
                    { email: email }
                ]
            }
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: existingUser.username === username ? 
                    'Username already taken' : 'Email already registered',
                code: 'USER_EXISTS'
            });
        }

        // Create new user
        const user = await User.create({
            username,
            email,
            password_hash: password, // Will be hashed by model hook
            first_name,
            last_name
        });

        // Create default portfolio
        await Portfolio.create({
            user_id: user.id,
            name: 'My Portfolio',
            description: 'Default investment portfolio',
            is_default: true
        });

        // Generate authentication token
        const tokenData = await generateToken(user, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        console.log(`✅ New user registered: ${username} (${email})`);

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                subscription_tier: user.subscription_tier
            },
            token: tokenData.token,
            expires_at: tokenData.expires_at
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Registration failed',
            code: 'REGISTRATION_ERROR'
        });
    }
};

/**
 * User login
 * POST /auth/login
 */
export const login = async (req, res) => {
    try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { login, password } = req.body;

        // Find user by username or email
        const user = await User.findOne({
            where: {
                [Op.or]: [
                    { username: login },
                    { email: login }
                ],
                is_active: true
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Validate password
        const isValidPassword = await user.validatePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Generate authentication token
        const tokenData = await generateToken(user, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Update last login
        await user.update({ last_login: new Date() });

        console.log(`✅ User logged in: ${user.username}`);

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                subscription_tier: user.subscription_tier,
                last_login: user.last_login
            },
            token: tokenData.token,
            expires_at: tokenData.expires_at
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            code: 'LOGIN_ERROR'
        });
    }
};

/**
 * User logout
 * POST /auth/logout
 */
export const logout = async (req, res) => {
    try {
        const sessionToken = req.sessionToken;
        const userId = req.user.id;

        // Revoke current session
        await revokeSession(userId, sessionToken);

        console.log(`✅ User logged out: ${req.user.username}`);

        res.json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed',
            code: 'LOGOUT_ERROR'
        });
    }
};

/**
 * Logout from all devices
 * POST /auth/logout-all
 */
export const logoutAll = async (req, res) => {
    try {
        const userId = req.user.id;

        // Revoke all sessions for user
        const revokedSessions = await revokeSession(userId);

        console.log(`✅ User logged out from all devices: ${req.user.username} (${revokedSessions} sessions)`);

        res.json({
            success: true,
            message: `Logged out from ${revokedSessions} device(s)`,
            revoked_sessions: revokedSessions
        });

    } catch (error) {
        console.error('❌ Logout all error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed',
            code: 'LOGOUT_ALL_ERROR'
        });
    }
};

/**
 * Get current user profile
 * GET /auth/profile
 */
export const getProfile = async (req, res) => {
    try {
        const user = req.user;

        // Get user's portfolios count
        const portfolioCount = await Portfolio.count({
            where: { user_id: user.id }
        });

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                subscription_tier: user.subscription_tier,
                created_at: user.created_at,
                last_login: user.last_login,
                portfolio_count: portfolioCount
            }
        });

    } catch (error) {
        console.error('❌ Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get profile',
            code: 'PROFILE_ERROR'
        });
    }
};

/**
 * Update user profile
 * PUT /auth/profile
 */
export const updateProfile = async (req, res) => {
    try {
        const user = req.user;
        const { first_name, last_name, email } = req.body;

        // Check if email is already taken by another user
        if (email && email !== user.email) {
            const existingUser = await User.findOne({
                where: {
                    email: email,
                    id: { [Op.ne]: user.id }
                }
            });

            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    error: 'Email already taken',
                    code: 'EMAIL_EXISTS'
                });
            }
        }

        // Update user
        await user.update({
            first_name: first_name || user.first_name,
            last_name: last_name || user.last_name,
            email: email || user.email
        });

        console.log(`✅ Profile updated: ${user.username}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                subscription_tier: user.subscription_tier
            }
        });

    } catch (error) {
        console.error('❌ Update profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile',
            code: 'UPDATE_PROFILE_ERROR'
        });
    }
};

/**
 * Change password
 * PUT /auth/change-password
 */
export const changePassword = async (req, res) => {
    try {
        const user = req.user;
        const { current_password, new_password } = req.body;

        // Validate current password
        const isValidPassword = await user.validatePassword(current_password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: 'Current password is incorrect',
                code: 'INVALID_CURRENT_PASSWORD'
            });
        }

        // Update password
        await user.update({
            password_hash: new_password // Will be hashed by model hook
        });

        // Revoke all other sessions (force re-login on other devices)
        await revokeSession(user.id, req.sessionToken);

        console.log(`✅ Password changed: ${user.username}`);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('❌ Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to change password',
            code: 'CHANGE_PASSWORD_ERROR'
        });
    }
};

/**
 * Verify token (for client-side token validation)
 * GET /auth/verify
 */
export const verifyToken = async (req, res) => {
    // If we reach here, the token is valid (passed through authenticateToken middleware)
    res.json({
        success: true,
        message: 'Token is valid',
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            subscription_tier: req.user.subscription_tier
        }
    });
};

// Import Sequelize operators
import { Op } from 'sequelize';

/**
 * Session-based user registration for web interface
 * POST /auth/register
 */
export const registerUser = async (req, res) => {
    try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('auth/register', {
                title: 'Registrati',
                error: errors.array()[0].msg
            });
        }        const { username, email, password, first_name, last_name } = req.body;

        // Check if user already exists
        const existingUser = await get(`
            SELECT id, username, email FROM users 
            WHERE username = ? OR email = ?
        `, [username, email]);

        if (existingUser) {
            const errorMsg = existingUser.username === username ? 
                'Username già utilizzato' : 'Email già registrata';
            return res.render('auth/register', {
                title: 'Registrati',
                error: errorMsg
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create new user
        const result = await runQuery(`
            INSERT INTO users (username, email, password_hash, first_name, last_name, is_active, email_verified)
            VALUES (?, ?, ?, ?, ?, 1, 1)
        `, [username, email, hashedPassword, first_name, last_name]);

        const user = {
            id: result.lastID,
            username,
            email,
            first_name,
            last_name,
            role: 'user'
        };        console.log(`✅ New user registered: ${username} (${email})`);

        // Associate guest portfolios to the new user
        await associateGuestDataToUser(req.sessionID, user.id);

        // Create session
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || 'user',
            first_name: user.first_name,
            last_name: user.last_name
        };

        // Redirect to main page
        res.redirect('/');

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.render('auth/register', {
            title: 'Registrati',
            error: 'Errore durante la registrazione. Riprova.'
        });
    }
};

/**
 * Session-based user login for web interface
 * POST /auth/login
 */
export const loginUser = async (req, res) => {
    try {
        // Check validation results
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('auth/login', {
                title: 'Accedi',
                error: errors.array()[0].msg
            });
        }        const { username, password } = req.body;
        
        console.log(`🔍 Login attempt - Username: ${username}`);

        // Find user by username or email
        const user = await get(`
            SELECT id, username, email, password_hash, first_name, last_name, role
            FROM users 
            WHERE (username = ? OR email = ?) AND is_active = 1
        `, [username, username]);

        console.log(`🔍 User query result:`, user ? `Found user: ${user.username}` : 'No user found');

        if (!user) {
            console.log(`❌ Login failed - User not found: ${username}`);
            return res.render('auth/login', {
                title: 'Accedi',
                error: 'Credenziali non valide'
            });
        }

        // Validate password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        console.log(`🔍 Password validation:`, isValidPassword ? 'Valid' : 'Invalid');
        
        if (!isValidPassword) {
            console.log(`❌ Login failed - Invalid password for user: ${username}`);
            return res.render('auth/login', {
                title: 'Accedi',
                error: 'Credenziali non valide'
            });
        }        console.log(`✅ User logged in: ${user.username}`);

        // Associate guest portfolios to the logged-in user
        await associateGuestDataToUser(req.sessionID, user.id);

        // Create session
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || 'user',
            first_name: user.first_name,
            last_name: user.last_name
        };

        // Redirect to main page
        res.redirect('/');

    } catch (error) {
        console.error('❌ Login error:', error);
        res.render('auth/login', {
            title: 'Accedi',
            error: 'Errore durante il login. Riprova.'
        });
    }
};

/**
 * Session-based user logout
 * POST /auth/logout
 */
export const logoutUser = (req, res) => {
    if (req.session) {
        const username = req.session.user?.username;
        req.session.destroy((err) => {
            if (err) {
                console.error('❌ Logout error:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Logout failed' 
                });
            }
            
            console.log(`✅ User logged out: ${username}`);
            res.redirect('/auth/login');
        });
    } else {
        res.redirect('/auth/login');
    }
};

/**
 * Get user profile
 */
export const getUserProfile = (req, res) => {
    res.render('auth/profile', {
        title: 'Profilo Utente',
        user: req.session.user
    });
};

/**
 * Update user profile
 */
export const updateUserProfile = async (req, res) => {
    try {
        // Implementation for profile updates
        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('❌ Profile update error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Profile update failed' 
        });
    }
};

/**
 * Associate guest portfolios and investments to the authenticated user
 * @param {string} sessionId - Session ID
 * @param {number} userId - User ID to associate portfolios with
 */
async function associateGuestDataToUser(sessionId, userId) {
    try {
        console.log(`🔄 Associating guest data from session ${sessionId} to user ${userId}`);

        // Find guest portfolios created in this session (portfolios without user_id)
        const guestPortfolios = await getAll(`
            SELECT id, name, description FROM portfolios 
            WHERE user_id IS NULL AND id > 1
        `);

        if (guestPortfolios.length === 0) {
            console.log('📂 No guest portfolios to associate');
            return;
        }

        // Associate each guest portfolio to the user
        for (const portfolio of guestPortfolios) {
            // Update portfolio to belong to user
            await runQuery(`
                UPDATE portfolios 
                SET user_id = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [userId, portfolio.id]);

            // Update all investments in this portfolio to belong to user
            await runQuery(`
                UPDATE investments 
                SET user_id = ?, last_updated = CURRENT_TIMESTAMP 
                WHERE portfolio_id = ?
            `, [userId, portfolio.id]);

            console.log(`✅ Associated portfolio "${portfolio.name}" (ID: ${portfolio.id}) to user ${userId}`);
        }

        // Update alerts if any
        await runQuery(`
            UPDATE alerts 
            SET user_id = ? 
            WHERE user_id IS NULL
        `, [userId]);

        console.log(`🎯 Successfully associated ${guestPortfolios.length} guest portfolio(s) to user ${userId}`);

    } catch (error) {
        console.error('❌ Error associating guest data to user:', error);
        // Don't throw - this shouldn't block login/registration
    }
}
