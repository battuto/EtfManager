/**
 * @fileoverview Alert Management Controller
 * Handles alert creation, monitoring, and notification management for portfolio alerts
 */

import { 
    createAlert, 
    getAlertsByPortfolio, 
    getActiveAlerts, 
    deactivateAlert, 
    deleteAlert, 
    updateLastTriggered,
    checkAlertCondition,
    ALERT_TYPES,
    CONDITION_TYPES
} from '../models/alert.js';
import { getCurrentPortfolioValue } from '../models/portfolio.js';
import { getAllInvestmentsByPortfolio } from '../models/investment.js';

/**
 * Create a new alert
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function createNewAlert(req, res) {
    try {
        const { portfolio_id, ticker, alert_type, condition_type, threshold_value, message } = req.body;
        
        // Input validation
        if (!portfolio_id || !alert_type || !condition_type || !threshold_value) {
            return res.status(400).json({ 
                success: false, 
                message: 'Required parameters missing' 
            });
        }
        
        // Type validation
        if (!Object.values(ALERT_TYPES).includes(alert_type)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid alert type' 
            });
        }
        
        if (!Object.values(CONDITION_TYPES).includes(condition_type)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid condition type' 
            });
        }
        
        const alert = {
            portfolio_id: parseInt(portfolio_id),
            ticker: ticker || null,
            alert_type,
            condition_type,
            threshold_value: parseFloat(threshold_value),
            message: message || generateDefaultMessage(alert_type, condition_type, threshold_value, ticker)
        };
        
        const result = await createAlert(alert);
        
        res.json({ 
            success: true, 
            message: 'Alert created successfully', 
            alertId: result.lastID 
        });
        
    } catch (error) {
        console.error('🚨 Error creating alert:', error);
        res.status(500).json({ 
            success: false, 
            message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
}

/**
 * Get all alerts for a portfolio
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getPortfolioAlerts(req, res) {
    try {
        const portfolioId = parseInt(req.params.portfolioId);
        
        if (!portfolioId || isNaN(portfolioId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid portfolio ID' 
            });
        }
        
        const alerts = await getAlertsByPortfolio(portfolioId);
        
        res.json({ 
            success: true, 
            alerts 
        });
        
    } catch (error) {
        console.error('📋 Error getting portfolio alerts:', error);
        res.status(500).json({ 
            success: false, 
            message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
}

/**
 * Get all active alerts
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getAllActiveAlerts(req, res) {
    try {
        const alerts = await getActiveAlerts();
        
        res.json({ 
            success: true, 
            alerts 
        });
        
    } catch (error) {
        console.error('📊 Error getting active alerts:', error);
        res.status(500).json({ 
            success: false, 
            message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
}

/**
 * Disable an alert
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function disableAlert(req, res) {
    try {
        const alertId = parseInt(req.params.alertId);
        
        if (!alertId || isNaN(alertId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid alert ID' 
            });
        }
        
        await deactivateAlert(alertId);
        
        res.json({ 
            success: true, 
            message: 'Alert disabled successfully' 
        });
        
    } catch (error) {
        console.error('🔇 Error disabling alert:', error);
        res.status(500).json({ 
            success: false, 
            message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
}

/**
 * Delete an alert
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function removeAlert(req, res) {
    try {
        const alertId = parseInt(req.params.alertId);
        
        if (!alertId || isNaN(alertId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid alert ID' 
            });
        }
        
        await deleteAlert(alertId);
        
        res.json({ 
            success: true, 
            message: 'Alert deleted successfully' 
        });
        
    } catch (error) {
        console.error('🗑️ Error deleting alert:', error);
        res.status(500).json({ 
            success: false, 
            message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
}

/**
 * Check all active alerts and send notifications
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function checkActiveAlerts(req, res) {
    try {
        const alerts = await getActiveAlerts();
        const triggeredAlerts = [];
        
        for (const alert of alerts) {
            const shouldTrigger = await evaluateAlert(alert);
            
            if (shouldTrigger) {
                await updateLastTriggered(alert.id);
                triggeredAlerts.push({
                    id: alert.id,
                    message: alert.message,
                    alert_type: alert.alert_type,
                    portfolio_name: alert.portfolio_name,
                    ticker: alert.ticker
                });
            }
        }
        
        res.json({ 
            success: true, 
            triggeredAlerts,
            message: `Checked ${alerts.length} alerts, ${triggeredAlerts.length} triggered` 
        });
        
    } catch (error) {
        console.error('🔍 Error checking alerts:', error);
        res.status(500).json({ 
            success: false, 
            message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
        });
    }
}

/**
 * Evaluate if an alert should be triggered
 * @param {Object} alert - Alert object to evaluate
 * @returns {Promise<boolean>} Whether the alert should trigger
 * @private
 */
