/**
 * @fileoverview Main JavaScript Application
 * Handles ETF Portfolio Manager frontend functionality including UI interactions,
 * data visualization, and investment management operations
 */

document.addEventListener('DOMContentLoaded', function () {
    // Application initialization
    initializeDatePickers();
    initializeTooltips();
    initializeThemeToggle();
    initializeTableActions();

    // Asynchronous chart loading
    if (document.getElementById('compositionChart')) {
        loadAnalyticsCharts();
    }

    // Investment form event listeners
    setupInvestmentForm();
});

/**
 * Initialize date picker inputs with default current date
 */
function initializeDatePickers() {
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = new Date().toISOString().split('T')[0];
        }
    });
}

/**
 * Initialize Bootstrap tooltips with custom delay
 */
function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl, {
            delay: { show: 500, hide: 100 }
        });
    });
}

/**
 * Manage light/dark theme toggle functionality
 */
function initializeThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        // Apply saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="bi bi-sun"></i> Light Mode';
        }

        // Handle theme toggle click
        themeToggle.addEventListener('click', function () {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');

            if (isDarkMode) {
                this.innerHTML = '<i class="bi bi-sun"></i> Light Mode';
                localStorage.setItem('theme', 'dark');
            } else {
                this.innerHTML = '<i class="bi bi-moon-stars"></i> Dark Mode';
                localStorage.setItem('theme', 'light');
            }

            // Update charts to adapt to theme
            if (window.portfolioCharts) {
                setTimeout(() => {
                    if (window.compositionChart) window.compositionChart.update();
                    if (window.performanceChart) window.performanceChart.update();
                    if (window.timelineChart) window.timelineChart.update();
                    if (window.allocationChart) window.allocationChart.update();
                }, 100);
            }
        });
    }
}

/**
 * Initialize table actions and interactions
 */
function initializeTableActions() {
    // Portfolio selector
    const portfolioSelector = document.getElementById('portfolioSelect');
    if (portfolioSelector) {
        portfolioSelector.addEventListener('change', function() {
            window.location.href = `/?portfolio=${this.value}`;
        });
    }

    // Setup various table functionalities
    setupHistoryToggle();
    setupEditButtons();
    setupDeleteButtons();
    setupMoveButtons();
}

/**
 * Setup purchase history toggle functionality
 */
function setupHistoryToggle() {
    document.querySelectorAll('.toggle-history').forEach(btn => {
        btn.addEventListener('click', async function (e) {
            e.preventDefault();
            const row = this.closest('tr');
            const ticker = row.dataset.ticker;
            const icon = this.querySelector('i');

            // Toggle icon
            if (icon.classList.contains('bi-chevron-down')) {
                icon.classList.replace('bi-chevron-down', 'bi-chevron-up');

                // Show loading indicator
                const loadingRow = document.createElement('tr');
                loadingRow.className = 'loading-row';
                loadingRow.innerHTML = `
                <td colspan="9" class="text-center py-3">
                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <span class="ms-2">Loading details...</span>
                </td>
            `;
                row.parentNode.insertBefore(loadingRow, row.nextSibling);

                // Load data with exponential backoff for error handling
                let retries = 3;
                let delay = 1000;

                const fetchHistory = async () => {
                    try {
                        const portfolioId = document.getElementById('portfolioSelect')?.value || 1;
                        const response = await fetch(`/investments/history/${portfolioId}/${ticker}`);

                        if (!response.ok) {
                            throw new Error(`HTTP Error: ${response.status}`);
                        }

                        const data = await response.json();

                        // Remove loading row
                        loadingRow.remove();                        if (data.success && data.history.length > 0) {
                            // Create history row
                            const historyRow = document.createElement('tr');
                            historyRow.className = 'history-row purchase-details-row';
                            historyRow.innerHTML = createHistoryRowHTML(data.history, ticker);

                            // Insert after current row
                            row.parentNode.insertBefore(historyRow, row.nextSibling);
                        } else {
                            // No data available
                            showNoDataRow(row, 'No details available for this ETF');
                        }
                    } catch (error) {
                        console.error('📊 Error loading history:', error);

                        if (retries > 0) {
                            retries--;
                            await new Promise(resolve => setTimeout(resolve, delay));
                            delay *= 2; // Exponential backoff
                            return fetchHistory();
                        }

                        // Remove loading row and show error
                        loadingRow.remove();
                        showNoDataRow(row, 'Error loading data', true);
                    }
                };

                fetchHistory();
            } else {
                icon.classList.replace('bi-chevron-up', 'bi-chevron-down');

                // Remove all history rows
                const nextRow = row.nextElementSibling;
                if (nextRow && (nextRow.classList.contains('history-row') || nextRow.classList.contains('loading-row'))) {
                    nextRow.remove();
                }
            }
        });
    });
}

