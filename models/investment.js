import { getDb, getAll, get, runQuery, runTransaction } from '../config/database.js';
import { fetchCurrentPrice } from '../utils/priceUtils.js';

const INVESTMENT_CACHE = {
    investments: new Map(),
    lastFetch: 0,
    ttl: 60000 // 1 minuto
};

/**
 * Ottiene tutti gli investimenti
 */
export function getAllInvestments() {
    return getAll('SELECT id, ticker, shares, buy_price, buy_date FROM investments');
}

/**
 * Ottiene investimenti con prezzi attuali e calcoli di performance
 * Implementa caching locale per ridurre query ripetute in brevi periodi
 */
export async function getInvestmentsWithCurrentPrice(portfolioId = 1) {
    try {
        // Verifica se abbiamo dati recenti in cache per questo portfolio
        const cacheKey = `portfolio_${portfolioId}`;
        const now = Date.now();

        if (INVESTMENT_CACHE.investments.has(cacheKey) &&
            now - INVESTMENT_CACHE.lastFetch < INVESTMENT_CACHE.ttl) {
            return INVESTMENT_CACHE.investments.get(cacheKey);
        }

        // Esegui query ottimizzata con indici
        const rows = await getAll(`
            SELECT id,
                   ticker,
                   SUM(shares) as shares,
                   SUM(shares * buy_price) / SUM(shares) as avg_buy_price,
                   MIN(buy_date) as first_buy_date,
                   COUNT(*) as purchase_count
            FROM investments
            WHERE portfolio_id = ?
            GROUP BY ticker
            ORDER BY ticker`,
            [portfolioId]);

        // Esecuzione parallela per migliorare performance
        const investmentPromises = rows.map(async (row) => {
            try {
                const currentPrice = await fetchCurrentPrice(row.ticker);
                const buyPrice = row.avg_buy_price;
                const shares = row.shares;

                // Calcoli di performance
                const investmentCost = buyPrice * shares;
                const currentValue = currentPrice !== null ? currentPrice * shares : null;
                const profitLoss = currentValue !== null ? currentValue - investmentCost : 0;
                const percentChange = buyPrice > 0 ? (currentPrice / buyPrice - 1) * 100 : 0;

                return {
                    id: row.id,
                    ticker: row.ticker,
                    shares: shares,
                    buy_price: buyPrice,
                    buy_date: row.first_buy_date,
                    purchase_count: row.purchase_count,
                    current_price: currentPrice,
                    current_value: currentValue,
                    profit_loss: profitLoss,
                    percent_change: percentChange
                };
            } catch (error) {
                console.error(`Errore nell'elaborazione del ticker ${row.ticker}:`, error);
                return {
                    ...row,
                    current_price: null,
                    current_value: null,
                    profit_loss: 0,
                    percent_change: 0
                };
            }
        });

        // Attendi il completamento di tutte le promesse in parallelo
        const investments = await Promise.all(investmentPromises);

        // Aggiorna la cache
        INVESTMENT_CACHE.investments.set(cacheKey, investments);
        INVESTMENT_CACHE.lastFetch = now;

        return investments;
    } catch (error) {
        console.error('Errore nel recupero degli investimenti:', error);
        throw error;
    }
}

/**
 * Ottiene la cronologia degli acquisti per un ticker specifico
 */
export async function getPurchaseHistoryByTicker(portfolioId, ticker) {
    try {
        // Query con parametri per evitare SQL injection
        const rows = await getAll(
            `SELECT id, ticker, shares, buy_price, buy_date
             FROM investments
             WHERE portfolio_id = ? AND ticker = ?
             ORDER BY buy_date DESC`,
            [portfolioId, ticker]
        );

        // Ottimizzazione: ottieni il prezzo corrente una sola volta
        const currentPrice = await fetchCurrentPrice(ticker);

        // Mappa i risultati in parallelo per migliorare le prestazioni
        return rows.map(row => {
            const investmentCost = row.buy_price * row.shares;
            const currentValue = currentPrice !== null ? currentPrice * row.shares : null;
            const profitLoss = currentValue !== null ? currentValue - investmentCost : 0;
            const percentChange = investmentCost > 0 ? (profitLoss / investmentCost) * 100 : 0;

            // Calcola la deviazione dal prezzo attuale
            const priceDeviation = row.buy_price - currentPrice;
            const priceDeviationPercent = currentPrice > 0 ? (priceDeviation / currentPrice) * 100 : 0;

            return {
                ...row,
                current_price: currentPrice,
                current_value: currentValue,
                profit_loss: profitLoss,
                percent_change: percentChange,
                price_deviation: priceDeviation,
                price_deviation_percent: priceDeviationPercent
            };
        });
    } catch (error) {
        console.error('Errore nel recupero della cronologia acquisti:', error);
        throw error;
    }
}

/**
 * Aggiunge un nuovo investimento
 */
