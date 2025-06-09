import { getDb, getAll } from '../config/database.js';
import { fetchCurrentPrice, fetchHistoricalData } from '../utils/priceUtils.js';

export function getHistoricalData(portfolioId, days = 30) {
    return new Promise(async (resolve, reject) => {
        try {
            // Usa getAll invece di accedere direttamente al DB e chiamare close()
            const investments = await getAll(
                'SELECT id, ticker, shares, buy_price, buy_date FROM investments WHERE portfolio_id = ?',
                [portfolioId]
            );

            if (investments.length === 0) {
                resolve({ dates: [], values: [] });
                return;
            }

            // Se abbiamo più ETF nel portfolio, dobbiamo combinare i dati
            let combinedDates = new Set();
            const investmentData = [];

            // Ottieni i dati storici per ciascun ETF
            for (const inv of investments) {
                const historicalData = await fetchHistoricalData(inv.ticker, days);

                if (historicalData && historicalData.dates.length > 0) {
                    investmentData.push({
                        ticker: inv.ticker,
                        shares: inv.shares,
                        data: historicalData
                    });

                    // Aggiungi le date di questo ETF al set di date comuni
                    historicalData.dates.forEach(date => combinedDates.add(date));
                } else {
                    // Fallback: usa dati simulati se i dati reali non sono disponibili
                    const simulatedDates = [];
                    const simulatedValues = [];
                    const today = new Date();

                    for (let i = days; i >= 0; i--) {
                        const date = new Date();
                        date.setDate(today.getDate() - i);
                        const dateStr = date.toLocaleDateString('it-IT');
                        simulatedDates.push(dateStr);

                        // Simula una variazione casuale per ogni giorno
                        const variance = 1 + (Math.random() * 0.2 - 0.1) * (i/days);
                        const simulatedPrice = inv.buy_price * variance;
                        simulatedValues.push(simulatedPrice * inv.shares);

                        combinedDates.add(dateStr);
                    }

                    investmentData.push({
                        ticker: inv.ticker,
                        shares: inv.shares,
                        data: { dates: simulatedDates, values: simulatedValues }
                    });
                }
            }

            // Converti il Set in un array ordinato di date
            const sortedDates = Array.from(combinedDates).sort((a, b) => {
                return new Date(a.split('/').reverse().join('-')) -
                    new Date(b.split('/').reverse().join('-'));
            });

            // Calcola il valore totale del portfolio per ogni data
            const portfolioValues = sortedDates.map(date => {
                let total = 0;
                investmentData.forEach(inv => {
                    const dateIndex = inv.data.dates.indexOf(date);
                    if (dateIndex !== -1) {
                        // Moltiplica per il numero di quote
                        total += inv.data.values[dateIndex] * inv.shares;
                    }
                });
                return total;
            });

            resolve({ dates: sortedDates, values: portfolioValues });
        } catch (error) {
            console.error('Errore nell\'elaborazione dei dati storici:', error);
            reject(error);
        }
    });
}