async function evaluateAlert(alert) {
    try {
        let currentValue;
        let portfolioData = null;
        
        switch (alert.alert_type) {
            case ALERT_TYPES.PORTFOLIO_VALUE:
                portfolioData = await getCurrentPortfolioValue(alert.portfolio_id);
                currentValue = portfolioData.currentValue;
                break;
                
            case ALERT_TYPES.PERFORMANCE:
                portfolioData = await getCurrentPortfolioValue(alert.portfolio_id);
                currentValue = portfolioData.currentValue;
                break;
                  
            case ALERT_TYPES.PRICE_TARGET:
                if (!alert.ticker) return false;
                // Here you could integrate with real-time price API
                // For now, use data from portfolio
                const investments = await getAllInvestmentsByPortfolio(alert.portfolio_id);
                const investment = investments.find(inv => inv.ticker === alert.ticker);
                currentValue = investment ? investment.current_price : 0;
                break;
                
            case ALERT_TYPES.REBALANCE:
                // For rebalance alerts, could check last rebalance date
                // or calculate deviation from target allocation
                return false; // Future implementation
                
            default:
                return false;
        }
        
        // Avoid multiple triggers - check if already triggered in last 24 hours
        if (alert.last_triggered) {
            const lastTriggered = new Date(alert.last_triggered);
            const now = new Date();
            const hoursSinceLastTrigger = (now - lastTriggered) / (1000 * 60 * 60);
            
            if (hoursSinceLastTrigger < 24) {
                return false;
            }
        }
        
        return checkAlertCondition(alert, currentValue, portfolioData);
        
    } catch (error) {
        console.error('⚠️ Error evaluating alert:', error);
        return false;
    }
}

/**
 * Generate default message for alert
 * @param {string} alertType - Type of alert
 * @param {string} conditionType - Condition type
 * @param {number} thresholdValue - Threshold value
 * @param {string} ticker - Optional ticker symbol
 * @returns {string} Generated message
 * @private
 */
function generateDefaultMessage(alertType, conditionType, thresholdValue, ticker) {
    const tickerText = ticker ? ` for ${ticker}` : '';
    
    switch (alertType) {
        case ALERT_TYPES.PRICE_TARGET:
            return `Price target ${conditionType === CONDITION_TYPES.ABOVE ? 'exceeded' : 'reached'}: €${thresholdValue}${tickerText}`;
            
        case ALERT_TYPES.PERFORMANCE:
            return `Portfolio performance ${conditionType === CONDITION_TYPES.ABOVE ? 'above' : 'below'} ${thresholdValue}%`;
            
        case ALERT_TYPES.PORTFOLIO_VALUE:
            return `Portfolio value ${conditionType === CONDITION_TYPES.ABOVE ? 'above' : 'below'} €${thresholdValue}`;
            
        case ALERT_TYPES.REBALANCE:
            return `Portfolio rebalance reminder`;
            
        default:
            return `Alert ${conditionType} ${thresholdValue}${tickerText}`;
    }
}

/**
 * Get available alert types
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function getAlertTypes(req, res) {
    res.json({
        success: true,
        alertTypes: ALERT_TYPES,
        conditionTypes: CONDITION_TYPES
    });
}