/**
 * Create HTML for history row display
 * @param {Array} history - Array of historical data
 * @param {string} ticker - ETF ticker symbol
 * @returns {string} HTML string for the history row
 */
function createHistoryRowHTML(history, ticker) {
    return `
        <td colspan="9" class="p-0">
            <div class="bg-light border-top">
                <div class="p-3">
                    <h6 class="mb-3">Purchase Details for ${ticker}</h6>
                    <table class="table table-sm mb-0">
                        <thead>
                            <tr>
                                <th>Purchase Date</th>
                                <th>Shares</th>
                                <th>Purchase Price</th>
                                <th>Invested Value</th>
                                <th>Current Price</th>
                                <th>Current Value</th>
                                <th>Variation</th>
                                <th>Deviation</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${history.map(item => `
                                <tr>
                                    <td>${new Date(item.buy_date).toLocaleDateString('it-IT')}</td>
                                    <td>${item.shares}</td>
                                    <td>${item.buy_price.toFixed(2)}€</td>
                                    <td>${(item.buy_price * item.shares).toFixed(2)}€</td>
                                    <td>${item.current_price ? item.current_price.toFixed(2) + '€' : 'N/D'}</td>
                                    <td>${item.current_value ? item.current_value.toFixed(2) + '€' : 'N/D'}</td>
                                    <td class="${item.profit_loss >= 0 ? 'text-success' : 'text-danger'}">
                                        ${item.profit_loss >= 0 ? '+' : ''}${item.profit_loss.toFixed(2)}€
                                        (${item.profit_loss >= 0 ? '+' : ''}${item.percent_change.toFixed(2)}%)
                                    </td>
                                    <td class="${item.price_deviation <= 0 ? 'text-success' : 'text-danger'}">
                                        ${item.price_deviation <= 0 ? '+' : ''}${(-item.price_deviation).toFixed(2)}€
                                        (${item.price_deviation <= 0 ? '+' : ''}${(-item.price_deviation_percent).toFixed(2)}%)
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </td>
    `;
}

/**
 * Show "no data" row for empty results
 * @param {HTMLElement} row - Table row element
 * @param {string} message - Message to display
 * @param {boolean} isError - Whether this is an error state
 */
function showNoDataRow(row, message, isError = false) {
    const noDataRow = document.createElement('tr');
    noDataRow.className = 'history-row bg-light';
    noDataRow.innerHTML = `
        <td colspan="9" class="text-center py-3">
            <i class="bi bi-${isError ? 'exclamation-triangle-fill text-danger' : 'exclamation-circle text-warning'} me-2"></i>
            ${message}
        </td>
    `;
    row.parentNode.insertBefore(noDataRow, row.nextSibling);
}

/**
 * Setup edit buttons for investment modifications
 */
function setupEditButtons() {
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const row = this.closest('tr');
            const id = row.dataset.investmentId;
            const ticker = row.querySelector('td:first-child').textContent.trim();
            const shares = parseFloat(row.cells[1].textContent);
            const buyPrice = parseFloat(row.cells[2].textContent);
            const buyDate = new Date(row.cells[3].textContent.split('/').reverse().join('-'));

            Swal.fire({
                title: 'Modifica Investimento',
                html: `
                    <div class="mb-3">
                        <label class="form-label">Ticker</label>
                        <input id="editTicker" class="form-control" value="${ticker}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Quote</label>
                        <input id="editShares" type="number" step="1" min="1" class="form-control" value="${shares}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Prezzo d'acquisto</label>
                        <input id="editBuyPrice" type="number" step="0.01" min="0.01" class="form-control" value="${buyPrice}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Data d'acquisto</label>
                        <input id="editBuyDate" type="date" class="form-control" value="${buyDate.toISOString().split('T')[0]}">
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'Salva',
                cancelButtonText: 'Annulla',
                preConfirm: () => {
                    const ticker = document.getElementById('editTicker').value;
                    const shares = document.getElementById('editShares').value;
                    const buyPrice = document.getElementById('editBuyPrice').value;
                    const buyDate = document.getElementById('editBuyDate').value;

                    if (!ticker || !shares || !buyPrice || !buyDate) {
                        Swal.showValidationMessage('Tutti i campi sono obbligatori');
                        return false;
                    }

                    return { ticker, shares, buy_price: buyPrice, buy_date: buyDate };
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    showLoadingOverlay();

                    fetch('/investments/' + id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(result.value)
                    })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                window.location.reload();
                            } else {
                                hideLoadingOverlay();
                                Swal.fire('Errore', data.error || 'Si è verificato un errore', 'error');
                            }
                        })
                        .catch(error => {
                            hideLoadingOverlay();
                            console.error('Errore nell\'aggiornamento:', error);
                            Swal.fire('Errore', 'Si è verificato un errore di rete', 'error');
                        });
                }
            });
        });
    });
}

