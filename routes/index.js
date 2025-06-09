import express from 'express';
import { getIndexPage, createInvestment, updateInvestment, deleteInvestment, moveInvestmentBetweenPortfolios } from '../controllers/investmentController.js';
import { createPortfolio, updatePortfolio, getPortfolios } from '../controllers/portfolioController.js';
import { getHistoricalPortfolioData, getPortfolioMetrics } from '../controllers/analyticsController.js';
import { getPurchaseHistoryByTicker } from '../models/investment.js';
import { optimizeDatabase } from '../config/database.js';

const router = express.Router();

// Middleware per gestire errori asincroni
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Pagina principale
router.get('/', asyncHandler(getIndexPage));
router.post('/add', asyncHandler(createInvestment));

// API portfolios
router.get('/portfolios', asyncHandler(async (req, res) => {
    const portfolios = await getPortfolios();
    res.json({ success: true, portfolios });
}));

router.post('/portfolios/create', asyncHandler(async (req, res) => {
    const id = await createPortfolio(req.body);
    res.json({ success: true, id });
}));

router.put('/portfolios/:id', asyncHandler(async (req, res) => {
    await updatePortfolio(req.params.id, req.body);
    res.json({ success: true });
}));

// API investimenti
router.put('/investments/:id', asyncHandler(updateInvestment));

// Rotta per la cronologia acquisti
router.get('/investments/history/:portfolioId/:ticker', asyncHandler(async (req, res) => {
    const { portfolioId, ticker } = req.params;
    const history = await getPurchaseHistoryByTicker(parseInt(portfolioId), ticker);
    res.json({ success: true, history });
}));

router.delete('/investments/:id', asyncHandler(deleteInvestment));

router.post('/investments/move', asyncHandler(moveInvestmentBetweenPortfolios));

// API analytics
router.get('/analytics/historical/:portfolioId', asyncHandler(getHistoricalPortfolioData));
router.get('/analytics/metrics/:portfolioId', asyncHandler(getPortfolioMetrics));


router.post('/system/database/optimize', asyncHandler(async (req, res) => {
    await optimizeDatabase();
    res.json({ success: true, message: 'Database ottimizzato con successo' });
}));

export default router;