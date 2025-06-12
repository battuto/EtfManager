/**
 * @fileoverview Admin Controller for User Management
 * Handles admin dashboard functionality and user management
 */

import { User, Portfolio, Investment, Alert, UserSession } from '../../config/postgresql.js';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';

/**
 * Admin Dashboard - Overview
 */
export const getDashboard = async (req, res) => {
    try {
        // Get system statistics
        const [
            totalUsers,
            activeUsers,
            totalPortfolios,
            totalInvestments,
            recentUsers
        ] = await Promise.all([
            User.count(),
            User.count({
                where: {
                    last_login: {
                        [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                    }
                }
            }),
            Portfolio.count(),
            Investment.count(),
            User.findAll({
                limit: 10,
                order: [['created_at', 'DESC']],
                attributes: ['id', 'username', 'email', 'first_name', 'last_name', 'created_at', 'subscription_tier']
            })
        ]);

        // Get subscription tier distribution
        const subscriptionStats = await User.findAll({
            attributes: [
                'subscription_tier',
                [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']
            ],
            group: ['subscription_tier']
        });

        const stats = {
            totalUsers,
            activeUsers,
            totalPortfolios,
            totalInvestments,
            subscriptionStats: subscriptionStats.reduce((acc, stat) => {
                acc[stat.subscription_tier] = parseInt(stat.dataValues.count);
                return acc;
            }, {}),
            recentUsers
        };

        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            stats,
            user: req.user
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).render('error', {
            message: 'Failed to load admin dashboard',
            error: error
        });
    }
};

/**
 * User Management - List Users
 */
export const getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const tier = req.query.tier || '';
        const status = req.query.status || '';

        const offset = (page - 1) * limit;

        // Build where clause
        const whereClause = {};
        
        if (search) {
            whereClause[Op.or] = [
                { username: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } },
                { first_name: { [Op.iLike]: `%${search}%` } },
                { last_name: { [Op.iLike]: `%${search}%` } }
            ];
        }

        if (tier) {
            whereClause.subscription_tier = tier;
        }

        if (status === 'active') {
            whereClause.last_login = {
                [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            };
        } else if (status === 'inactive') {
            whereClause[Op.or] = [
                { last_login: { [Op.lt]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
                { last_login: null }
            ];
        }

        const { rows: users, count: totalUsers } = await User.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [['created_at', 'DESC']],
            attributes: { exclude: ['password_hash'] },
            include: [
                {
                    model: Portfolio,
                    attributes: ['id'],
                    required: false
                },
                {
                    model: Investment,
                    attributes: ['id'],
                    required: false
                }
            ]
        });

        const totalPages = Math.ceil(totalUsers / limit);

        res.render('admin/users', {
            title: 'User Management',
            users,
            pagination: {
                page,
                totalPages,
                totalUsers,
                hasNext: page < totalPages,
                hasPrev: page > 1
            },
            filters: { search, tier, status },
            user: req.user
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).render('error', {
            message: 'Failed to load users',
            error: error
        });
    }
};

/**
 * User Details
 */
export const getUserDetails = async (req, res) => {
    try {
        const userId = req.params.id;

        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password_hash'] },
            include: [
                {
                    model: Portfolio,
                    include: [
                        {
                            model: Investment,
                            attributes: ['id', 'ticker', 'shares', 'buy_price', 'buy_date']
                        }
                    ]
                },
                {
                    model: Alert,
                    attributes: ['id', 'ticker', 'alert_type', 'target_price', 'is_active']
                },
                {
                    model: UserSession,
                    attributes: ['id', 'device_info', 'ip_address', 'last_activity'],
                    where: { expires_at: { [Op.gt]: new Date() } },
                    required: false
                }
            ]
        });

        if (!user) {
            return res.status(404).render('error', {
                message: 'User not found'
            });
        }

        // Calculate portfolio value (simplified)
        const portfolioValue = user.Portfolios.reduce((total, portfolio) => {
            return total + portfolio.Investments.reduce((portfolioTotal, investment) => {
                return portfolioTotal + (investment.shares * investment.buy_price);
            }, 0);
        }, 0);

        res.render('admin/user-details', {
            title: `User: ${user.username}`,
            userDetails: user,
            portfolioValue,
            user: req.user
        });
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).render('error', {
            message: 'Failed to load user details',
            error: error
        });
    }
};