/**
 * Setup delete buttons for investment removal
 */
function setupDeleteButtons() {
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const row = this.closest('tr');
            const id = row.dataset.investmentId;
            const ticker = row.querySelector('td:first-child').textContent.trim();

            Swal.fire({
                title: 'Conferma eliminazione',
                text: 'Sei sicuro di voler eliminare ' + ticker + ' dal portfolio?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Elimina',
                cancelButtonText: 'Annulla',
                confirmButtonColor: '#d33'
            }).then((result) => {
                if (result.isConfirmed) {
                    showLoadingOverlay();

                    fetch('/investments/' + id, { method: 'DELETE' })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                window.location.reload();
                            } else {
                                hideLoadingOverlay();
                                Swal.fire('Errore', data.error || 'Si è verificato un errore', 'error');
                            }
                        })
                        .catch(error => {
                            hideLoadingOverlay();
                            console.error('Errore nell\'eliminazione:', error);
                            Swal.fire('Errore', 'Si è verificato un errore di rete', 'error');
                        });
                }
            });
        });
    });
}

/**
 * Setup move buttons for portfolio transfers
 */
function setupMoveButtons() {
    document.querySelectorAll('.move-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const row = this.closest('tr');
            const id = row.dataset.investmentId;
            const ticker = row.querySelector('td:first-child').textContent.trim();

            showLoadingOverlay('Caricamento portfolios...');

            fetch('/portfolios')
                .then(response => response.json())
                .then(data => {
                    hideLoadingOverlay();

                    if (data.success) {
                        // Usa i parametri URL invece della variabile EJS
                        const urlParams = new URLSearchParams(window.location.search);
                        const currentPortfolioId = parseInt(urlParams.get('portfolio') || 1);
                        const portfolios = data.portfolios.filter(p => p.id !== currentPortfolioId);

                        if (portfolios.length > 0) {
                            showMoveDialog(portfolios, id, ticker);
                        } else {
                            Swal.fire({
                                title: 'Nessun portfolio disponibile',
                                text: 'Devi creare altri portfolio per poter spostare questo investimento.',
                                icon: 'info',
                                confirmButtonText: 'Ok'
                            });
                        }
                    } else {
                        Swal.fire('Errore', 'Errore nel caricamento dei portfolios', 'error');
                    }
                })
                .catch(error => {
                    hideLoadingOverlay();
                    console.error('Errore nel recupero portfolios:', error);
                    Swal.fire('Errore', 'Si è verificato un errore di rete', 'error');
                });
        });
    });
}

/**
 * Show move dialog for investment transfer
 * @param {Array} portfolios - Available portfolios
 * @param {number} investmentId - Investment ID to move
 * @param {string} ticker - ETF ticker symbol
 */
function showMoveDialog(portfolios, investmentId, ticker) {
    let options = '';
    portfolios.forEach(p => {
        options += '<option value="' + p.id + '">' + p.name + '</option>';
    });

    Swal.fire({
        title: 'Sposta Investimento',
        html: `
            <p>Sposta ${ticker} in un altro portfolio:</p>
            <select id="targetPortfolio" class="form-select">
                ${options}
            </select>
        `,
        showCancelButton: true,
        confirmButtonText: 'Sposta',
        cancelButtonText: 'Annulla'
    }).then((result) => {
        if (result.isConfirmed) {
            const targetPortfolioId = document.getElementById('targetPortfolio').value;
            showLoadingOverlay('Spostamento in corso...');

            fetch('/investments/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ investmentId, targetPortfolioId })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.reload();
                    } else {
                        hideLoadingOverlay();
                        Swal.fire('Errore', data.error || 'Si è verificato un errore', 'error');
                    }
                })
                .catch(error => {
                    hideLoadingOverlay();
                    console.error('Errore nello spostamento:', error);
                    Swal.fire('Errore', 'Si è verificato un errore di rete', 'error');
                });
        }
    });
}

/**
 * Setup investment form for new additions
 */
function setupInvestmentForm() {
    const form = document.getElementById('addInvestmentForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            Swal.fire({
                title: 'Confermare?',
                text: 'Vuoi aggiungere questo investimento al tuo portfolio?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Aggiungi',
                cancelButtonText: 'Annulla'
            }).then((result) => {
                if (result.isConfirmed) {
                    showLoadingOverlay('Aggiunta investimento...');
                    this.submit();
                }
            });
        });
    }
}

