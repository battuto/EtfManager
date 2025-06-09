import { getInvestmentsWithCurrentPrice, addInvestment, moveInvestment } from '../models/investment.js';
import { getPortfolios, getPortfolioById } from './portfolioController.js';
import { updateInvestment as updateInvestmentModel, deleteInvestment as deleteInvestmentModel } from '../models/investment.js';

export async function getIndexPage(req, res) {
    try {
        // Determina il portfolio selezionato (predefinito = 1)
        const portfolioId = parseInt(req.query.portfolio || 1);

        // Ottieni il portfolio corrente
        const currentPortfolio = await getPortfolioById(portfolioId);

        // Ottieni tutti i portfolios per il selettore
        const portfolios = await getPortfolios();

        // Ottieni investimenti per questo portfolio
        const investments = await getInvestmentsWithCurrentPrice(portfolioId);

        // Calcola totali
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
        console.error('Errore:', error);
        res.status(500).render('error', { message: 'Errore interno del server' });
    }
}

export async function moveInvestmentBetweenPortfolios(req, res) {
    try {
        const { investmentId, targetPortfolioId } = req.body;
        await moveInvestment(investmentId, targetPortfolioId);
        res.json({ success: true });
    } catch (error) {
        console.error('Errore nello spostamento dell\'investimento:', error);
        res.status(500).json({ success: false, error: 'Errore interno del server' });
    }
}

export async function createInvestment(req, res) {
    try {
        const { ticker, shares, buy_price, buy_date } = req.body;
        await addInvestment({ ticker, shares, buy_price, buy_date });
        res.redirect('/');
    } catch (error) {
        console.error('Errore nell\'aggiunta dell\'investimento:', error);
        res.status(500).render('error', { message: 'Errore nell\'aggiunta dell\'investimento' });
    }
}

export async function updateInvestment(req, res) {
    try {
        // Verifica della validità dei dati
        console.log('Update request body:', req.body);
        console.log('Update request params:', req.params);

        if (!req.body || Object.keys(req.body).length === 0) {
            throw new Error('Dati di aggiornamento mancanti');
        }

        const { ticker, shares, buy_price, buy_date } = req.body;
        const id = req.params.id;

        if (!id) {
            throw new Error('ID investimento mancante');
        }

        await updateInvestmentModel(id, { ticker, shares, buy_price, buy_date });
        res.json({ success: true });
    } catch (error) {
        console.error('Errore nell\'aggiornamento dell\'investimento:', error);
        res.status(500).json({ success: false, error: error.message || 'Errore interno del server' });
    }
}

export async function deleteInvestment(req, res) {
    try {
        // Log per debug
        console.log('Delete request params:', req.params);

        const id = req.params.id;

        if (!id) {
            throw new Error('ID investimento mancante');
        }

        console.log(`Eliminazione investimento con ID: ${id}`);
        await deleteInvestmentModel(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Errore nell\'eliminazione dell\'investimento:', error);
        res.status(500).json({ success: false, error: error.message || 'Errore interno del server' });
    }
}