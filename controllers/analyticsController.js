/**
 * @fileoverview Advanced Portfolio Analytics Controller
 * Provides comprehensive financial analysis including correlation, volatility, risk metrics, and rebalancing recommendations
 */

import { getAll } from '../config/database.js';
import { fetchCurrentPrice, fetchHistoricalData } from '../utils/priceUtils.js';

// Constants for analytics calculations
const TRADING_DAYS_PER_YEAR = 252;
const DEFAULT_RISK_FREE_RATE = 0.02;
const MAX_DAYS_LIMIT = 3650; // 10 years
const MIN_DAYS_LIMIT = 7;

/**
 * Get historical portfolio data with optimized period calculation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getHistoricalPortfolioData(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        const days = parseInt(req.query.days || 30);

        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid portfolio ID'
            });
        }

        const validDays = await calculateValidDays(portfolioId, days);
        const data = await getHistoricalData(portfolioId, validDays);
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error retrieving historical data:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Server error' : error.message
        });
    }
}

/**
 * Get advanced portfolio metrics and analytics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getPortfolioMetrics(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);

        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid portfolio ID'
            });
        }

        const analytics = await getPortfolioAnalytics(portfolioId);
        res.json({ success: true, analytics });
    } catch (error) {
        console.error('📊 Error calculating portfolio metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Server error' : error.message
        });
    }
}

/**
 * Get historical portfolio data with optimized caching and calculation
 * @param {number} portfolioId - Portfolio ID
 * @param {number} days - Number of days for historical data (default: 30)
 * @returns {Promise<{dates: string[], values: number[], investedValues: number[]}>}
 */
export async function getHistoricalData(portfolioId, days = 30) {
    try {
        // Get all portfolio investments (including all transactions for invested capital calculation)
        const investments = await getAll(
            'SELECT id, ticker, shares, buy_price, buy_date FROM investments WHERE portfolio_id = ?',
            [portfolioId]
        );

        // Get aggregated investments for portfolio value calculation
        const aggregatedInvestments = await getAll(`
            SELECT ticker,
                   SUM(shares) as shares,
                   SUM(shares * buy_price) / SUM(shares) as avg_buy_price,
                   MIN(buy_date) as first_buy_date
            FROM investments
            WHERE portfolio_id = ?
            GROUP BY ticker`,
            [portfolioId]
        );

        if (aggregatedInvestments.length === 0) {
            return { dates: [], values: [], investedValues: [] };
        }

        // Set for unique dates
        const combinedDates = new Set();

        // Collect historical data for each ETF in parallel (using aggregated investments)
        const investmentDataPromises = aggregatedInvestments.map(async (inv) => {
            try {
                const historicalData = await fetchHistoricalData(inv.ticker, days);

                if (historicalData && historicalData.dates.length > 0) {
                    // Add dates to global set
                    historicalData.dates.forEach(date => combinedDates.add(date));

                    return {
                        ticker: inv.ticker,
                        shares: inv.shares,
                        data: historicalData
                    };
                } else {
                    // Fallback with simulated data
                    return generateSimulatedData({
                        ticker: inv.ticker,
                        shares: inv.shares,
                        buy_price: inv.avg_buy_price
                    }, days, combinedDates);
                }
            } catch (error) {
                console.error(`📉 Error fetching historical data for ${inv.ticker}:`, error);
                return generateSimulatedData({
                    ticker: inv.ticker,
                    shares: inv.shares,
                    buy_price: inv.avg_buy_price
                }, days, combinedDates);
            }
        });

        // Wait for all promises to complete in parallel
        const investmentData = await Promise.all(investmentDataPromises);

        // Convert Set to sorted array of dates
        const sortedDates = Array.from(combinedDates).sort((a, b) => {
            return new Date(a.split('/').reverse().join('-')) -
                new Date(b.split('/').reverse().join('-'));
        });

        // Optimization: pre-calculate date indices for each dataset
        const dateIndicesMap = new Map();
        investmentData.forEach(inv => {
            const dateIndices = new Map();
            inv.data.dates.forEach((date, index) => {
                dateIndices.set(date, index);
            });
            dateIndicesMap.set(inv.ticker, dateIndices);
        });

        // Calculate total portfolio value for each date considering only investments made up to that date
        const portfolioValues = sortedDates.map(date => {
            const targetDate = new Date(date.split('/').reverse().join('-'));
            let total = 0;

            // For each ticker, calculate only shares owned up to that date
            const tickerShares = new Map();
            
            // Sum shares purchased up to target date
            investments.forEach(inv => {
                const buyDate = new Date(inv.buy_date);
                if (buyDate <= targetDate) {
                    const currentShares = tickerShares.get(inv.ticker) || 0;
                    tickerShares.set(inv.ticker, currentShares + inv.shares);
                }
            });

            // Calculate value for each ticker with shares owned up to that date
            tickerShares.forEach((shares, ticker) => {
                const investmentData_item = investmentData.find(inv => inv.ticker === ticker);
                if (investmentData_item) {
                    const dateIndices = dateIndicesMap.get(ticker);
                    const dateIndex = dateIndices ? dateIndices.get(date) : -1;
                    
                    if (dateIndex !== undefined && dateIndex !== -1) {
                        const price = investmentData_item.data.values[dateIndex];
                        const value = price * shares;
                        total += value;
                    }
                }
            });
            
            return total;
        });

        // Calculate dynamic invested capital line
        const investedValues = calculateDynamicInvestedCapital(investments, sortedDates);

        // Add point for today to reflect current portfolio value
        const todayStr = new Date().toLocaleDateString('it-IT');
        if (!sortedDates.includes(todayStr)) {
            // Get current prices for each ETF (using aggregated investments)
            const currentPrices = await Promise.all(aggregatedInvestments.map(inv => fetchCurrentPrice(inv.ticker)));
            const todayTotal = aggregatedInvestments.reduce((sum, inv, idx) => sum + (currentPrices[idx] || 0) * inv.shares, 0);
            
            // Calculate total invested capital up to today (using all investments)
            const totalInvestedToday = investments.reduce((sum, inv) => sum + (inv.buy_price * inv.shares), 0);
            
            sortedDates.push(todayStr);
            portfolioValues.push(todayTotal);
            investedValues.push(totalInvestedToday);
        }

        return { dates: sortedDates, values: portfolioValues, investedValues };
    } catch (error) {
        console.error('📊 Error processing historical data:', error);
        throw error;
    }
}

