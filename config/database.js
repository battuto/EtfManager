/**
 * @fileoverview Database Configuration Module
 * Manages SQLite database connections, initialization, and optimization
 * with performance tuning, error handling, and transaction support
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initIsinTable } from "../utils/priceUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '../data/portfolio.db');

// Connection pool for performance optimization
let _db = null;
let isInitializing = false;
let initPromise = null;

// SQLite configuration for better performance
const SQLITE_CONFIG = {
    busyTimeout: 10000,         // 10 seconds timeout for conflicting queries
    journalMode: 'WAL',         // Write-Ahead Logging for improved concurrency
    synchronous: 'NORMAL',      // Balance safety and performance
    caseSensitiveLike: false    // For more efficient case-insensitive searches
};

/**
 * Ensure database directory exists
 * @param {string} filePath - File path to check
 */
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) return true;
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

/**
 * Configure database with optimal parameters
 * @param {Object} db - SQLite database instance
 * @returns {Promise<void>}
 */
function configureDatabase(db) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Set busy timeout for queries that find database busy
            db.run(`PRAGMA busy_timeout = ${SQLITE_CONFIG.busyTimeout}`);

            // Set journal mode for concurrency
            db.run(`PRAGMA journal_mode = ${SQLITE_CONFIG.journalMode}`, [], function(err) {
                if (err) console.warn('⚠️ Error setting journal_mode:', err.message);
            });

            // Set synchronization level
            db.run(`PRAGMA synchronous = ${SQLITE_CONFIG.synchronous}`, [], function(err) {
                if (err) console.warn('⚠️ Error setting synchronous:', err.message);
            });

            // Set case sensitive mode for LIKE
            db.run(`PRAGMA case_sensitive_like = ${SQLITE_CONFIG.caseSensitiveLike ? 1 : 0}`, [], function(err) {
                if (err) console.warn('⚠️ Error setting case_sensitive_like:', err.message);
                resolve();
            });
        });
    });
}

/**
 * Get database instance as singleton with optimized configuration
 * @returns {Object} SQLite database instance
 */
export function getDb() {
    if (!_db) {
        console.log('🔗 Creating new database connection');
        ensureDirectoryExistence(DB_PATH);

        _db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error(`❌ Database connection error: ${err.message}`);
                _db = null;
                throw err;
            }
            console.log('✅ Database connection established');

            // Configure database in background
            configureDatabase(_db).catch(err => {
                console.error('❌ Database configuration error:', err);
            });
        });
    }
    return _db;
}

/**
 * Helper function for safe query execution with optimized error handling
 * @param {string} operation - SQLite operation (run, get, all)
 * @returns {Function} Query execution function
 */
function safeExecute(operation) {
    return function(sql, params = []) {
        return new Promise((resolve, reject) => {
            try {
                const db = getDb();
                const startTime = Date.now(); // For performance tracking

                db[operation](sql, params, function(err, result) {
                    const queryTime = Date.now() - startTime;

                    // Log slow queries (useful for debugging)
                    if (queryTime > 500) { // 500ms threshold
                        console.warn(`🐌 Slow query (${queryTime}ms): ${sql.substring(0, 100)}...`);
                    }

                    if (err) {
                        if (err.code === 'SQLITE_MISUSE' || err.code === 'SQLITE_BUSY') {
                            console.warn(`⚠️ Database error ${err.code}, retrying...`);
                            // Regenerate connection and retry
                            _db = null;
                            const newDb = getDb();
                            newDb[operation](sql, params, function(retryErr, retryResult) {
                                if (retryErr) {
                                    reject(retryErr);
                                } else if (operation === 'run') {
                                    resolve({ lastID: this.lastID, changes: this.changes });
                                } else {
                                    resolve(retryResult);
                                }
                            });
                        } else {
                            reject(err);
                        }
                    } else if (operation === 'run') {
                        resolve({ lastID: this.lastID, changes: this.changes });
                    } else {
                        resolve(result);
                    }
                });
            } catch (error) {
                console.error('❌ Query execution error:', error);
                reject(error);
            }
        });
    };
}

/**
 * Initialize database with singleton pattern
 * @returns {Promise<boolean>} Success status
 */
