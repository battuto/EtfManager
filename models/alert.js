import { getDb, getAll, get, runQuery } from '../config/database.js';

/**
 * Inizializza la tabella degli alert
 */
export async function initAlertsTable() {
    const db = getDb();
    
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id INTEGER NOT NULL,
                ticker TEXT,
                alert_type TEXT NOT NULL,
                condition_type TEXT NOT NULL,
                threshold_value REAL NOT NULL,
                message TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_triggered DATETIME,
                FOREIGN KEY (portfolio_id) REFERENCES portfolios (id)
            )
        `, (err) => {
            if (err) {
                console.error('Errore nella creazione della tabella alerts:', err);
                reject(err);
            } else {
                console.log('Tabella alerts inizializzata');
                resolve();
            }
        });
    });
}

/**
 * Tipi di alert disponibili
 */
export const ALERT_TYPES = {
    PRICE_TARGET: 'price_target',          // Prezzo target ETF
    PERFORMANCE: 'performance',            // Performance portfolio/ETF
    PORTFOLIO_VALUE: 'portfolio_value',    // Valore totale portfolio
    REBALANCE: 'rebalance'                 // Promemoria ribalancio
};

export const CONDITION_TYPES = {
    ABOVE: 'above',                        // Sopra
    BELOW: 'below',                        // Sotto
    CHANGE_PERCENT: 'change_percent'       // Variazione percentuale
};

/**
 * Crea un nuovo alert
 */
export async function createAlert(alert) {
    const { portfolio_id, ticker, alert_type, condition_type, threshold_value, message } = alert;
    
    return runQuery(`
        INSERT INTO alerts (portfolio_id, ticker, alert_type, condition_type, threshold_value, message)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [portfolio_id, ticker, alert_type, condition_type, threshold_value, message]);
}

/**
 * Ottiene tutti gli alert per un portfolio
 */
export async function getAlertsByPortfolio(portfolioId) {
    return getAll(`
        SELECT * FROM alerts 
        WHERE portfolio_id = ? AND is_active = 1 
        ORDER BY created_at DESC
    `, [portfolioId]);
}

/**
 * Ottiene tutti gli alert attivi
 */
export async function getActiveAlerts() {
    return getAll(`
        SELECT a.*, p.name as portfolio_name 
        FROM alerts a
        JOIN portfolios p ON a.portfolio_id = p.id
        WHERE a.is_active = 1
        ORDER BY a.created_at DESC
    `);
}

/**
 * Disattiva un alert
 */
export async function deactivateAlert(alertId) {
    return runQuery('UPDATE alerts SET is_active = 0 WHERE id = ?', [alertId]);
}

/**
 * Aggiorna la data dell'ultimo trigger
 */
export async function updateLastTriggered(alertId) {
    return runQuery('UPDATE alerts SET last_triggered = CURRENT_TIMESTAMP WHERE id = ?', [alertId]);
}

/**
 * Elimina un alert
 */
export async function deleteAlert(alertId) {
    return runQuery('DELETE FROM alerts WHERE id = ?', [alertId]);
}

/**
 * Controlla se un alert deve essere triggerto
 */
export function checkAlertCondition(alert, currentValue, portfolioData) {
    const { condition_type, threshold_value, alert_type } = alert;
    
    switch (condition_type) {
        case CONDITION_TYPES.ABOVE:
            return currentValue > threshold_value;
        
        case CONDITION_TYPES.BELOW:
            return currentValue < threshold_value;
        
        case CONDITION_TYPES.CHANGE_PERCENT:
            if (alert_type === ALERT_TYPES.PERFORMANCE && portfolioData) {
                const change = ((portfolioData.currentValue - portfolioData.investedValue) / portfolioData.investedValue) * 100;
                return Math.abs(change) >= threshold_value;
            }
            return false;
        
        default:
            return false;
    }
}
