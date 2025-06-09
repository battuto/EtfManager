import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAll, runQuery, initDb } from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.urlencoded({ extended: true }));

async function fetchCurrentPrice(ticker) {
    try {
        const url = `https://www.google.com/finance/quote/${ticker}:BIT?hl=it`;
        const resp = await axios.get(url);
        const $ = cheerio.load(resp.data);
        const txt = $('div.YMlKec.fxKbKc').first().text();
        const cleaned = txt.replace(/\u20AC/g, '').replace(/\./g, '').replace(/,/g, '.');
        return parseFloat(cleaned);
    } catch (err) {
        console.error('fetchCurrentPrice error:', err.message);
        return null;
    }
}

function renderPage(investments) {
    return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>Portfolio ETF</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2em; }
    table { border-collapse: collapse; width: 100%; margin-top: 2em; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
    th { background-color: #f2f2f2; }
    .profit { color: #2e7d32; }
    .loss { color: #c62828; }
    form { margin-bottom: 2em; }
  </style>
</head>
<body>
  <h1>Portfolio ETF</h1>
  <form method="POST" action="/add">
    <label>Ticker ETF: <input name="ticker" required></label>
    <label>Quote: <input type="number" step="1" name="shares" required></label>
    <label>Prezzo d'acquisto: <input type="number" step="0.01" name="buy_price" required></label>
    <label>Data d'acquisto: <input type="date" name="buy_date" required></label>
    <button type="submit">Aggiungi</button>
  </form>
  ${investments.length > 0 ? `
  <table>
    <tr><th>Ticker</th><th>Quote</th><th>Prezzo Acquisto</th><th>Data</th><th>Prezzo Attuale</th><th>Valore</th><th>Profit/Loss</th></tr>
    ${investments.map(inv => `
      <tr>
        <td>${inv.ticker}</td>
        <td>${inv.shares}</td>
        <td>${inv.buy_price.toFixed(2)}€</td>
        <td>${inv.buy_date}</td>
        <td>${inv.current_price !== null ? inv.current_price.toFixed(2) + '€' : 'N/D'}</td>
        <td>${inv.current_value !== null ? inv.current_value.toFixed(2) + '€' : 'N/D'}</td>
        <td class="${inv.profit_loss >= 0 ? 'profit' : 'loss'}">${inv.profit_loss >= 0 ? '+' : ''}${inv.profit_loss.toFixed(2)}€</td>
      </tr>
    `).join('')}
  </table>
  ` : '<p>Nessun investimento salvato.</p>'}
</body>
</html>`;
}

app.get('/', async (req, res) => {
    try {
        const investments = await getAll('SELECT id, ticker, shares, buy_price, buy_date FROM investments');

        const enrichedInvestments = [];
        for (const r of investments) {
            const price = await fetchCurrentPrice(r.ticker);
            const value = price != null ? price * r.shares : null;
            const profit = value != null ? value - r.buy_price * r.shares : 0;
            enrichedInvestments.push({ ...r, current_price: price, current_value: value, profit_loss: profit });
        }

        res.send(renderPage(enrichedInvestments));
    } catch (error) {
        console.error('Errore nella query:', error);
        res.status(500).send('Errore interno');
    }
});

app.post('/add', async (req, res) => {
    try {
        const { ticker, shares, buy_price, buy_date } = req.body;

        await runQuery(
            'INSERT INTO investments (ticker, shares, buy_price, buy_date) VALUES (?, ?, ?, ?)',
            [ticker.toUpperCase(), parseFloat(shares), parseFloat(buy_price), buy_date]
        );

        res.redirect('/');
    } catch (error) {
        console.error('Errore inserimento:', error);
        res.status(500).send('Errore durante l\'inserimento');
    }
});

// NOTA: Rimuovi questa parte se stai usando server.js come entry point principale
 initDb()
     .then(() => {
         app.listen(3000, () => console.log('Server avviato su porta 3000'));
    })
     .catch(err => {
         console.error('Errore inizializzazione database:', err);
    });

// Esporta l'app per utilizzarla in server.js
export default app;