import { getInvestmentsWithCurrentPrice } from './investment.js';

/**
 * Calcola il valore corrente di un portfolio
 * @param {number} portfolioId - ID del portfolio
 * @returns {Promise<Object>} Oggetto con currentValue, investedValue, profitLoss, percentChange
 */
export async function getCurrentPortfolioValue(portfolioId) {
    try {
        // Ottieni investimenti per questo portfolio
        const investments = await getInvestmentsWithCurrentPrice(portfolioId);

        // Calcola totali
        let totalInvested = 0;
        let totalCurrentValue = 0;

        investments.forEach(inv => {
            totalInvested += inv.buy_price * inv.shares;
            if (inv.current_value !== null) {
                totalCurrentValue += inv.current_value;
            }
        });

        const totalProfit = totalCurrentValue - totalInvested;
        const totalPercentChange = totalInvested > 0
            ? (totalProfit / totalInvested) * 100
            : 0;

        return {
            currentValue: totalCurrentValue,
            investedValue: totalInvested,
            profitLoss: totalProfit,
            percentChange: totalPercentChange,
            investments: investments
        };
    } catch (error) {
        console.error('Errore nel calcolo del valore portfolio:', error);
        throw error;
    }
}

/**
 * Calcola le metriche di base per un portfolio
 * @param {number} portfolioId - ID del portfolio
 * @returns {Promise<Object>} Metriche del portfolio
 */
export async function getPortfolioMetrics(portfolioId) {
    try {
        const portfolioValue = await getCurrentPortfolioValue(portfolioId);
        
        return {
            ...portfolioValue,
            numberOfInvestments: portfolioValue.investments.length,
            averageInvestment: portfolioValue.investments.length > 0 
                ? portfolioValue.investedValue / portfolioValue.investments.length 
                : 0,
            diversification: calculateDiversification(portfolioValue.investments)
        };
    } catch (error) {
        console.error('Errore nel calcolo delle metriche portfolio:', error);
        throw error;
    }
}

/**
 * Calcola l'indice di diversificazione del portfolio
 * @param {Array} investments - Array degli investimenti
 * @returns {number} Indice di diversificazione (0-100)
 */
function calculateDiversification(investments) {
    if (investments.length === 0) return 0;
    
    // Calcola la distribuzione percentuale degli investimenti
    const totalValue = investments.reduce((sum, inv) => sum + (inv.current_value || 0), 0);
    
    if (totalValue === 0) return 0;
    
    // Calcola l'indice di Herfindahl-Hirschman (HHI) per la concentrazione
    const concentrationSum = investments.reduce((sum, inv) => {
        const percentage = (inv.current_value || 0) / totalValue;
        return sum + (percentage * percentage);
    }, 0);
    
    // Converte HHI in indice di diversificazione (più alto = più diversificato)
    return Math.max(0, (1 - concentrationSum) * 100);
}