export async function initDb() {
    // If initialization is already in progress, return that promise
    if (isInitializing) {
        return initPromise;
    }

    // Set flag and create new initialization promise
    isInitializing = true;
    initPromise = new Promise(async (resolve, reject) => {
        try {
            ensureDirectoryExistence(DB_PATH);

            const dbExists = fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 0;
            const db = getDb();

            if (!dbExists) {
                console.log('📊 Creating database schema...');

                await new Promise((resolveSchema, rejectSchema) => {
                    db.serialize(() => {
                        // Portfolios table
                        db.run(`CREATE TABLE IF NOT EXISTS portfolios (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            description TEXT,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )`, (err) => {
                            if (err) rejectSchema(err);
                        });

                        // Default portfolio
                        db.run(`INSERT INTO portfolios (name, description) VALUES (?, ?)`,
                            ['Main Portfolio', 'My main ETF portfolio'],
                            (err) => {
                                if (err) rejectSchema(err);
                            });

                        // Investments table with optimized indexes
                        db.run(`CREATE TABLE IF NOT EXISTS investments (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            portfolio_id INTEGER NOT NULL DEFAULT 1,
                            ticker TEXT NOT NULL,
                            shares REAL NOT NULL,
                            buy_price REAL NOT NULL,
                            buy_date TEXT NOT NULL,
                            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
                        )`, (err) => {
                            if (err) rejectSchema(err);
                            else {
                                // Create indexes to optimize frequent queries
                                db.run('CREATE INDEX IF NOT EXISTS idx_investments_ticker ON investments(ticker)', (err) => {
                                    if (err) console.warn('⚠️ Error creating ticker index:', err);
                                });
                                db.run('CREATE INDEX IF NOT EXISTS idx_investments_portfolio ON investments(portfolio_id)', (err) => {
                                    if (err) console.warn('⚠️ Error creating portfolio_id index:', err);
                                    else resolveSchema();
                                });
                            }
                        });
                    });
                });

                console.log('✅ Database created successfully!');
            }

            // Verify valid connection
            await new Promise((resolve, reject) => {
                db.get('SELECT 1', (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            // Initialize ISIN table
            await initIsinTable();

            // Initialization completed
            isInitializing = false;
            resolve(true);
        } catch (error) {
            console.error(`❌ Database initialization error: ${error.message}`);
            isInitializing = false;
            reject(error);
        }
    });

    return initPromise;
}

// Optimized query helper functions
export const runQuery = safeExecute('run');
export const getAll = safeExecute('all');
export const get = safeExecute('get');

/**
 * Execute multiple queries in a single transaction
 * @param {Array} queries - Array of query objects with sql and params
 * @returns {Promise<Array>} Array of results
 */
export async function runTransaction(queries) {
    const db = getDb();

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            let results = [];
            let hasError = false;

            queries.forEach(query => {
                if (hasError) return;

                db.run(query.sql, query.params || [], function(err) {
                    if (err) {
                        hasError = true;
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    results.push({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                });
            });

            if (!hasError) {
                db.run('COMMIT', err => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                    } else {
                        resolve(results);
                    }
                });
            }
        });
    });
}

/**
 * Close database connection - only when app terminates
 * @returns {Promise<void>}
 */
export function closeDb() {
    return new Promise((resolve, reject) => {
        if (_db) {
            _db.close(err => {
                if (err) reject(err);
                else {
                    _db = null;
                    console.log('🔌 Database connection closed');
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

// Handle application shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Application shutdown, disconnecting database...');
    try {
        await closeDb();
        process.exit(0);
    } catch (err) {
        console.error('❌ Database closure error:', err);
        process.exit(1);
    }
});

/**
 * Database diagnostics and optimization
 * @returns {Promise<void>}
 */
export async function optimizeDatabase() {
    const db = getDb();

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            console.log('⚡ Starting database optimization...');

            // Database analysis
            db.run('ANALYZE', err => {
                if (err) console.warn('⚠️ Error during ANALYZE:', err);
            });

            // Optimization
            db.run('VACUUM', err => {
                if (err) {
                    console.error('❌ Error during VACUUM:', err);
                    reject(err);
                } else {
                    console.log('✅ Database optimized successfully');
                    resolve();
                }
            });
        });
    });
}
