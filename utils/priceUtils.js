import axios from 'axios';
import * as cheerio from 'cheerio';
import { getDb } from '../config/database.js';

// Sistema di cache avanzato con Map
const cache = {
    isin: new Map(),
    prices: new Map(),
    historicalData: new Map(),

    set(store, key, data, ttl) {
        store.set(key, {
            data,
            expiry: Date.now() + ttl
        });
        return data;
    },

    get(store, key) {
        const item = store.get(key);
        if (!item) return null;
        if (item.expiry < Date.now()) {
            store.delete(key);
            return null;
        }
        return item.data;
    },

    // Nuovo metodo per bulk cache cleanup
    cleanup() {
        const now = Date.now();
        [this.isin, this.prices, this.historicalData].forEach(store => {
            for (const [key, item] of store.entries()) {
                if (item.expiry < now) {
                    store.delete(key);
                }
            }
        });
    }
};

// Mapping comuni ISIN (ottimizzato)
const commonIsinMap = {
    'VWCE'  : 'IE00BK5BQT80',
    'SWDA'  : 'IE00B4L5Y983',
    'EIMI'  : 'IE00BKM4GZ66',
    'IWDA'  : 'IE00B4L5Y983',
    'LCWD'  : 'IE00BP3QZJ36',
    'EXSA'  : 'LU0446734104',
    'XDWT'  : 'IE00BL25JP72',
    'AGGH'  : 'IE00BDBRDM35',
    'DBXD'  : 'LU0274211480',
    'JPGL'  : 'IE00BJSFQJ20',
    'XGDU'  : 'DE000A2T0VU5',
    'EM710' : 'LU1287023185',
};

// Configurazione cache con TTL più lunghi per dati che cambiano meno frequentemente
const CACHE_TTL = {
    isin: 30 * 24 * 60 * 60 * 1000,     // 30 giorni per ISIN
    prices: 12 * 60 * 60 * 1000,         // 12 ore per prezzi
    historicalData: 24 * 60 * 60 * 1000  // 24 ore per dati storici
};

// Configurazione HTTP con timeout e retry
const HTTP_CONFIG = {
    timeout: 10000, // 10 secondi
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    retry: 2 // Numero massimo di tentativi
};

// Utility per richieste HTTP con retry
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
            console.warn(`Riprovo richiesta a ${url}, tentativi rimanenti: ${retries-1}`);
            return fetchWithRetry(url, config, retries - 1);
        }
        throw error;
    }
}

// Esegui pulizia cache periodicamente
setInterval(() => cache.cleanup(), 3600000); // Ogni ora

/**
 * Inizializza la tabella ISIN nel database
 */