/**
 * Load analytics charts asynchronously
 */
function loadAnalyticsCharts() {
    const portfolioId = document.getElementById('portfolioSelect')?.value || 1;

    if (!window.portfolioCharts && window.investmentsData) {
        window.portfolioCharts = new PortfolioCharts(window.investmentsData);

        // Rendering dei grafici base
        window.compositionChart = window.portfolioCharts.renderCompositionChart('compositionChart');
        window.performanceChart = window.portfolioCharts.renderPerformanceChart('performanceChart');
    }

    // Carica dati storici in modo asincrono
    loadHistoricalData(portfolioId);

    // Carica metriche avanzate in modo asincrono
    loadPortfolioMetrics(portfolioId);
}

/**
 * Load historical data for timeline chart
 * @param {number} portfolioId - Portfolio ID
 */
function loadHistoricalData(portfolioId) {
    const timelineContainer = document.getElementById('timelineChart')?.closest('.card-body');
    if (timelineContainer) {
        // Mostra loader
        timelineContainer.classList.add('loading');
        timelineContainer.insertAdjacentHTML('beforeend', '<div class="chart-loading-indicator"><div class="spinner-border text-primary" role="status"></div></div>');

        fetch('/analytics/historical/' + portfolioId + '?days=30')
            .then(response => response.json())
            .then(data => {
                timelineContainer.classList.remove('loading');
                timelineContainer.querySelector('.chart-loading-indicator')?.remove();

                if (data.success) {
                    window.timelineChart = window.portfolioCharts.renderTimelineChart('timelineChart', data.data);
                }
            })
            .catch(error => {
                console.error('Errore nel recupero dei dati storici:', error);
                timelineContainer.classList.remove('loading');
                timelineContainer.querySelector('.chart-loading-indicator')?.remove();
            });
    }
}

/**
 * Load portfolio metrics for allocation chart
 * @param {number} portfolioId - Portfolio ID
 */
function loadPortfolioMetrics(portfolioId) {
    const metricsContainer = document.getElementById('allocationChart')?.closest('.card-body');
    if (metricsContainer) {
        // Mostra loader
        metricsContainer.classList.add('loading');
        metricsContainer.insertAdjacentHTML('beforeend', '<div class="chart-loading-indicator"><div class="spinner-border text-primary" role="status"></div></div>');

        fetch('/analytics/metrics/' + portfolioId)
            .then(response => response.json())
            .then(data => {
                metricsContainer.classList.remove('loading');
                metricsContainer.querySelector('.chart-loading-indicator')?.remove();

                if (data.success) {
                    window.allocationChart = window.portfolioCharts.renderAllocationChart('allocationChart', data.analytics);

                    // Aggiorna indicatori metriche
                    updateMetricsIndicators(data.analytics);
                }
            })
            .catch(error => {
                console.error('Errore nel recupero delle metriche:', error);
                metricsContainer.classList.remove('loading');
                metricsContainer.querySelector('.chart-loading-indicator')?.remove();
            });
    }
}

/**
 * Update metrics indicators display
 * @param {Object} analytics - Analytics data
 */
function updateMetricsIndicators(analytics) {
    const diversificationIndicator = document.getElementById('diversificationIndicator');
    if (diversificationIndicator) {
        diversificationIndicator.textContent = analytics.metrics.diversification.toFixed(0) + '%';

        // Imposta colore in base al valore
        if (analytics.metrics.diversification > 75) {
            diversificationIndicator.className = 'badge bg-success';
        } else if (analytics.metrics.diversification > 50) {
            diversificationIndicator.className = 'badge bg-warning';
        } else {
            diversificationIndicator.className = 'badge bg-danger';
        }
    }
}

/**
 * Show loading overlay with optional message
 * @param {string} message - Loading message to display
 */
function showLoadingOverlay(message = 'Caricamento...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.innerHTML = `
            <div class="overlay-content">
                <div class="spinner-border text-light" role="status"></div>
                <span id="loadingMessage">${message}</span>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        document.getElementById('loadingMessage').textContent = message;
        overlay.style.display = 'flex';
    }
}

/**
 * Hide loading overlay
 */
function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Gestisci animazioni
(function() {
    // Aggiungi classe 'loaded' al body per le animazioni di caricamento
    document.body.classList.add('loaded');

    // Gestisci animazioni elements quando diventano visibili
    if ('IntersectionObserver' in window) {
        const animateElements = document.querySelectorAll('.animate-on-scroll');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animated');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        animateElements.forEach(el => observer.observe(el));
    } else {
        // Fallback per browser che non supportano IntersectionObserver
        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            el.classList.add('animated');
        });
    }
})();
