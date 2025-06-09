import {getAll} from '../config/database.js';
import {fetchCurrentPrice, fetchHistoricalData} from '../utils/priceUtils.js';

/**
 * Controller per ottenere i dati storici del portfolio
 */
export async function getHistoricalPortfolioData(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        const days = parseInt(req.query.days || 30);

        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'ID portfolio non valido'
            });
        }

        // Validazione dei giorni per prevenire richieste eccessive
        const validDays = Math.min(Math.max(7, days), 365);

        const data = await getHistoricalData(portfolioId, validDays);
        res.json({ success: true, data });
    } catch (error) {
        console.error('Errore nel recupero dei dati storici:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
}

/**
 * Controller per ottenere metriche avanzate del portfolio
 */
export async function getPortfolioMetrics(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);

        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'ID portfolio non valido'
            });
        }

        const analytics = await getPortfolioAnalytics(portfolioId);
        res.json({ success: true, analytics });
    } catch (error) {
        console.error('Errore nel calcolo delle metriche del portfolio:', error);
        res.status(500).json({
            success: false,
            error: 'Errore interno del server',
            message: error.message
        });
    }
}

/**
 * Ottiene dati storici per un portfolio con sistema di cache
 * @param {number} portfolioId - ID del portfolio
 * @param {number} days - Numero di giorni per i dati storici
 * @returns {Promise<{dates: string[], values: number[]}>}
 */
export async function getHistoricalData(portfolioId, days = 30) {
    try {

        // Ottieni investimenti del portfolio
        const investments = await getAll(
            'SELECT id, ticker, shares, buy_price, buy_date FROM investments WHERE portfolio_id = ?',
            [portfolioId]
        );

        if (investments.length === 0) {
            return { dates: [], values: [] };
        }

        // Set per le date uniche
        const combinedDates = new Set();

        // Raccoglie i dati storici per ogni ETF in parallelo
        const investmentDataPromises = investments.map(async (inv) => {
            try {
                const historicalData = await fetchHistoricalData(inv.ticker, days);

                if (historicalData && historicalData.dates.length > 0) {
                    // Aggiungi date al set globale
                    historicalData.dates.forEach(date => combinedDates.add(date));

                    return {
                        ticker: inv.ticker,
                        shares: inv.shares,
                        data: historicalData
                    };
                } else {
                    // Fallback con dati simulati
                    return generateSimulatedData(inv, days, combinedDates);
                }
            } catch (error) {
                console.error(`Errore nel recupero dati storici per ${inv.ticker}:`, error);
                return generateSimulatedData(inv, days, combinedDates);
            }
        });

        // Attendi il completamento di tutte le promesse in parallelo
        const investmentData = await Promise.all(investmentDataPromises);

        // Converti il Set in un array ordinato di date
        const sortedDates = Array.from(combinedDates).sort((a, b) => {
            return new Date(a.split('/').reverse().join('-')) -
                new Date(b.split('/').reverse().join('-'));
        });

        // Ottimizzazione: pre-calcola gli indici delle date per ogni dataset
        const dateIndicesMap = new Map();
        investmentData.forEach(inv => {
            const dateIndices = new Map();
            inv.data.dates.forEach((date, index) => {
                dateIndices.set(date, index);
            });
            dateIndicesMap.set(inv.ticker, dateIndices);
        });

        // Calcola il valore totale del portfolio per ogni data
        const portfolioValues = sortedDates.map(date => {
            let total = 0;
            investmentData.forEach(inv => {
                const dateIndices = dateIndicesMap.get(inv.ticker);
                const dateIndex = dateIndices ? dateIndices.get(date) : -1;

                if (dateIndex !== undefined && dateIndex !== -1) {
                    total += inv.data.values[dateIndex] * inv.shares;
                }
            });
            return total;
        });

        // Aggiungi un punto per la data odierna per riflettere il valore corrente del portfolio
        const todayStr = new Date().toLocaleDateString('it-IT');
        if (!sortedDates.includes(todayStr)) {
            // Ottieni prezzi correnti per ciascun ETF
            const currentPrices = await Promise.all(investments.map(inv => fetchCurrentPrice(inv.ticker)));
            const todayTotal = investments.reduce((sum, inv, idx) => sum + (currentPrices[idx] || 0) * inv.shares, 0);
            sortedDates.push(todayStr);
            portfolioValues.push(todayTotal);
        }
        return {dates: sortedDates, values: portfolioValues};
    } catch (error) {
        console.error('Errore nell\'elaborazione dei dati storici:', error);
        throw error;
    }
}

/**
 * Genera dati simulati quando i dati reali non sono disponibili
 * @private
 */
function generateSimulatedData(investment, days, combinedDates) {
    const simulatedDates = [];
    const simulatedValues = [];
    const today = new Date();

    for (let i = days; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dateStr = date.toLocaleDateString('it-IT');
        simulatedDates.push(dateStr);

        // Simula una variazione casuale per ogni giorno con seed basato sul ticker
        // per generare valori coerenti tra le chiamate
        const tickerSeed = investment.ticker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const dailySeed = i + tickerSeed;
        const pseudoRandom = Math.sin(dailySeed) * 10000 - Math.floor(Math.sin(dailySeed) * 10000);
        const variance = 1 + (pseudoRandom * 0.2 - 0.1) * (i/days);
        const simulatedPrice = investment.buy_price * variance;
        simulatedValues.push(simulatedPrice);

        combinedDates.add(dateStr);
    }

    return {
        ticker: investment.ticker,
        shares: investment.shares,
        data: { dates: simulatedDates, values: simulatedValues }
    };
}


/**
 * Calcola metriche di analisi avanzate per un portfolio
 */
export async function getPortfolioAnalytics(portfolioId) {
    const investments = await getAll(
        'SELECT ticker, SUM(shares) as shares, SUM(shares * buy_price) as cost ' +
        'FROM investments WHERE portfolio_id = ? GROUP BY ticker',
        [portfolioId]
    );

    if (investments.length === 0) {
        return {
            totalInvested: 0,
            totalValue: 0,
            metrics: {
                sharpeRatio: 0,
                volatility: 0,
                diversification: 0
            }
        };
    }

    // Recupera i prezzi attuali in parallelo
    const pricePromises = investments.map(inv => fetchCurrentPrice(inv.ticker));
    const prices = await Promise.all(pricePromises);

    let totalInvested = 0;
    let totalValue = 0;

    const investmentsWithPrices = investments.map((inv, index) => {
        const currentPrice = prices[index];
        const currentValue = currentPrice ? currentPrice * inv.shares : 0;

        totalInvested += inv.cost;
        totalValue += currentValue;

        return {
            ...inv,
            currentPrice,
            currentValue
        };
    });

    // Calcola percentuali di allocazione
    const allocations = investmentsWithPrices.map(inv => ({
        ticker: inv.ticker,
        allocation: (inv.currentValue / totalValue) * 100
    }));

    // Calcola l'indice di diversificazione (Herfindahl-Hirschman Index inverso)
    const hhi = allocations.reduce((sum, inv) => sum + Math.pow(inv.allocation / 100, 2), 0);
    const diversificationIndex = 1 - hhi;

    return {
        totalInvested,
        totalValue,
        profit: totalValue - totalInvested,
        profitPercent: totalInvested > 0 ? ((totalValue - totalInvested) / totalInvested) * 100 : 0,
        allocations,
        metrics: {
            diversification: diversificationIndex * 100
        }
    };
}
