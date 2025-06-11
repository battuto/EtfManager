/**
 * @fileoverview Price Utilities Module
 * Handles ETF price fetching, ISIN mapping, and historical data retrieval
 * with caching, retry mechanisms, and error handling
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import {getDb} from '../config/database.js';

// Common ISIN mappings (optimized)
const commonIsinMap = {
    'VWCE'  : 'IE00BK5BQT80',
    'SWDA'  : 'IE00B4L5Y983',
    'EIMI'  : 'IE00BKM4GZ66',
    'LCWD'  : 'IE00BP3QZJ36',
    'EXSA'  : 'LU0446734104',
    'XDWT'  : 'IE00BL25JP72',
    'AGGH'  : 'IE00BDBRDM35',
    'DBXD'  : 'LU0274211480',
    'JPGL'  : 'IE00BJSFQJ20',
    'XGDU'  : 'DE000A2T0VU5',
    'EM710' : 'LU1287023185',
    'FWRA'  : 'IE000716YHJ7'
};

// HTTP configuration with timeout and retry
const HTTP_CONFIG = {
    timeout: 10000, // 10 seconds
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    retry: 2 // Maximum retry attempts
};

/**
 * HTTP utility with retry mechanism
 * @param {string} url - URL to fetch
 * @param {Object} config - Axios configuration
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<Object>} Axios response
 */
async function fetchWithRetry(url, config = {}, retries = HTTP_CONFIG.retry) {
    try {
        return await axios({
            url,
            ...config,
            timeout: config.timeout || HTTP_CONFIG.timeout,
            headers: { ...HTTP_CONFIG.headers, ...(config.headers || {}) }
        });
    } catch (error) {
        if (retries > 0 && (error.code === 'ECONNABORTED' || error.response?.status >= 500)) {
            console.warn(`💫 Retrying request to ${url}, attempts remaining: ${retries-1}`);
            return fetchWithRetry(url, config, retries - 1);
        }
        throw error;
    }
}

/**
 * Initialize ISIN table in database
 * @returns {Promise<void>}
 */
export function initIsinTable() {
    return new Promise((resolve, reject) => {
        try {
            const db = getDb();
            // Modified query to avoid syntax issues
            const createTableSQL = "CREATE TABLE IF NOT EXISTS isin_mapping (ticker TEXT PRIMARY KEY, isin TEXT NOT NULL, updated_at INTEGER NOT NULL)";

            db.run(createTableSQL, function(err) {
                if (err) {
                    console.error('❌ Error creating isin_mapping table:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        } catch (error) {
            console.error('❌ Error during initIsinTable:', error);
            // Resolve anyway to not block initialization
            resolve();
        }
    });
}

/**
 * Retrieve ISIN for a ticker with multi-level cache system
 * @param {string} ticker - ETF ticker symbol
 * @returns {Promise<string|null>} ISIN code or null
 */
export async function findIsin(ticker) {
    if (!ticker) return null;

    ticker = ticker.toUpperCase().trim();

    // 1. Check static mapping (memory)
    if (commonIsinMap[ticker]) {
        return commonIsinMap[ticker];
    }

    return null; // Could be extended with database cache and API lookup
}

/**
 * Fetch current price of an ETF with caching
 * @param {string} ticker - ETF ticker symbol
 * @returns {Promise<number|null>} Current price or null
 */
export async function fetchCurrentPrice(ticker) {
    if (!ticker) return null;

    const normalizedTicker = ticker.toUpperCase().trim();

    try {
        // 2. Fetch price from Google Finance
        const url = `https://www.google.com/finance/quote/${normalizedTicker}:BIT?hl=it`;
        const resp = await fetchWithRetry(url);
        const $ = cheerio.load(resp.data);
        const txt = $('div.YMlKec.fxKbKc').first().text();

        if (!txt) {
            console.warn(`⚠️ No price found for ${normalizedTicker}`);
            return null;
        }

        const cleaned = txt.replace(/\u20AC/g, '').replace(/\./g, '').replace(/,/g, '.');
        const price = parseFloat(cleaned);

        if (isNaN(price)) {
            console.warn(`⚠️ Invalid price for ${normalizedTicker}: "${cleaned}"`);
            return null;
        }

        return price;
    } catch (err) {
        console.error(`📉 Error fetching price for ${normalizedTicker}:`, err.message);
        return null;
    }
}

/**
 * Fetch historical data for an ETF with caching
 * @param {string} ticker - ETF ticker symbol
 * @param {number} days - Number of days of historical data (default: 30)
 * @returns {Promise<Object|null>} Historical data object with dates and values arrays
 */
export async function fetchHistoricalData(ticker, days = 30) {
    if (!ticker) return null;

    try {
        // 2. Prepare dates
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - days);

        const dateFrom = pastDate.toISOString().split('T')[0];
        const dateTo = today.toISOString().split('T')[0];

        // 3. Get ISIN if necessary
        const isin = ticker.length === 12 ? ticker : await findIsin(ticker);

        if (!isin) {
            console.error(`❌ Unable to find ISIN for ${ticker}`);
            return null;
        }

        // 4. Request historical data
        try {
            const response = await fetchWithRetry(
                `https://www.justetf.com/api/etfs/${isin}/performance-chart`,
                {
                    params: {
                        locale: 'it',
                        currency: 'EUR',
                        valuesType: 'MARKET_VALUE',
                        reduceData: false,
                        includeDividends: false,
                        features: 'DIVIDENDS',
                        dateFrom,
                        dateTo
                    }
                }
            );
            
            if (response?.data?.series && response.data.series.length > 0) {
                // 5. Extract dates and values
                const dates = response.data.series.map(item => {
                    const parts = item.date.split('-');
                    return `${parts[2]}/${parts[1]}/${parts[0]}`; // Convert to dd/mm/yyyy format
                });
                const values = response.data.series.map(item => item.value.raw);
                return { dates, values };
            }

            console.warn(`⚠️ JustETF response for ${ticker} contains no data in series`);
            return null;
        } catch (error) {
            console.error(`📈 Error in JustETF request for ${ticker} (ISIN: ${isin}):`, error.message);
            return null;
        }
    } catch (error) {
        console.error(`❌ General error in fetchHistoricalData for ${ticker}:`, error.message);
        return null;
    }
}
