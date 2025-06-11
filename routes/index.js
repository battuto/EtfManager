import express from 'express';
import multer from 'multer';
import { getIndexPage, createInvestment, updateInvestment, deleteInvestment, moveInvestmentBetweenPortfolios, exportPortfolioCSV, importPortfolioCSV } from '../controllers/investmentController.js';
import { createPortfolio, updatePortfolio, getPortfolios } from '../controllers/portfolioController.js';
import { getHistoricalPortfolioData, getPortfolioMetrics, getCorrelationAnalysis, getVolatilityAnalysis, getRebalanceRecommendations, getRiskMetrics } from '../controllers/analyticsController.js';
import { createNewAlert, getPortfolioAlerts, getAllActiveAlerts, disableAlert, removeAlert, checkActiveAlerts, getAlertTypes } from '../controllers/alertController.js';
import { getPurchaseHistoryByTicker } from '../models/investment.js';
import { optimizeDatabase } from '../config/database.js';

const router = express.Router();

// Configure multer for CSV upload
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Solo file CSV sono permessi'), false);
        }
    }
});

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

// Advanced Analytics - New Medium Priority Features
router.get('/analytics/correlation/:portfolioId', asyncHandler(getCorrelationAnalysis));
router.get('/analytics/volatility/:portfolioId', asyncHandler(getVolatilityAnalysis));
router.get('/analytics/risk/:portfolioId', asyncHandler(getRiskMetrics));
router.post('/analytics/rebalance/:portfolioId', asyncHandler(getRebalanceRecommendations));

// Export/Import CSV
router.get('/portfolio/:portfolioId/export/csv', asyncHandler(exportPortfolioCSV));
router.post('/portfolio/:portfolioId/import/csv', upload.single('csvFile'), asyncHandler(importPortfolioCSV));

// Alert routes
router.get('/alerts/types', asyncHandler(getAlertTypes));
router.post('/alerts/create', asyncHandler(createNewAlert));
router.get('/alerts/portfolio/:portfolioId', asyncHandler(getPortfolioAlerts));
router.get('/alerts/active', asyncHandler(getAllActiveAlerts));
router.put('/alerts/:alertId/disable', asyncHandler(disableAlert));
router.delete('/alerts/:alertId', asyncHandler(removeAlert));
router.post('/alerts/check', asyncHandler(checkActiveAlerts));

router.post('/system/database/optimize', asyncHandler(async (req, res) => {
    await optimizeDatabase();
    res.json({ success: true, message: 'Database ottimizzato con successo' });
}));

export default router;