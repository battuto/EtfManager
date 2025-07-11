/**
 * @fileoverview Portfolio Management Controller
 * Handles portfolio CRUD operations and portfolio-related data management
 */

import { get, getAll, runQuery } from '../config/database.js';

/**
 * Get portfolio by ID with fallback to default portfolio
 * @param {number} id - Portfolio ID
 * @returns {Promise<Object>} Portfolio data object
 */
export function getPortfolioById(id) {
    return get('SELECT id, name, description, created_at FROM portfolios WHERE id = ?', [id])
        .then(row => {
            if (row) return row;
            // If requested portfolio not found, return default portfolio (id=1)
            return get('SELECT id, name, description, created_at FROM portfolios WHERE id = 1');
        })
        .then(portfolio => {
            if (!portfolio) {
                throw new Error('Portfolio not found');
            }
            return portfolio;
        })
        .catch(error => {
            console.error('📁 Error getting portfolio by ID:', error);
            throw error;
        });
}

/**
 * Get all portfolios for a specific user
 * @param {number} userId - User ID (null for guest portfolios)
 * @returns {Promise<Array>} Array of portfolio objects
 */
export function getPortfolios(userId = null) {
    let query, params;
    
    if (userId) {
        // Get portfolios for authenticated user
        query = 'SELECT id, name, description, created_at FROM portfolios WHERE user_id = ? ORDER BY id';
        params = [userId];
    } else {
        // Get guest portfolios (user_id IS NULL)
        query = 'SELECT id, name, description, created_at FROM portfolios WHERE user_id IS NULL ORDER BY id';
        params = [];
    }
    
    return getAll(query, params)
        .catch(error => {
            console.error('📂 Error getting portfolios:', error);
            throw error;
        });
}

/**
 * Create a new portfolio for a specific user
 * @param {Object} portfolio - Portfolio data object
 * @param {string} portfolio.name - Portfolio name
 * @param {string} portfolio.description - Portfolio description
 * @param {number} userId - User ID (null for guest portfolio)
 * @returns {Promise<number>} ID of the created portfolio
 */
export function createPortfolio(portfolio, userId = null) {
    const { name, description } = portfolio;
    
    if (!name || name.trim() === '') {
        throw new Error('Portfolio name is required');
    }
    
    return runQuery(
        'INSERT INTO portfolios (name, description, user_id) VALUES (?, ?, ?)', 
        [name.trim(), description || '', userId]
    )
        .then(result => {
            console.log('✅ Portfolio created successfully with ID:', result.lastID);
            return result.lastID;
        })
        .catch(error => {
            console.error('❌ Error creating portfolio:', error);
            throw error;
        });
}

/**
 * Update an existing portfolio
 * @param {number} id - Portfolio ID
 * @param {Object} portfolio - Portfolio data object
 * @param {string} portfolio.name - Portfolio name
 * @param {string} portfolio.description - Portfolio description
 * @returns {Promise<number>} Number of affected rows
 */
export function updatePortfolio(id, portfolio) {
    const { name, description } = portfolio;
    
    if (!name || name.trim() === '') {
        throw new Error('Portfolio name is required');
    }
    
    if (!id || isNaN(id)) {
        throw new Error('Valid portfolio ID is required');
    }
    
    return runQuery('UPDATE portfolios SET name = ?, description = ? WHERE id = ?', [name.trim(), description || '', id])
        .then(result => {
            console.log(`✏️ Portfolio ${id} updated, ${result.changes} rows affected`);
            return result.changes;
        })
        .catch(error => {
            console.error('❌ Error updating portfolio:', error);
            throw error;
        });
}

/**
 * Delete a portfolio (with validation)
 * @param {number} id - Portfolio ID
 * @returns {Promise<number>} Number of affected rows
 */
export function deletePortfolio(id) {
    if (!id || isNaN(id)) {
        throw new Error('Valid portfolio ID is required');
    }
    
    // Prevent deletion of default portfolio
    if (id === 1) {
        throw new Error('Cannot delete default portfolio');
    }
    
    return runQuery('DELETE FROM portfolios WHERE id = ?', [id])
        .then(result => {
            console.log(`🗑️ Portfolio ${id} deleted, ${result.changes} rows affected`);
            return result.changes;
        })
        .catch(error => {
            console.error('❌ Error deleting portfolio:', error);
            throw error;
        });
}