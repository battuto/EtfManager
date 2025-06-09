import axios from 'axios';
import * as cheerio from 'cheerio';
import {getDb} from '../config/database.js';

// Mapping comuni ISIN (ottimizzato)
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
 * Recupera l'ISIN di un ticker con sistema di cache multi-livello
 */
export async function findIsin(ticker) {
    if (!ticker) return null;

    ticker = ticker.toUpperCase().trim();

    // 1. Controlla nella mappatura statica (memoria)
    if (commonIsinMap[ticker]) {
        return commonIsinMap[ticker];
    }
}
/**
 * Recupera il prezzo attuale di un ETF con cache
 */
export async function fetchCurrentPrice(ticker) {
    if (!ticker) return null;

    const normalizedTicker = ticker.toUpperCase().trim();

    try {

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

        return price
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

    try {
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
                return {dates, values}
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