/**
 * Create User
 */
export const createUser = async (req, res) => {
    if (req.method === 'GET') {
        return res.render('admin/create-user', {
            title: 'Create User',
            user: req.user
        });
    }

    try {
        const {
            username,
            email,
            password,
            first_name,
            last_name,
            subscription_tier
        } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).render('admin/create-user', {
                title: 'Create User',
                error: 'Username, email, and password are required',
                user: req.user,
                formData: req.body
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [
                    { username },
                    { email }
                ]
            }
        });

        if (existingUser) {
            return res.status(400).render('admin/create-user', {
                title: 'Create User',
                error: 'Username or email already exists',
                user: req.user,
                formData: req.body
            });
        }

        // Create user
        const newUser = await User.create({
            username,
            email,
            password_hash: await bcrypt.hash(password, 12),
            first_name: first_name || null,
            last_name: last_name || null,
            subscription_tier: subscription_tier || 'free',
            email_verified: true // Admin created users are auto-verified
        });

        // Create default portfolio
        await Portfolio.create({
            user_id: newUser.id,
            name: 'My Portfolio',
            description: 'Default portfolio',
            is_default: true
        });

        res.redirect('/admin/users?success=User created successfully');
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).render('admin/create-user', {
            title: 'Create User',
            error: 'Failed to create user',
            user: req.user,
            formData: req.body
        });
    }
};

/**
 * Update User
 */
export const updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const {
            username,
            email,
            first_name,
            last_name,
            subscription_tier,
            is_active
        } = req.body;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check for conflicts if changing username/email
        if (username !== user.username || email !== user.email) {
            const existingUser = await User.findOne({
                where: {
                    [Op.and]: [
                        { id: { [Op.ne]: userId } },
                        {
                            [Op.or]: [
                                { username },
                                { email }
                            ]
                        }
                    ]
                }
            });

            if (existingUser) {
                return res.status(400).json({ error: 'Username or email already exists' });
            }
        }

        // Update user
        await user.update({
            username,
            email,
            first_name,
            last_name,
            subscription_tier,
            is_active: is_active === 'true'
        });

        res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
};

/**
 * Delete User
 */
export const deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent self-deletion
        if (userId === req.user.id.toString()) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete user and cascade related data
        await user.destroy();

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

/**
 * System Logs
 */
export const getSystemLogs = async (req, res) => {
    try {
        // Get recent login attempts
        const recentLogins = await UserSession.findAll({
            limit: 50,
            order: [['created_at', 'DESC']],
            include: [
                {
                    model: User,
                    attributes: ['username', 'email']
                }
            ]
        });

        res.render('admin/system-logs', {
            title: 'System Logs',
            recentLogins,
            user: req.user
        });
    } catch (error) {
        console.error('Get system logs error:', error);
        res.status(500).render('error', {
            message: 'Failed to load system logs',
            error: error
        });
    }
};

/**
 * System Settings
 */
export const getSystemSettings = async (req, res) => {
    try {
        // In a real implementation, these would come from a settings table
        const settings = {
            registration_enabled: true,
            email_verification_required: false,
            max_portfolios_per_user: 10,
            max_investments_per_portfolio: 100,
            rate_limit_enabled: true,
            maintenance_mode: false
        };

        res.render('admin/system-settings', {
            title: 'System Settings',
            settings,
            user: req.user
        });
    } catch (error) {
        console.error('Get system settings error:', error);
        res.status(500).render('error', {
            message: 'Failed to load system settings',
            error: error
        });
    }
};
