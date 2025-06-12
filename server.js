import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import indexRoutes from './routes/index.js';
import adminRoutes from './routes/admin/adminRoutes.js';
import authRoutes from './routes/auth.js';
import { initDb, getDb } from './config/database.js';
import { initAlertsTable } from './models/alert.js';
import { setUserLocals } from './middleware/auth.js';
import { initDemoUsers } from './scripts/initUsersSQLite.js';
import expressLayouts from 'express-ejs-layouts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(morgan('combined'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'etf-portfolio-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// User locals middleware (makes user available in all views)
app.use(setUserLocals);

app.use(expressLayouts);

// Configure view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

// Database connection middleware
app.use((req, res, next) => {
    try {
        getDb();
        next();
    } catch (err) {
        console.error('Database connection error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'Database connection failed' 
        });
    }
});

// Routes
app.use('/auth', authRoutes);
app.use('/', indexRoutes);
app.use('/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '2.0.0'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ 
        success: false, 
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
    });
});

// Initialize application
async function initializeApp() {
    try {
        console.log('🚀 Initializing ETF Portfolio Manager...');
        
        // Verify database connection
        const db = getDb();
        await new Promise((resolve, reject) => {
            db.get('SELECT 1', (err) => err ? reject(err) : resolve());
        });
        console.log('✅ Database connection verified');
        
        // Initialize database tables
        await initDb();
        console.log('✅ Database tables initialized');        // Initialize alerts system
        await initAlertsTable();
        console.log('✅ Alerts system initialized');
        
        // Initialize demo users
        await initDemoUsers();
        console.log('✅ Demo users initialized');
        
        // Start server with port fallback
        startServerWithFallback(PORT);
        
    } catch (err) {
        console.error('❌ Initialization failed:', err);
        process.exit(1);
    }
}

function startServerWithFallback(port) {
    const server = app.listen(port, () => {
        console.log(`🌟 ETF Portfolio Manager running at http://localhost:${port}`);
        console.log(`📊 Analytics engine ready for advanced portfolio analysis`);
    });
    
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Port ${port} in use, trying ${port + 1}`);
            startServerWithFallback(port + 1);
        } else {
            console.error('❌ Server error:', err);
            throw err;
        }
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down ETF Portfolio Manager...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down ETF Portfolio Manager...');
    process.exit(0);
});

// Start the application
initializeApp();