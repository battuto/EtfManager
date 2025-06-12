/**
 * @fileoverview Investment Management Controller
 * Handles all investment-related operations including CRUD operations, portfolio management, and data import/export
 */

import { getInvestmentsWithCurrentPrice, addInvestment, moveInvestment } from '../models/investment.js';
import { getPortfolios, getPortfolioById } from './portfolioController.js';
import { updateInvestment as updateInvestmentModel, deleteInvestment as deleteInvestmentModel } from '../models/investment.js';

/**
 * Render the main index page with portfolio data and investments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getIndexPage(req, res) {
    try {
        // Allow both authenticated and guest users
        const isAuthenticated = req.session && req.session.user;
        
        // Determine selected portfolio (default = 1 for guest)
        const portfolioId = parseInt(req.query.portfolio || 1);        // Get current portfolio
        const currentPortfolio = await getPortfolioById(portfolioId);

        // Get user ID from session
        const userId = req.session?.user?.id || null;

        // Get all portfolios for user (or guest portfolios if not authenticated)
        const portfolios = await getPortfolios(userId);

        // Get investments for this portfolio
        const investments = await getInvestmentsWithCurrentPrice(portfolioId);

        // Calculate totals
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

        res.render('index', {
            investments,
            totalInvested,
            totalCurrentValue,
            totalProfit,
            totalPercentChange,
            currentPortfolio,
            portfolios
        });
    } catch (error) {
        console.error('💼 Error loading index page:', error);
        res.status(500).render('error', { 
            message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message 
        });
    }
}

/**
 * Move investment between portfolios
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function moveInvestmentBetweenPortfolios(req, res) {
    try {
        const { investmentId, targetPortfolioId } = req.body;

        if (!investmentId || !targetPortfolioId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Investment ID and target portfolio ID are required' 
            });
        }

        await moveInvestment(investmentId, targetPortfolioId);
        res.json({ success: true });
    } catch (error) {
        console.error('📦 Error moving investment:', error);
        res.status(500).json({ 
            success: false, 
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message 
        });
    }
}

/**
 * Create a new investment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function createInvestment(req, res) {
    try {
        const { ticker, shares, buy_price, buy_date, portfolio_id } = req.body;

        // Validate required fields
        if (!ticker || !shares || !buy_price || !buy_date) {
            return res.status(400).render('error', { 
                message: 'All fields are required: ticker, shares, buy_price, buy_date' 
            });
        }

        // Get user ID from session
        const userId = req.session?.user?.id || null;

        await addInvestment({ 
            ticker, 
            shares, 
            buy_price, 
            buy_date, 
            portfolio_id: portfolio_id || 1 
        }, userId);
        
        res.redirect('/');
    } catch (error) {
        console.error('💰 Error creating investment:', error);
        res.status(500).render('error', { 
            message: process.env.NODE_ENV === 'production' ? 'Error adding investment' : error.message 
        });
    }
}

/**
 * Update an existing investment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function updateInvestment(req, res) {
    try {
        // Validate request data
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Update data is missing'
            });
        }

        const { ticker, shares, buy_price, buy_date } = req.body;
        const id = req.params.id;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Investment ID is missing'
            });
        }

        // Validate required fields
        if (!ticker || !shares || !buy_price || !buy_date) {
            return res.status(400).json({
                success: false,
                error: 'All fields are required: ticker, shares, buy_price, buy_date'
            });
        }

        await updateInvestmentModel(id, { ticker, shares, buy_price, buy_date });
        res.json({ success: true });
    } catch (error) {
        console.error('✏️ Error updating investment:', error);
        res.status(500).json({ 
            success: false, 
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message 
        });
    }
}

/**
 * Delete an investment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function deleteInvestment(req, res) {
    try {
        const id = req.params.id;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Investment ID is missing'
            });
        }

        await deleteInvestmentModel(id);
        res.json({ success: true });
    } catch (error) {
        console.error('🗑️ Error deleting investment:', error);
        res.status(500).json({ 
            success: false, 
            error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message 
        });
    }
}

/**
 * Export portfolio data to CSV format
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function exportPortfolioCSV(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        
        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid portfolio ID'
            });
        }
        
        // Get portfolio info
        const portfolio = await getPortfolioById(portfolioId);
        
        if (!portfolio) {
            return res.status(404).json({
                success: false,
                error: 'Portfolio not found'
            });
        }
        
        // Get investments with current prices
        const investments = await getInvestmentsWithCurrentPrice(portfolioId);
        
        // Create CSV header
        const csvHeader = 'Ticker,Shares,Buy_Price,Buy_Date,Current_Price,Current_Value,Profit_Loss,Percent_Change\n';
        
        // Create CSV rows
        const csvRows = investments.map(inv => {
            const buyDate = new Date(inv.buy_date).toLocaleDateString('en-US');
            const currentPrice = inv.current_price ? inv.current_price.toFixed(2) : 'N/A';
            const currentValue = inv.current_value ? inv.current_value.toFixed(2) : 'N/A';
            const profitLoss = inv.profit_loss ? inv.profit_loss.toFixed(2) : '0.00';
            const percentChange = inv.percent_change ? inv.percent_change.toFixed(2) : '0.00';
            
            return `${inv.ticker},${inv.shares},${inv.buy_price.toFixed(2)},${buyDate},${currentPrice},${currentValue},${profitLoss},${percentChange}`;
        }).join('\n');
        
        const csvContent = csvHeader + csvRows;
        
        // Set response headers for CSV download
        const filename = `portfolio_${portfolio.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        // Add BOM for Excel compatibility
        res.write('\uFEFF');
        res.end(csvContent);
        
    } catch (error) {
        console.error('📄 Error exporting CSV:', error);
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'production' ? 'Error exporting data' : error.message
        });
    }
}

/**
 * Import portfolio data from CSV file
 * @param {Object} req - Express request object (with file upload)
 * @param {Object} res - Express response object
 */