/**
 * Calculate dynamic invested capital for each date
 * @param {Array} investments - List of investments
 * @param {Array} dates - Array of sorted dates
 * @returns {Array} Array of invested capital values for each date
 */
function calculateDynamicInvestedCapital(investments, dates) {
    return dates.map(date => {
        // Convert date to standard format for comparison
        const targetDate = new Date(date.split('/').reverse().join('-'));
        
        let investedCapital = 0;
        
        // Sum all investments made up to that date
        investments.forEach(inv => {
            const buyDate = new Date(inv.buy_date);
            
            // If investment was made by this date, include it
            if (buyDate <= targetDate) {
                investedCapital += inv.buy_price * inv.shares;
            }
        });
        
        return investedCapital;
    });
}

/**
 * Generate simulated data when real data is not available
 * @param {Object} investment - Investment object
 * @param {number} days - Number of days
 * @param {Set} combinedDates - Set of combined dates
 * @returns {Object} Simulated investment data
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

        // Simulate random variation for each day with ticker-based seed
        // to generate consistent values between calls
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
 * Calculate advanced analytics metrics for a portfolio
 * @param {number} portfolioId - Portfolio ID
 * @returns {Promise<Object>} Portfolio analytics data
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

    // Fetch current prices in parallel
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

    // Calculate allocation percentages
    const allocations = investmentsWithPrices.map(inv => ({
        ticker: inv.ticker,
        allocation: (inv.currentValue / totalValue) * 100
    }));

    // Calculate diversification index (inverse Herfindahl-Hirschman Index)
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

/**
 * Advanced correlation analysis controller
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getCorrelationAnalysis(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        const days = parseInt(req.query.days || 90);

        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid portfolio ID'
            });
        }

        const correlationData = await calculateCorrelationMatrix(portfolioId, days);
        res.json({ success: true, data: correlationData });
    } catch (error) {
        console.error('📊 Error in correlation analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Server error' : error.message
        });
    }
}

/**
 * Volatility and risk analysis controller
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getVolatilityAnalysis(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        const days = parseInt(req.query.days || TRADING_DAYS_PER_YEAR); // One trading year

        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid portfolio ID'
            });
        }

        const volatilityData = await calculateVolatilityMetrics(portfolioId, days);
        res.json({ success: true, data: volatilityData });
    } catch (error) {
        console.error('📈 Error in volatility analysis:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Server error' : error.message
        });
    }
}

/**
 * Portfolio rebalancing recommendations controller
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getRebalanceRecommendations(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        const targetAllocations = req.body.targetAllocations || {}; // Optional target allocations

        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid portfolio ID'
            });
        }

        const recommendations = await calculateRebalanceRecommendations(portfolioId, targetAllocations);
        res.json({ success: true, data: recommendations });
    } catch (error) {
        console.error('⚖️ Error calculating rebalance recommendations:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Server error' : error.message
        });
    }
}

/**
 * Advanced risk metrics controller (Sharpe Ratio, etc.)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getRiskMetrics(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        const days = parseInt(req.query.days || TRADING_DAYS_PER_YEAR);
        const riskFreeRate = parseFloat(req.query.riskFreeRate || DEFAULT_RISK_FREE_RATE);

        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid portfolio ID'
            });
        }

        const riskMetrics = await calculateRiskMetrics(portfolioId, days, riskFreeRate);
        res.json({ success: true, data: riskMetrics });
    } catch (error) {
        console.error('📊 Error calculating risk metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'production' ? 'Server error' : error.message
        });
    }
}

/**
 * Calculate correlation matrix between ETFs in portfolio
 * @param {number} portfolioId - Portfolio ID
 * @param {number} days - Number of days for analysis
 * @returns {Promise<Object>} Correlation matrix and analysis
 */
