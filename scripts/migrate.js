/**
 * @fileoverview Migration Script from SQLite to PostgreSQL
 * Migrates existing single-user data to multi-user PostgreSQL structure
 * 
 * ⚠️  NOTE: Questo script è per migrazione FUTURA a PostgreSQL
 * 📊 Stato attuale: Sistema utilizza SQLite 
 * 🔄 Uso futuro: Quando si vorrà scalare a PostgreSQL
 * 
 * @deprecated Attualmente non utilizzato - sistema usa SQLite
 */

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { initializeDatabase, User, Portfolio, Investment, Alert, sequelize } from '../config/postgresql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite database path
const SQLITE_PATH = path.join(__dirname, '../data/portfolio.db');

/**
 * Migration configuration
 */
const MIGRATION_CONFIG = {
    defaultUser: {
        username: 'migrated_user',
        email: 'user@etfmanager.com',
        password: 'changeme123',
        first_name: 'Migrated',
        last_name: 'User',
        subscription_tier: 'premium'
    },
    batchSize: 100,
    logProgress: true
};

/**
 * Migration statistics tracking
 */
let migrationStats = {
    users: 0,
    portfolios: 0,
    investments: 0,
    alerts: 0,
    errors: 0,
    startTime: null,
    endTime: null
};

/**
 * Logger utility
 */
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = {
        info: '📝',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        progress: '⏳'
    };
    
    console.log(`${emoji[type]} [${timestamp}] ${message}`);
}

/**
 * Check if SQLite database exists
 */
function checkSQLiteDatabase() {
    if (!fs.existsSync(SQLITE_PATH)) {
        throw new Error(`SQLite database not found at: ${SQLITE_PATH}`);
    }
    
    const stats = fs.statSync(SQLITE_PATH);
    log(`SQLite database found (${(stats.size / 1024).toFixed(2)} KB)`);
    
    return true;
}

/**
 * Connect to SQLite database
 */
function connectSQLite() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(new Error(`Failed to connect to SQLite: ${err.message}`));
            } else {
                log('Connected to SQLite database');
                resolve(db);
            }
        });
    });
}

/**
 * Get SQLite table data
 */
function getSQLiteData(db, tableName) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
            if (err) {
                if (err.message.includes('no such table')) {
                    log(`Table ${tableName} does not exist, skipping`, 'warning');
                    resolve([]);
                } else {
                    reject(new Error(`Failed to read ${tableName}: ${err.message}`));
                }
            } else {
                log(`Retrieved ${rows.length} records from ${tableName}`);
                resolve(rows);
            }
        });
    });
}

/**
 * Create default user for migration
 */