export async function importPortfolioCSV(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        
        if (isNaN(portfolioId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid portfolio ID'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No CSV file provided'
            });
        }
        
        const csvContent = req.file.buffer.toString('utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Empty or invalid CSV file'
            });
        }
        
        // Skip header
        const dataLines = lines.slice(1);
        let importedCount = 0;
        let errors = [];
        
        for (let i = 0; i < dataLines.length; i++) {
            try {
                const columns = dataLines[i].split(',');
                
                if (columns.length < 4) {
                    errors.push(`Row ${i + 2}: Invalid format`);
                    continue;
                }
                
                const [ticker, shares, buyPrice, buyDate] = columns;
                
                if (!ticker || !shares || !buyPrice || !buyDate) {
                    errors.push(`Row ${i + 2}: Required fields missing`);
                    continue;
                }

                // Convert date from various formats to ISO
                let isoDate;
                if (buyDate.includes('/')) {
                    const dateParts = buyDate.split('/');
                    // Handle both MM/DD/YYYY and DD/MM/YYYY formats
                    if (dateParts[2].length === 4) {
                        // Assume MM/DD/YYYY or DD/MM/YYYY
                        isoDate = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
                    } else {
                        errors.push(`Row ${i + 2}: Invalid date format`);
                        continue;
                    }
                } else {
                    isoDate = buyDate; // Assume already in ISO format
                }
                
                await addInvestment({
                    ticker: ticker.trim().toUpperCase(),
                    shares: parseInt(shares),
                    buy_price: parseFloat(buyPrice),
                    buy_date: isoDate,
                    portfolio_id: portfolioId
                });
                
                importedCount++;
                
            } catch (error) {
                errors.push(`Row ${i + 2}: ${error.message}`);
            }
        }
        
        res.json({
            success: true,
            imported: importedCount,
            errors: errors,
            message: `Imported ${importedCount} investments${errors.length > 0 ? ` with ${errors.length} errors` : ''}`
        });
        
    } catch (error) {
        console.error('📥 Error importing CSV:', error);
        res.status(500).json({
            success: false,
            error: process.env.NODE_ENV === 'production' ? 'Error importing data' : error.message
        });
    }
}