async function calculateCorrelationMatrix(portfolioId, days) {
    // Get ETFs in portfolio
    const investments = await getAll(`
        SELECT DISTINCT ticker 
        FROM investments 
        WHERE portfolio_id = ?
    `, [portfolioId]);

    if (investments.length < 2) {
        return {
            correlationMatrix: {},
            tickers: [],
            message: 'At least 2 ETFs are required for correlation analysis'
        };
    }

    const correlationMatrix = {};
    const priceData = {};

    // Get historical data for each ETF
    for (const inv of investments) {
        try {
            const historicalData = await fetchHistoricalData(inv.ticker, days);
            
            if (historicalData && historicalData.values && historicalData.values.length > 0) {
                // Convert format from {dates, values} to array of {price}
                priceData[inv.ticker] = historicalData.values.map(price => ({ price }));
            }
        } catch (error) {
            console.error(`📊 Error fetching data for ${inv.ticker}:`, error);
        }
    }

    // Check if we have enough data
    if (Object.keys(priceData).length < 2) {
        return {
            correlationMatrix: {},
            tickers: [],
            message: 'Insufficient historical data for correlation analysis'
        };
    }

    // Calculate correlations between each pair of ETFs
    const tickers = Object.keys(priceData);
    for (let i = 0; i < tickers.length; i++) {
        correlationMatrix[tickers[i]] = {};
        for (let j = 0; j < tickers.length; j++) {
            if (i === j) {
                correlationMatrix[tickers[i]][tickers[j]] = 1;
            } else {
                const correlation = calculatePearsonCorrelation(
                    priceData[tickers[i]],
                    priceData[tickers[j]]
                );
                correlationMatrix[tickers[i]][tickers[j]] = correlation;
            }
        }
    }

    return {
        correlationMatrix,
        tickers,
        analysis: analyzeCorrelationMatrix(correlationMatrix, tickers)
    };
}

/**
 * Calculate volatility metrics for portfolio
 * @param {number} portfolioId - Portfolio ID
 * @param {number} days - Number of days for analysis
 * @returns {Promise<Object>} Volatility metrics and analysis
 */