export function initIsinTable() {
    return new Promise((resolve, reject) => {
        try {
            const db = getDb();
            // Modifica la query per evitare problemi di sintassi
            const createTableSQL = "CREATE TABLE IF NOT EXISTS isin_mapping (ticker TEXT PRIMARY KEY, isin TEXT NOT NULL, updated_at INTEGER NOT NULL)";

            db.run(createTableSQL, function(err) {
                if (err) {
                    console.error('Errore nella creazione della tabella isin_mapping:', err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        } catch (error) {
            console.error('Errore durante initIsinTable:', error);
            // Risolvi comunque la promessa per non bloccare l'inizializzazione
            resolve();
        }
    });
}

/**
 * Cerca l'ISIN direttamente da JustETF
 * @param {string} ticker - Ticker dell'ETF
 * @returns {Promise<string|null>} - ISIN se trovato, altrimenti null
 */
async function findIsinFromJustETF(ticker) {
    try {
        const searchUrl = `https://www.justetf.com/it/search.html?query=${encodeURIComponent(ticker)}&search=ALL`;
        console.log(`Cercando ISIN per ${ticker} su JustETF...`);

        const response = await fetchWithRetry(searchUrl);
        const html = response.data;

        // Nuovo pattern: cerca immagini di sparklines che contengono direttamente l'ISIN
        const sparklineRegex = /\/sparklines\/([A-Z]{2}[A-Z0-9]{10})EUR\.png/g;
        const sparklineMatches = [...html.matchAll(sparklineRegex)];

        if (sparklineMatches && sparklineMatches.length > 0) {
            // Prendi il primo match (gruppo 1 della regex che contiene solo l'ISIN)
            const isin = sparklineMatches[0][1];
            console.log(`ISIN trovato su JustETF (sparklines): ${isin} per ticker ${ticker}`);
            return isin;
        }

        // Pattern alternativo: cerca immagini di grafici che contengono il pattern di un ISIN
        const chartRegex = /\/de\/etf\/[^/]+\/chart\/([A-Z]{2}[A-Z0-9]{10})EUR\.png/g;
        const chartMatches = [...html.matchAll(chartRegex)];

        if (chartMatches && chartMatches.length > 0) {
            // Prendi il primo match (gruppo 1 della regex che contiene solo l'ISIN)
            const isin = chartMatches[0][1];
            console.log(`ISIN trovato su JustETF (chart): ${isin} per ticker ${ticker}`);
            return isin;
        }

        console.warn(`Nessun ISIN trovato su JustETF per ${ticker}`);
        return null;
    } catch (error) {
        console.error(`Errore durante la ricerca ISIN su JustETF per ${ticker}:`, error.message);
        return null;
    }
}

/**
 * Recupera l'ISIN di un ticker con sistema di cache multi-livello
 */
export async function findIsin(ticker) {
    if (!ticker) return null;

    ticker = ticker.toUpperCase().trim();

    // 1. Controlla nella mappatura statica (memoria)
    if (commonIsinMap[ticker]) {
        return commonIsinMap[ticker];
    }

    // 2. Controlla nella cache (memoria)
    const cachedIsin = cache.get(cache.isin, ticker);
    if (cachedIsin) {
        return cachedIsin;
    }

    try {
        // 3. Cerca solo su JustETF (fonte primaria affidabile)
        const isinFromJustETF = await findIsinFromJustETF(ticker);
        if (isinFromJustETF) {
            // Salva o aggiorna ISIN nel database
            await saveIsinToDb(ticker, isinFromJustETF);
            return cache.set(cache.isin, ticker, isinFromJustETF, CACHE_TTL.isin);
        }

        return null;
    } catch (error) {
        console.error(`Errore durante la ricerca dell'ISIN per ${ticker}:`, error);
        return null;
    }
}

function findIsinFromDb(ticker) {
    return new Promise((resolve, reject) => {
        try {
            const db = getDb();
            const query = "SELECT isin FROM isin_mapping WHERE ticker = '" + ticker + "'";
            db.get(query, (err, row) => {
                if (err) {
                    console.error('Errore nella query findIsinFromDb:', err);
                    reject(err);
                } else {
                    resolve(row ? row.isin : null);
                }
            });
        } catch (error) {
            console.error('Errore in findIsinFromDb:', error);
            resolve(null);
        }
    });
}

function saveIsinToDb(ticker, isin) {
    return new Promise((resolve, reject) => {
        try {
            const db = getDb();
            const timestamp = Date.now();
            // Usa una query più semplice con valori direttamente nella stringa SQL
            const query = `INSERT OR REPLACE INTO isin_mapping (ticker, isin, updated_at) VALUES ('${ticker}', '${isin}', ${timestamp})`;

            db.run(query, function(err) {
                if (err) {
                    console.error('Errore nella query saveIsinToDb:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        } catch (error) {
            console.error('Errore in saveIsinToDb:', error);
            resolve(null);
        }
    });
}

async function findIsinFromGoogle(ticker) {
    try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(ticker + ' isin')}`;
        const response = await fetchWithRetry(searchUrl);

        // Usa regex per trovare l'ISIN nel testo
        const isinRegex = /[A-Z]{2}[A-Z0-9]{10}/g;
        const matches = response.data.match(isinRegex);

        if (matches && matches.length > 0) {
            return matches[0];
        }
        return null;
    } catch (error) {
        console.error('Errore nella ricerca ISIN su Google:', error.message);
        return null;
    }
}

/**
 * Verifica se un ISIN è valido
 * @param {string} isin - ISIN da verificare
 * @returns {boolean} - true se l'ISIN è valido, false altrimenti
 */
function isValidIsin(isin) {
    if (!isin || typeof isin !== 'string') return false;

    // Verifica il formato base (2 lettere + 10 caratteri alfanumerici)
    const isinRegex = /^[A-Z]{2}[A-Z0-9]{10}$/;
    if (!isinRegex.test(isin)) return false;

    // Verifica che non sia un valore di test o placeholder
    const testPatterns = [
        /ABCDEFGHIJ/, // Pattern alfanumerico sequenziale
        /0{5,}/,      // Sequenze di zeri
        /1{5,}/,      // Sequenze di uno
        /TEST/i       // Contiene "TEST"
    ];

    return !testPatterns.some(pattern => pattern.test(isin));
}

/**
 * Recupera il prezzo attuale di un ETF con cache
 */
export async function fetchCurrentPrice(ticker) {
    if (!ticker) return null;

    const normalizedTicker = ticker.toUpperCase().trim();

    try {
        // 1. Controlla nella cache
        const cachedPrice = cache.get(cache.prices, normalizedTicker);
        if (cachedPrice) {
            return cachedPrice;
        }

        // 2. Recupera il prezzo da Google Finance
        const url = `https://www.google.com/finance/quote/${normalizedTicker}:BIT?hl=it`;
        const resp = await fetchWithRetry(url);
        const $ = cheerio.load(resp.data);
        const txt = $('div.YMlKec.fxKbKc').first().text();

        if (!txt) {
            console.warn(`Nessun prezzo trovato per ${normalizedTicker}`);
            return null;
        }

        const cleaned = txt.replace(/\u20AC/g, '').replace(/\./g, '').replace(/,/g, '.');
        const price = parseFloat(cleaned);

        if (isNaN(price)) {
            console.warn(`Prezzo non valido per ${normalizedTicker}: "${cleaned}"`);
            return null;
        }

        // Salva nella cache
        return cache.set(cache.prices, normalizedTicker, price, CACHE_TTL.prices);
    } catch (err) {
        console.error(`Errore nel recupero prezzo per ${normalizedTicker}:`, err.message);
        return null;
    }
}

/**
 * Recupera dati storici di un ETF con cache
 */
export async function fetchHistoricalData(ticker, days = 30) {
    if (!ticker) return null;

    const cacheKey = `${ticker}-${days}`;

    try {
        // 1. Controlla nella cache
        const cachedData = cache.get(cache.historicalData, cacheKey);
        if (cachedData) {
            return cachedData;
        }

        // 2. Prepara le date
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - days);

        const dateFrom = pastDate.toISOString().split('T')[0];
        const dateTo = today.toISOString().split('T')[0];

        // 3. Ottieni ISIN se necessario
        const isin = ticker.length === 12 ? ticker : await findIsin(ticker);

        if (!isin) {
            console.error(`Impossibile trovare l'ISIN per ${ticker}`);
            return null;
        }

        // 4. Richiedi dati storici
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
                // 5. Estrai date e valori
                const dates = response.data.series.map(item => {
                    const parts = item.date.split('-');
                    return `${parts[2]}/${parts[1]}/${parts[0]}`; // Converti in formato dd/mm/yyyy
                });

                const values = response.data.series.map(item => item.value.raw);

                const result = { dates, values };

                // Salva nella cache
                return cache.set(cache.historicalData, cacheKey, result, CACHE_TTL.historicalData);
            }

            console.warn(`Risposta JustETF per ${ticker} non contiene dati nella serie`);
            return null;
        } catch (error) {
            console.error(`Errore nella richiesta a JustETF per ${ticker} (ISIN: ${isin}):`, error.message);
            return null;
        }
    } catch (error) {
        console.error(`Errore generale in fetchHistoricalData per ${ticker}:`, error.message);
        return null;
    }
}

/**
 * Pulizia della cache
 */
export function clearCache(type = 'all') {
    if (type === 'all' || type === 'isin') cache.isin.clear();
    if (type === 'all' || type === 'price') cache.prices.clear();
    if (type === 'all' || type === 'historical') cache.historicalData.clear();
}

/**
 * Ottiene statistiche sulla cache
 */
export function getCacheStats() {
    return {
        isin: cache.isin.size,
        prices: cache.prices.size,
        historicalData: cache.historicalData.size,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
    };
}