async function createDefaultUser() {
    try {
        // Check if user already exists
        const existingUser = await User.findOne({
            where: {
                username: MIGRATION_CONFIG.defaultUser.username
            }
        });
        
        if (existingUser) {
            log('Default migration user already exists, using existing user');
            return existingUser;
        }
        
        // Create new user
        const user = await User.create(MIGRATION_CONFIG.defaultUser);
        log(`Created default user: ${user.username}`);
        migrationStats.users = 1;
        
        return user;
    } catch (error) {
        log(`Failed to create default user: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Migrate portfolios from SQLite
 */
async function migratePortfolios(sqliteDb, userId) {
    try {
        const sqlitePortfolios = await getSQLiteData(sqliteDb, 'portfolios');
        
        if (sqlitePortfolios.length === 0) {
            // Create default portfolio if none exist
            await Portfolio.create({
                user_id: userId,
                name: 'My Portfolio',
                description: 'Migrated portfolio',
                is_default: true
            });
            
            log('Created default portfolio (no existing portfolios found)');
            migrationStats.portfolios = 1;
            return;
        }
        
        const portfolioMapping = new Map();
        
        for (const sqlitePortfolio of sqlitePortfolios) {
            const pgPortfolio = await Portfolio.create({
                user_id: userId,
                name: sqlitePortfolio.name || 'Migrated Portfolio',
                description: sqlitePortfolio.description || 'Portfolio migrated from SQLite',
                is_default: sqlitePortfolio.is_default || false,
                created_at: sqlitePortfolio.created_at || new Date(),
                updated_at: sqlitePortfolio.updated_at || new Date()
            });
            
            portfolioMapping.set(sqlitePortfolio.id, pgPortfolio.id);
            migrationStats.portfolios++;
            
            if (MIGRATION_CONFIG.logProgress) {
                log(`Migrated portfolio: ${pgPortfolio.name} (${sqlitePortfolio.id} -> ${pgPortfolio.id})`, 'progress');
            }
        }
        
        log(`Successfully migrated ${sqlitePortfolios.length} portfolios`);
        return portfolioMapping;
    } catch (error) {
        log(`Portfolio migration failed: ${error.message}`, 'error');
        migrationStats.errors++;
        throw error;
    }
}

/**
 * Migrate investments from SQLite
 */
async function migrateInvestments(sqliteDb, userId, portfolioMapping) {
    try {
        const sqliteInvestments = await getSQLiteData(sqliteDb, 'investments');
        
        if (sqliteInvestments.length === 0) {
            log('No investments to migrate');
            return;
        }
        
        // Get default portfolio if no mapping exists
        let defaultPortfolioId = null;
        if (portfolioMapping.size === 0) {
            const defaultPortfolio = await Portfolio.findOne({
                where: { user_id: userId, is_default: true }
            });
            defaultPortfolioId = defaultPortfolio?.id;
        }
        
        let migratedCount = 0;
        const batchSize = MIGRATION_CONFIG.batchSize;
        
        for (let i = 0; i < sqliteInvestments.length; i += batchSize) {
            const batch = sqliteInvestments.slice(i, i + batchSize);
            const investmentPromises = batch.map(async (sqliteInvestment) => {
                try {
                    // Map portfolio ID or use default
                    let portfolioId = portfolioMapping.get(sqliteInvestment.portfolio_id) || defaultPortfolioId;
                    
                    if (!portfolioId) {
                        // Create a default portfolio if none exists
                        const newPortfolio = await Portfolio.create({
                            user_id: userId,
                            name: 'Default Portfolio',
                            description: 'Auto-created during migration',
                            is_default: true
                        });
                        portfolioId = newPortfolio.id;
                        defaultPortfolioId = portfolioId;
                    }
                    
                    const pgInvestment = await Investment.create({
                        user_id: userId,
                        portfolio_id: portfolioId,
                        ticker: sqliteInvestment.ticker?.toUpperCase() || 'UNKNOWN',
                        shares: parseFloat(sqliteInvestment.shares) || 0,
                        buy_price: parseFloat(sqliteInvestment.buy_price) || 0,
                        buy_date: sqliteInvestment.buy_date || new Date().toISOString().split('T')[0],
                        notes: sqliteInvestment.notes || null,
                        created_at: sqliteInvestment.created_at || new Date(),
                        updated_at: sqliteInvestment.updated_at || new Date()
                    });
                    
                    migratedCount++;
                    
                    if (MIGRATION_CONFIG.logProgress && migratedCount % 10 === 0) {
                        log(`Migrated ${migratedCount}/${sqliteInvestments.length} investments`, 'progress');
                    }
                    
                    return pgInvestment;
                } catch (error) {
                    log(`Failed to migrate investment ${sqliteInvestment.id}: ${error.message}`, 'warning');
                    migrationStats.errors++;
                    return null;
                }
            });
            
            await Promise.all(investmentPromises);
        }
        
        migrationStats.investments = migratedCount;
        log(`Successfully migrated ${migratedCount} investments`);
    } catch (error) {
        log(`Investment migration failed: ${error.message}`, 'error');
        migrationStats.errors++;
        throw error;
    }
}

/**
 * Migrate alerts from SQLite
 */
async function migrateAlerts(sqliteDb, userId) {
    try {
        const sqliteAlerts = await getSQLiteData(sqliteDb, 'alerts');
        
        if (sqliteAlerts.length === 0) {
            log('No alerts to migrate');
            return;
        }
        
        let migratedCount = 0;
        
        for (const sqliteAlert of sqliteAlerts) {
            try {
                await Alert.create({
                    user_id: userId,
                    ticker: sqliteAlert.ticker?.toUpperCase() || 'UNKNOWN',
                    alert_type: sqliteAlert.alert_type || 'price_above',
                    target_price: parseFloat(sqliteAlert.target_price) || null,
                    percentage_change: parseFloat(sqliteAlert.percentage_change) || null,
                    condition_type: sqliteAlert.condition_type || 'above',
                    is_active: sqliteAlert.is_active !== undefined ? sqliteAlert.is_active : true,
                    notification_method: 'browser',
                    created_at: sqliteAlert.created_at || new Date(),
                    updated_at: sqliteAlert.updated_at || new Date()
                });
                
                migratedCount++;
                
                if (MIGRATION_CONFIG.logProgress) {
                    log(`Migrated alert: ${sqliteAlert.ticker} (${sqliteAlert.alert_type})`, 'progress');
                }
            } catch (error) {
                log(`Failed to migrate alert ${sqliteAlert.id}: ${error.message}`, 'warning');
                migrationStats.errors++;
            }
        }
        
        migrationStats.alerts = migratedCount;
        log(`Successfully migrated ${migratedCount} alerts`);
    } catch (error) {
        log(`Alert migration failed: ${error.message}`, 'error');
        migrationStats.errors++;
        throw error;
    }
}

/**
 * Create backup of SQLite database
 */
function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(__dirname, `../backups/sqlite_backup_${timestamp}.db`);
        
        // Ensure backup directory exists
        const backupDir = path.dirname(backupPath);
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        // Copy SQLite database
        fs.copyFileSync(SQLITE_PATH, backupPath);
        log(`SQLite backup created: ${backupPath}`);
        
        return backupPath;
    } catch (error) {
        log(`Backup creation failed: ${error.message}`, 'warning');
        return null;
    }
}

/**
 * Generate migration report
 */
function generateReport() {
    const duration = migrationStats.endTime - migrationStats.startTime;
    const durationMinutes = (duration / 1000 / 60).toFixed(2);
    
    const report = `
🚀 MIGRATION COMPLETED SUCCESSFULLY

📊 Migration Statistics:
   ✅ Users:       ${migrationStats.users}
   ✅ Portfolios:  ${migrationStats.portfolios}
   ✅ Investments: ${migrationStats.investments}
   ✅ Alerts:      ${migrationStats.alerts}
   ❌ Errors:      ${migrationStats.errors}

⏱️ Duration: ${durationMinutes} minutes
📅 Completed: ${new Date().toISOString()}

🎯 Next Steps:
   1. Verify data integrity in PostgreSQL
   2. Test application functionality
   3. Update environment configuration
   4. Remove SQLite database (after verification)

💡 Default User Credentials:
   Username: ${MIGRATION_CONFIG.defaultUser.username}
   Email:    ${MIGRATION_CONFIG.defaultUser.email}
   Password: ${MIGRATION_CONFIG.defaultUser.password}
   
⚠️  IMPORTANT: Change the default password after migration!
`;
    
    console.log(report);
    
    // Save report to file
    const reportPath = path.join(__dirname, '../migration-report.txt');
    fs.writeFileSync(reportPath, report);
    log(`Migration report saved: ${reportPath}`);
}

/**
 * Main migration function
 */
async function runMigration() {
    migrationStats.startTime = Date.now();
    
    try {
        log('🚀 Starting SQLite to PostgreSQL migration');
        
        // Step 1: Verify SQLite database exists
        checkSQLiteDatabase();
        
        // Step 2: Create backup
        createBackup();
        
        // Step 3: Initialize PostgreSQL database
        log('Initializing PostgreSQL database...');
        await initializeDatabase();
        
        // Step 4: Connect to SQLite
        const sqliteDb = await connectSQLite();
        
        // Step 5: Create default user
        const user = await createDefaultUser();
        
        // Step 6: Migrate portfolios
        log('Migrating portfolios...');
        const portfolioMapping = await migratePortfolios(sqliteDb, user.id);
        
        // Step 7: Migrate investments
        log('Migrating investments...');
        await migrateInvestments(sqliteDb, user.id, portfolioMapping);
        
        // Step 8: Migrate alerts
        log('Migrating alerts...');
        await migrateAlerts(sqliteDb, user.id);
        
        // Step 9: Close SQLite connection
        sqliteDb.close();
        log('SQLite connection closed');
        
        migrationStats.endTime = Date.now();
        
        // Step 10: Generate report
        generateReport();
        
        log('✅ Migration completed successfully!', 'success');
        process.exit(0);
        
    } catch (error) {
        migrationStats.endTime = Date.now();
        log(`❌ Migration failed: ${error.message}`, 'error');
        console.error(error);
        process.exit(1);
    }
}

/**
 * Command line interface
 */
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🔄 SQLite to PostgreSQL Migration Tool

Usage:
  node scripts/migrate.js [options]

Options:
  --help, -h     Show this help message
  --dry-run      Simulate migration without making changes
  --force        Skip confirmation prompts
  --verbose      Enable detailed logging

Examples:
  node scripts/migrate.js
  node scripts/migrate.js --dry-run
  node scripts/migrate.js --force --verbose
`);
    process.exit(0);
}

// Confirmation prompt (unless --force is used)
if (!process.argv.includes('--force')) {
    console.log(`
⚠️  MIGRATION CONFIRMATION

This will migrate data from SQLite to PostgreSQL:
  • Source: ${SQLITE_PATH}
  • Target: PostgreSQL database
  • Action: Copy all data to new multi-user structure

📋 Pre-migration checklist:
  ✅ PostgreSQL database is running
  ✅ Environment variables are configured
  ✅ Backup of current data exists
  
Continue? (y/N): `);
    
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (text) => {
        if (text.trim().toLowerCase() === 'y' || text.trim().toLowerCase() === 'yes') {
            process.stdin.pause();
            runMigration();
        } else {
            console.log('Migration cancelled');
            process.exit(0);
        }
    });
} else {
    // Force mode - run immediately
    runMigration();
}

// Enable verbose logging if requested
if (process.argv.includes('--verbose')) {
    MIGRATION_CONFIG.logProgress = true;
}

// Dry run mode (future implementation)
if (process.argv.includes('--dry-run')) {
    console.log('🧪 DRY RUN MODE - No changes will be made');
    // TODO: Implement dry run logic
}