async function calculateVolatilityMetrics(portfolioId, days) {
    const historicalData = await getHistoricalData(portfolioId, days);
    
    if (!historicalData.values || historicalData.values.length < 2) {
        return {
            message: 'Insufficient data for volatility analysis'
        };
    }

    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < historicalData.values.length; i++) {
        const dailyReturn = (historicalData.values[i] - historicalData.values[i-1]) / historicalData.values[i-1];
        returns.push(dailyReturn);
    }

    // Calculate volatility metrics
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    // Annualize values (assuming 252 trading days)
    const annualizedReturn = avgReturn * TRADING_DAYS_PER_YEAR;
    const annualizedVolatility = volatility * Math.sqrt(TRADING_DAYS_PER_YEAR);

    // Calculate Value at Risk (VaR) at 95%
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const var95 = sortedReturns[Math.floor(sortedReturns.length * 0.05)];

    // Maximum Drawdown
    const { maxDrawdown, maxDrawdownPeriod } = calculateMaxDrawdown(historicalData.values);

    // Calculate Sharpe Ratio
    const sharpeRatio = annualizedVolatility > 0 ? (annualizedReturn - DEFAULT_RISK_FREE_RATE) / annualizedVolatility : 0;

    return {
        dailyVolatility: volatility,
        annualizedVolatility,
        annualizedReturn,
        sharpeRatio,
        valueAtRisk95: var95,
        maxDrawdown,
        maxDrawdownDays: maxDrawdownPeriod,
        totalReturns: returns.length,
        positiveReturns: returns.filter(r => r > 0).length,
        negativeReturns: returns.filter(r => r < 0).length,
        averageDailyReturn: avgReturn,
        interpretation: {
            volatility: getVolatilityInterpretation(annualizedVolatility),
            sharpe: getSharpeRatioInterpretation(sharpeRatio)
        }
    };
}

/**
 * Calculate rebalancing recommendations for portfolio
 * @param {number} portfolioId - Portfolio ID
 * @param {Object} targetAllocations - Target allocation percentages
 * @returns {Promise<Object>} Rebalancing recommendations
 */
async function calculateRebalanceRecommendations(portfolioId, targetAllocations) {
    const currentAnalytics = await getPortfolioAnalytics(portfolioId);
    
    if (!currentAnalytics.allocations || currentAnalytics.allocations.length === 0) {
        return {
            message: 'No investments found in portfolio'
        };
    }

    const currentAllocations = {};
    currentAnalytics.allocations.forEach(alloc => {
        currentAllocations[alloc.ticker] = alloc.allocation;
    });

    // If no target allocations provided, use equal weight
    const tickers = Object.keys(currentAllocations);
    if (Object.keys(targetAllocations).length === 0) {
        const equalWeight = 100 / tickers.length;
        tickers.forEach(ticker => {
            targetAllocations[ticker] = equalWeight;
        });
    }

    const recommendations = [];
    const totalPortfolioValue = currentAnalytics.totalValue;

    for (const ticker of tickers) {
        const currentAlloc = currentAllocations[ticker] || 0;
        const targetAlloc = targetAllocations[ticker] || 0;
        const difference = targetAlloc - currentAlloc;
        
        if (Math.abs(difference) > 1) { // Only if difference > 1%
            const currentValue = (currentAlloc / 100) * totalPortfolioValue;
            const targetValue = (targetAlloc / 100) * totalPortfolioValue;
            const valueChange = targetValue - currentValue;
            
            recommendations.push({
                ticker,
                currentAllocation: currentAlloc,
                targetAllocation: targetAlloc,
                difference,
                currentValue,
                targetValue,
                valueChange,
                action: valueChange > 0 ? 'BUY' : 'SELL',
                priority: Math.abs(difference) > 5 ? 'HIGH' : 'MEDIUM'
            });
        }
    }

    // Sort by priority and absolute difference
    recommendations.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority === 'HIGH' ? -1 : 1;
        }
        return Math.abs(b.difference) - Math.abs(a.difference);
    });

    return {
        recommendations,
        totalPortfolioValue,
        rebalanceNeeded: recommendations.length > 0,
        summary: {
            totalAdjustments: recommendations.length,
            highPriority: recommendations.filter(r => r.priority === 'HIGH').length,
            mediumPriority: recommendations.filter(r => r.priority === 'MEDIUM').length
        }
    };
}

