/**
 * @fileoverview Authentication Middleware for Multi-User ETF Manager
 * Handles session-based authentication and authorization
 */

/**
 * Session-based authentication middleware for web routes
 */
export const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    
    // For API requests, return JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
        });
    }
    
    // For web requests, redirect to login
    return res.redirect('/auth/login');
};

/**
 * Guest middleware - only allow non-authenticated users
 */
export const requireGuest = (req, res, next) => {
    if (req.session && req.session.user) {
        return res.redirect('/');
    }
    next();
};

/**
 * Admin authorization middleware
 */
export const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login');
    }
    
    if (req.session.user.role !== 'admin') {
        return res.status(403).render('error', {
            title: 'Accesso Negato',
            message: 'Non hai i permessi per accedere a questa pagina',
            error: { status: 403 }
        });
    }
    
    next();
};

/**
 * Set user data in response locals for templates
 */
export const setUserLocals = (req, res, next) => {
    res.locals.user = req.session?.user || null;
    res.locals.isAuthenticated = !!(req.session?.user);
    next();
};