export async function addInvestment(investment) {
    const { ticker, shares, buy_price, buy_date, portfolio_id = 1 } = investment;

    // Invalida la cache
    invalidateCache(portfolio_id);

    // Cerca ISIN per il ticker (richiama findIsinFromJustETF tramite findIsin)
    try {
        const { findIsin } = await import('../utils/priceUtils.js');
        const isin = await findIsin(ticker);
        console.log(`ISIN trovato per ${ticker}: ${isin || 'non trovato'}`);
    } catch (error) {
        console.error(`Errore nel recupero ISIN per ${ticker}:`, error.message);
    }

    // Inserisci sempre un nuovo record per mantenere la cronologia degli acquisti
    return runQuery(
        'INSERT INTO investments (portfolio_id, ticker, shares, buy_price, buy_date) VALUES (?, ?, ?, ?, ?)',
        [portfolio_id, ticker.toUpperCase(), parseFloat(shares), parseFloat(buy_price), buy_date]
    );
}

/**
 * Aggiorna un investimento esistente
 */
export async function updateInvestment(id, investment) {
    const { ticker, shares, buy_price, buy_date } = investment;

    // Ottieni il portfolio_id per invalidare la cache
    const invData = await get('SELECT portfolio_id FROM investments WHERE id = ?', [id]);
    if (invData && invData.portfolio_id) {
        invalidateCache(invData.portfolio_id);
    }

    return runQuery(
        'UPDATE investments SET ticker = ?, shares = ?, buy_price = ?, buy_date = ? WHERE id = ?',
        [ticker.toUpperCase(), parseFloat(shares), parseFloat(buy_price), buy_date, id]
    );
}

/**
 * Elimina un investimento
 */
export async function deleteInvestment(id) {
    // Ottieni il portfolio_id per invalidare la cache
    const invData = await get('SELECT portfolio_id FROM investments WHERE id = ?', [id]);
    if (invData && invData.portfolio_id) {
        invalidateCache(invData.portfolio_id);
    }

    return runQuery('DELETE FROM investments WHERE id = ?', [id]);
}

/**
 * Sposta un investimento tra portfolio
 */
export async function moveInvestment(investmentId, targetPortfolioId) {
    // Ottieni il portfolio_id corrente per invalidare la cache
    const invData = await get('SELECT portfolio_id FROM investments WHERE id = ?', [investmentId]);
    if (invData && invData.portfolio_id) {
        // Invalida sia il portfolio di origine che quello di destinazione
        invalidateCache(invData.portfolio_id);
        invalidateCache(targetPortfolioId);
    }

    return runQuery(
        'UPDATE investments SET portfolio_id = ? WHERE id = ?',
        [targetPortfolioId, investmentId]
    );
}

/**
 * Ottiene tutti gli investimenti di un portfolio
 */
export function getAllInvestmentsByPortfolio(portfolioId) {
    return getAll('SELECT id, ticker, shares, buy_price, buy_date FROM investments WHERE portfolio_id = ?',
        [portfolioId]);
}

/**
 * Invalida la cache degli investimenti per un portfolio
 */
function invalidateCache(portfolioId) {
    const cacheKey = `portfolio_${portfolioId}`;
    INVESTMENT_CACHE.investments.delete(cacheKey);
}

/**
 * Esegue operazioni batch su più investimenti in una singola transazione
 */
export async function batchUpdateInvestments(operations) {
    const queries = [];
    const portfoliosToInvalidate = new Set();

    // Prepara le query per ogni operazione
    for (const op of operations) {
        if (op.type === 'add') {
            const { ticker, shares, buy_price, buy_date, portfolio_id = 1 } = op.data;
            portfoliosToInvalidate.add(portfolio_id);

            queries.push({
                sql: 'INSERT INTO investments (portfolio_id, ticker, shares, buy_price, buy_date) VALUES (?, ?, ?, ?, ?)',
                params: [portfolio_id, ticker.toUpperCase(), parseFloat(shares), parseFloat(buy_price), buy_date]
            });
        } else if (op.type === 'update') {
            const { id, ticker, shares, buy_price, buy_date } = op.data;

            // Ottieni il portfolio_id per invalidare la cache
            const invData = await get('SELECT portfolio_id FROM investments WHERE id = ?', [id]);
            if (invData && invData.portfolio_id) {
                portfoliosToInvalidate.add(invData.portfolio_id);
            }

            queries.push({
                sql: 'UPDATE investments SET ticker = ?, shares = ?, buy_price = ?, buy_date = ? WHERE id = ?',
                params: [ticker.toUpperCase(), parseFloat(shares), parseFloat(buy_price), buy_date, id]
            });
        } else if (op.type === 'delete') {
            const id = op.data;

            // Ottieni il portfolio_id per invalidare la cache
            const invData = await get('SELECT portfolio_id FROM investments WHERE id = ?', [id]);
            if (invData && invData.portfolio_id) {
                portfoliosToInvalidate.add(invData.portfolio_id);
            }

            queries.push({
                sql: 'DELETE FROM investments WHERE id = ?',
                params: [id]
            });
        }
    }

    // Esegui la transazione
    const results = await runTransaction(queries);

    // Invalida le cache
    portfoliosToInvalidate.forEach(portfolioId => invalidateCache(portfolioId));

    return results;
}