/**
 * Calculate advanced risk metrics for portfolio
 * @param {number} portfolioId - Portfolio ID
 * @param {number} days - Number of days for analysis
 * @param {number} riskFreeRate - Risk-free rate for calculations
 * @returns {Promise<Object>} Advanced risk metrics
 */
async function calculateRiskMetrics(portfolioId, days, riskFreeRate) {
    const volatilityData = await calculateVolatilityMetrics(portfolioId, days);
    
    if (volatilityData.message) {
        return volatilityData;
    }

    const sharpeRatio = volatilityData.annualizedVolatility > 0 
        ? (volatilityData.annualizedReturn - riskFreeRate) / volatilityData.annualizedVolatility 
        : 0;

    // Calculate Sortino Ratio (uses only downside volatility)
    const historicalData = await getHistoricalData(portfolioId, days);
    const returns = [];
    for (let i = 1; i < historicalData.values.length; i++) {
        const dailyReturn = (historicalData.values[i] - historicalData.values[i-1]) / historicalData.values[i-1];
        returns.push(dailyReturn);
    }

    const downSideReturns = returns.filter(r => r < 0);
    const downSideVolatility = downSideReturns.length > 0 
        ? Math.sqrt(downSideReturns.reduce((sum, r) => sum + r * r, 0) / downSideReturns.length) * Math.sqrt(TRADING_DAYS_PER_YEAR)
        : 0;

    const sortinoRatio = downSideVolatility > 0 
        ? (volatilityData.annualizedReturn - riskFreeRate) / downSideVolatility 
        : 0;

    // Calmar Ratio (Risk-adjusted return)
    const calmarRatio = volatilityData.maxDrawdown !== 0 
        ? volatilityData.annualizedReturn / Math.abs(volatilityData.maxDrawdown)
        : 0;

    return {
        ...volatilityData,
        sharpeRatio,
        sortinoRatio,
        calmarRatio,
        riskFreeRate,
        riskMetrics: {
            excellent: sharpeRatio > 2,
            good: sharpeRatio > 1,
            acceptable: sharpeRatio > 0.5,
            poor: sharpeRatio <= 0.5
        },
        interpretation: {
            sharpe: getSharpeRatioInterpretation(sharpeRatio),
            sortino: getSortinoRatioInterpretation(sortinoRatio),
            volatility: getVolatilityInterpretation(volatilityData.annualizedVolatility)
        }
    };
}

/**
 * Statistical support functions for calculations
 */

/**
 * Calculate Pearson correlation coefficient between two data sets
 * @param {Array} x - First dataset
 * @param {Array} y - Second dataset
 * @returns {number} Correlation coefficient (-1 to 1)
 */
function calculatePearsonCorrelation(x, y) {
    if (!x || !y || x.length !== y.length || x.length === 0) {
        return 0;
    }

    const n = x.length;
    const xMean = x.reduce((sum, val) => sum + val.price, 0) / n;
    const yMean = y.reduce((sum, val) => sum + val.price, 0) / n;

    let numerator = 0;
    let xSumSq = 0;
    let ySumSq = 0;

    for (let i = 0; i < n; i++) {
        const xDiff = x[i].price - xMean;
        const yDiff = y[i].price - yMean;
        
        numerator += xDiff * yDiff;
        xSumSq += xDiff * xDiff;
        ySumSq += yDiff * yDiff;
    }

    const denominator = Math.sqrt(xSumSq * ySumSq);
    return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate maximum drawdown and its duration
 * @param {Array} values - Array of portfolio values
 * @returns {Object} Maximum drawdown metrics
 */
function calculateMaxDrawdown(values) {
    let maxDrawdown = 0;
    let maxDrawdownPeriod = 0;
    let peak = values[0];
    let peakIndex = 0;
    let currentDrawdownPeriod = 0;

    for (let i = 1; i < values.length; i++) {
        if (values[i] > peak) {
            peak = values[i];
            peakIndex = i;
            currentDrawdownPeriod = 0;
        } else {
            const drawdown = (peak - values[i]) / peak;
            currentDrawdownPeriod = i - peakIndex;
            
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
                maxDrawdownPeriod = currentDrawdownPeriod;
            }
        }
    }

    return { maxDrawdown, maxDrawdownPeriod };
}

