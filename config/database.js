import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initIsinTable } from "../utils/priceUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '../data/portfolio.db');

// Pool di connessioni per ottimizzare le prestazioni
let _db = null;
let isInitializing = false;
let initPromise = null;

// Configurazione SQLite per prestazioni migliori
const SQLITE_CONFIG = {
    busyTimeout: 10000,         // 10 secondi di timeout per query in conflitto
    journalMode: 'WAL',         // Write-Ahead Logging per migliorare concorrenza
    synchronous: 'NORMAL',      // Bilancia sicurezza e prestazioni
    caseSensitiveLike: false    // Per ricerche case-insensitive più efficienti
};

// Assicura che la directory per il database esista
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) return true;
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

// Configura il database con parametri ottimali
function configureDatabase(db) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Imposta timeout per query che trovano il database occupato
            // Set busy timeout without parameter binding (parameters not supported in PRAGMA)
            db.run(`PRAGMA busy_timeout = ${SQLITE_CONFIG.busyTimeout}`);

            // Imposta modalità journal per concorrenza
            db.run(`PRAGMA journal_mode = ${SQLITE_CONFIG.journalMode}`, [], function(err) {
                if (err) console.warn('Errore impostazione journal_mode:', err.message);
            });

            // Imposta livello di sincronizzazione
            db.run(`PRAGMA synchronous = ${SQLITE_CONFIG.synchronous}`, [], function(err) {
                if (err) console.warn('Errore impostazione synchronous:', err.message);
            });

            // Imposta modalità case sensitive per LIKE
            db.run(`PRAGMA case_sensitive_like = ${SQLITE_CONFIG.caseSensitiveLike ? 1 : 0}`, [], function(err) {
                if (err) console.warn('Errore impostazione case_sensitive_like:', err.message);
                resolve();
            });
        });
    });
}

// Gestisce la connessione al database come singleton con configurazione ottimizzata
export function getDb() {
    if (!_db) {
        console.log('Creazione nuova connessione al database');
        ensureDirectoryExistence(DB_PATH);

        _db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error(`Errore connessione database: ${err.message}`);
                _db = null;
                throw err;
            }
            console.log('Connessione al database stabilita');

            // Configura database in background
            configureDatabase(_db).catch(err => {
                console.error('Errore configurazione database:', err);
            });
        });
    }
    return _db;
}

// Funzione helper per esecuzione sicura di query con gestione ottimizzata degli errori
function safeExecute(operation) {
    return function(sql, params = []) {
        return new Promise((resolve, reject) => {
            try {
                const db = getDb();
                const startTime = Date.now(); // Per tracciare performance

                db[operation](sql, params, function(err, result) {
                    const queryTime = Date.now() - startTime;

                    // Log per query lente (utile per debug)
                    if (queryTime > 500) { // 500ms threshold
                        console.warn(`Query lenta (${queryTime}ms): ${sql.substring(0, 100)}...`);
                    }

                    if (err) {
                        if (err.code === 'SQLITE_MISUSE' || err.code === 'SQLITE_BUSY') {
                            console.warn(`Errore database ${err.code}, riprovo...`);
                            // Rigenera connessione e riprova
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
                console.error('Errore esecuzione query:', error);
                reject(error);
            }
        });
    };
}

// Inizializza il database con una sola istanza alla volta (pattern singleton)
export async function initDb() {
    // Se è già in corso un'inizializzazione, ritorna quella promessa
    if (isInitializing) {
        return initPromise;
    }

    // Imposta il flag e crea una nuova promessa di inizializzazione
    isInitializing = true;
    initPromise = new Promise(async (resolve, reject) => {
        try {
            ensureDirectoryExistence(DB_PATH);

            const dbExists = fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 0;
            const db = getDb();

            if (!dbExists) {
                console.log('Creazione schema database...');

                await new Promise((resolveSchema, rejectSchema) => {
                    db.serialize(() => {
                        // Tabella portfolios
                        db.run(`CREATE TABLE IF NOT EXISTS portfolios (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            description TEXT,
                            created_at TEXT DEFAULT CURRENT_TIMESTAMP
                        )`, (err) => {
                            if (err) rejectSchema(err);
                        });

                        // Portfolio predefinito
                        db.run(`INSERT INTO portfolios (name, description) VALUES (?, ?)`,
                            ['Portfolio Principale', 'Il mio portfolio ETF principale'],
                            (err) => {
                                if (err) rejectSchema(err);
                            });

                        // Tabella investments con indici ottimizzati
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
                                // Crea indici per ottimizzare le query frequenti
                                db.run('CREATE INDEX IF NOT EXISTS idx_investments_ticker ON investments(ticker)', (err) => {
                                    if (err) console.warn('Errore creazione indice ticker:', err);
                                });
                                db.run('CREATE INDEX IF NOT EXISTS idx_investments_portfolio ON investments(portfolio_id)', (err) => {
                                    if (err) console.warn('Errore creazione indice portfolio_id:', err);
                                    else resolveSchema();
                                });
                            }
                        });
                    });
                });

                console.log('Database creato con successo!');
            }

            // Verifica connessione valida
            await new Promise((resolve, reject) => {
                db.get('SELECT 1', (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });

            // Inizializza tabella ISIN
            await initIsinTable();

            // Inizializzazione completata
            isInitializing = false;
            resolve(true);
        } catch (error) {
            console.error(`Errore inizializzazione database: ${error.message}`);
            isInitializing = false;
            reject(error);
        }
    });

    return initPromise;
}

// Funzioni helper per query ottimizzate
export const runQuery = safeExecute('run');
export const getAll = safeExecute('all');
export const get = safeExecute('get');

// Funzione per eseguire query multiple in una singola transazione
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

// Chiusura del database - solo quando l'app termina
export function closeDb() {
    return new Promise((resolve, reject) => {
        if (_db) {
            _db.close(err => {
                if (err) reject(err);
                else {
                    _db = null;
                    console.log('Connessione al database chiusa');
                    resolve();
                }
            });
        } else {
            resolve();
        }
    });
}

// Gestione chiusura applicazione
process.on('SIGINT', async () => {
    console.log('Chiusura applicazione, disconnessione database...');
    try {
        await closeDb();
        process.exit(0);
    } catch (err) {
        console.error('Errore chiusura database:', err);
        process.exit(1);
    }
});

// Diagnosi e ottimizzazione
export async function optimizeDatabase() {
    const db = getDb();

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            console.log('Avvio ottimizzazione database...');

            // Analisi del database
            db.run('ANALYZE', err => {
                if (err) console.warn('Errore durante ANALYZE:', err);
            });

            // Ottimizzazione
            db.run('VACUUM', err => {
                if (err) {
                    console.error('Errore durante VACUUM:', err);
                    reject(err);
                } else {
                    console.log('Database ottimizzato con successo');
                    resolve();
                }
            });
        });
    });
}
