import { get, getAll, runQuery } from '../config/database.js';

export function getPortfolioById(id) {
    return get('SELECT id, name, description, created_at FROM portfolios WHERE id = ?', [id])
        .then(row => {
            if (row) return row;
            // Se non trova il portfolio richiesto, ritorna il portfolio default (id=1)
            return get('SELECT id, name, description, created_at FROM portfolios WHERE id = 1');
        })
        .then(portfolio => {
            if (!portfolio) throw new Error('Portfolio non trovato');
            return portfolio;
        });
}

export function getPortfolios() {
    return getAll('SELECT id, name, description, created_at FROM portfolios ORDER BY id');
}

export function createPortfolio(portfolio) {
    const { name, description } = portfolio;
    return runQuery('INSERT INTO portfolios (name, description) VALUES (?, ?)', [name, description])
        .then(result => result.lastID);
}

export function updatePortfolio(id, portfolio) {
    const { name, description } = portfolio;
    return runQuery('UPDATE portfolios SET name = ?, description = ? WHERE id = ?', [name, description, id])
        .then(result => result.changes);
}