/**
 * Analyze correlation matrix and provide insights
 * @param {Object} matrix - Correlation matrix
 * @param {Array} tickers - Array of ticker symbols
 * @returns {Object} Correlation analysis
 */
function analyzeCorrelationMatrix(matrix, tickers) {
    const correlations = [];
    
    for (let i = 0; i < tickers.length; i++) {
        for (let j = i + 1; j < tickers.length; j++) {
            const correlation = matrix[tickers[i]][tickers[j]];
            correlations.push({
                pair: `${tickers[i]}-${tickers[j]}`,
                correlation,
                level: getCorrelationLevel(correlation)
            });
        }
    }

    correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    return {
        highestCorrelation: correlations[0],
        lowestCorrelation: correlations[correlations.length - 1],
        averageCorrelation: correlations.reduce((sum, c) => sum + Math.abs(c.correlation), 0) / correlations.length,
        correlationPairs: correlations
    };
}

/**
 * Interpretation helper functions
 */

/**
 * Get correlation level description
 * @param {number} correlation - Correlation coefficient
 * @returns {string} Correlation level description
 */
function getCorrelationLevel(correlation) {
    const abs = Math.abs(correlation);
    if (abs > 0.8) return 'Very High';
    if (abs > 0.6) return 'High';
    if (abs > 0.4) return 'Moderate';
    if (abs > 0.2) return 'Low';
    return 'Very Low';
}

/**
 * Get Sharpe ratio interpretation
 * @param {number} ratio - Sharpe ratio value
 * @returns {string} Interpretation description
 */
function getSharpeRatioInterpretation(ratio) {
    if (ratio > 2) return 'Excellent - Return much higher than risk';
    if (ratio > 1) return 'Good - Return higher than risk';
    if (ratio > 0.5) return 'Acceptable - Moderate return vs risk';
    if (ratio > 0) return 'Low - Minimal return vs risk';
    return 'Negative - Return below risk-free rate';
}

/**
 * Get Sortino ratio interpretation
 * @param {number} ratio - Sortino ratio value
 * @returns {string} Interpretation description
 */
function getSortinoRatioInterpretation(ratio) {
    if (ratio > 2) return 'Excellent downside risk control';
    if (ratio > 1) return 'Good downside risk control';
    if (ratio > 0.5) return 'Moderate downside risk control';
    return 'Limited downside risk control';
}

/**
 * Get volatility interpretation
 * @param {number} volatility - Volatility value
 * @returns {string} Interpretation description
 */
function getVolatilityInterpretation(volatility) {
    if (volatility < 0.1) return 'Very Low - Stable portfolio';
    if (volatility < 0.15) return 'Low - Relatively stable portfolio';
    if (volatility < 0.25) return 'Moderate - Normal ETF volatility';
    if (volatility < 0.35) return 'High - Quite volatile portfolio';
    return 'Very High - Very volatile portfolio';
}

/**
 * Calculate valid days for historical data requests
 * @param {number} portfolioId - Portfolio ID
 * @param {number} requestedDays - Requested number of days
 * @returns {Promise<number>} Valid number of days
 */
async function calculateValidDays(portfolioId, requestedDays) {
    if (requestedDays <= 365) {
        return Math.min(Math.max(MIN_DAYS_LIMIT, requestedDays), 365);
    }
    
    // For MAX period, calculate from first investment date
    const firstInvestment = await getAll(
        'SELECT MIN(buy_date) as first_date FROM investments WHERE portfolio_id = ?',
        [portfolioId]
    );
    
    if (firstInvestment.length > 0 && firstInvestment[0].first_date) {
        const firstDate = new Date(firstInvestment[0].first_date);
        const today = new Date();
        const daysSinceFirst = Math.ceil((today - firstDate) / (1000 * 60 * 60 * 24));
        return Math.min(Math.max(daysSinceFirst + 30, requestedDays), MAX_DAYS_LIMIT);
    }
    
    return MAX_DAYS_LIMIT; // Fallback to 10 years
}
