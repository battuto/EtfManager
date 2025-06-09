document.addEventListener('DOMContentLoaded', function () {
    // Inizializzazione
    initializeDatePickers();
    initializeTooltips();
    initializeThemeToggle();
    initializeTableActions();

    // Gestione cache browser per migliorare performance
    setupCacheManagement();

    // Caricamento asincrono dei grafici
    if (document.getElementById('compositionChart')) {
        loadAnalyticsCharts();
    }

    // Event listeners per il form di aggiunta investimento
    setupInvestmentForm();
});

// Inizializza i date picker
function initializeDatePickers() {
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = new Date().toISOString().split('T')[0];
        }
    });
}

// Inizializza i tooltip Bootstrap
function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl, {
            delay: { show: 500, hide: 100 }
        });
    });
}

// Gestione tema chiaro/scuro
function initializeThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        // Applica tema salvato
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.innerHTML = '<i class="bi bi-sun"></i> Modalità chiara';
        }

        // Gestisci click sul pulsante del tema
        themeToggle.addEventListener('click', function () {
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');

            if (isDarkMode) {
                this.innerHTML = '<i class="bi bi-sun"></i> Modalità chiara';
                localStorage.setItem('theme', 'dark');
            } else {
                this.innerHTML = '<i class="bi bi-moon-stars"></i> Modalità scura';
                localStorage.setItem('theme', 'light');
            }

            // Aggiorna grafici per adattarli al tema
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

// Inizializza le azioni per la tabella degli investimenti
function initializeTableActions() {
    // Portfolio selector
    const portfolioSelector = document.getElementById('portfolioSelect');
    if (portfolioSelector) {
        portfolioSelector.addEventListener('change', function() {
            window.location.href = `/?portfolio=${this.value}`;
        });
    }

    // Gestione espansione cronologia acquisti
    setupHistoryToggle();

    // Setup CRUD operations
    setupEditButtons();
    setupDeleteButtons();
    setupMoveButtons();
}

// Gestione espansione cronologia acquisti
function setupHistoryToggle() {
    document.querySelectorAll('.toggle-history').forEach(btn => {
        btn.addEventListener('click', async function (e) {
            e.preventDefault();
            const row = this.closest('tr');
            const ticker = row.dataset.ticker;
            const icon = this.querySelector('i');

            // Alterna icona
            if (icon.classList.contains('bi-chevron-down')) {
                icon.classList.replace('bi-chevron-down', 'bi-chevron-up');

                // Mostra indicatore di caricamento
                const loadingRow = document.createElement('tr');
                loadingRow.className = 'loading-row';
                loadingRow.innerHTML = `
                <td colspan="9" class="text-center py-3">
                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <span class="ms-2">Caricamento dettagli...</span>
                </td>
            `;
                row.parentNode.insertBefore(loadingRow, row.nextSibling);

                // Carica dati con exponential backoff per gestire errori
                let retries = 3;
                let delay = 1000;

                const fetchHistory = async () => {
                    try {
                        const portfolioId = document.getElementById('portfolioSelect')?.value || 1;
                        const response = await fetch(`/investments/history/${portfolioId}/${ticker}`);

                        if (!response.ok) {
                            throw new Error(`Errore HTTP: ${response.status}`);
                        }

                        const data = await response.json();

                        // Rimuovi riga di caricamento
                        loadingRow.remove();

                        if (data.success && data.history.length > 0) {
                            // Crea riga per la cronologia
                            const historyRow = document.createElement('tr');
                            historyRow.className = 'history-row purchase-details-row';
                            historyRow.innerHTML = createHistoryRowHTML(data.history, ticker);

                            // Inserisci dopo la riga corrente
                            row.parentNode.insertBefore(historyRow, row.nextSibling);
                        } else {
                            // Nessun dato disponibile
                            showNoDataRow(row, 'Nessun dettaglio disponibile per questo ETF');
                        }
                    } catch (error) {
                        console.error('Errore nel caricamento della cronologia:', error);

                        if (retries > 0) {
                            retries--;
                            await new Promise(resolve => setTimeout(resolve, delay));
                            delay *= 2; // Exponential backoff
                            return fetchHistory();
                        }

                        // Rimuovi riga di caricamento e mostra errore
                        loadingRow.remove();
                        showNoDataRow(row, 'Errore nel caricamento dei dati', true);
                    }
                };

                fetchHistory();
            } else {
                icon.classList.replace('bi-chevron-up', 'bi-chevron-down');

                // Rimuovi tutte le righe della cronologia
                const nextRow = row.nextElementSibling;
                if (nextRow && (nextRow.classList.contains('history-row') || nextRow.classList.contains('loading-row'))) {
                    nextRow.remove();
                }
            }
        });
    });
}

// Crea HTML per la riga della cronologia
function createHistoryRowHTML(history, ticker) {
    return `
        <td colspan="9">
            <div class="p-3">
                <div class="d-flex justify-content-between mb-2">
                    <div>
                        <h6 class="mb-0">Riepilogo acquisti di ${ticker}</h6>
                        <span class="badge bg-info text-white">${history.length} transazioni</span>
                    </div>
                    <div class="d-none d-md-block">
                        <button class="btn btn-sm btn-outline-primary export-history-btn" data-ticker="${ticker}">
                            <i class="bi bi-download"></i> Esporta
                        </button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm purchase-details-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Quote</th>
                                <th>Prezzo acquisto</th>
                                <th>Valore investito</th>
                                <th>Prezzo attuale</th>
                                <th>Valore attuale</th>
                                <th>Variazione</th>
                                <th>Discostamento</th>
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

// Mostra riga "nessun dato"
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

// Setup pulsanti di modifica
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

                    fetch(`/investments/${id}`, {
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

// Setup pulsanti di eliminazione
function setupDeleteButtons() {
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const row = this.closest('tr');
            const id = row.dataset.investmentId;
            const ticker = row.querySelector('td:first-child').textContent.trim();

            Swal.fire({
                title: 'Conferma eliminazione',
                text: `Sei sicuro di voler eliminare ${ticker} dal portfolio?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Elimina',
                cancelButtonText: 'Annulla',
                confirmButtonColor: '#d33'
            }).then((result) => {
                if (result.isConfirmed) {
                    showLoadingOverlay();

                    fetch(`/investments/${id}`, { method: 'DELETE' })
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

// Setup pulsanti di spostamento
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

// Mostra dialog spostamento
function showMoveDialog(portfolios, investmentId, ticker) {
    let options = '';
    portfolios.forEach(p => {
        options += `<option value="${p.id}">${p.name}</option>`;
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

// Setup form aggiunta investimento
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

// Carica grafici analitici in modo asincrono
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

// Carica dati storici
function loadHistoricalData(portfolioId) {
    const timelineContainer = document.getElementById('timelineChart')?.closest('.card-body');
    if (timelineContainer) {
        // Mostra loader
        timelineContainer.classList.add('loading');
        timelineContainer.insertAdjacentHTML('beforeend', '<div class="chart-loading-indicator"><div class="spinner-border text-primary" role="status"></div></div>');

        fetch(`/analytics/historical/${portfolioId}?days=30`)
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

// Carica metriche avanzate
function loadPortfolioMetrics(portfolioId) {
    const metricsContainer = document.getElementById('allocationChart')?.closest('.card-body');
    if (metricsContainer) {
        // Mostra loader
        metricsContainer.classList.add('loading');
        metricsContainer.insertAdjacentHTML('beforeend', '<div class="chart-loading-indicator"><div class="spinner-border text-primary" role="status"></div></div>');

        fetch(`/analytics/metrics/${portfolioId}`)
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

// Aggiorna indicatori delle metriche
function updateMetricsIndicators(analytics) {
    const diversificationIndicator = document.getElementById('diversificationIndicator');
    if (diversificationIndicator) {
        diversificationIndicator.textContent = `${analytics.metrics.diversification.toFixed(0)}%`;

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

// Overlay di caricamento
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

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Gestione cache browser
function setupCacheManagement() {
    // Imposta versione dell'applicazione per invalidare cache
    const APP_VERSION = '1.0.0';
    const storedVersion = localStorage.getItem('app_version');

    // Se versione diversa, pulisci cache locale
    if (storedVersion !== APP_VERSION) {
        clearLocalCache();
        localStorage.setItem('app_version', APP_VERSION);
    }

    // Aggiungi gestione pulizia cache
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', function() {
            clearLocalCache();
            Swal.fire({
                title: 'Cache pulita',
                text: 'La cache locale è stata pulita con successo',
                icon: 'success',
                showConfirmButton: false,
                timer: 1500
            });
        });
    }
}

// Pulisci cache locale
function clearLocalCache() {
    // Mantieni solo il tema e la versione dell'app
    const theme = localStorage.getItem('theme');
    const version = localStorage.getItem('app_version');
    localStorage.clear();
    if (theme) localStorage.setItem('theme', theme);
    if (version) localStorage.setItem('app_version', version);

    // Pulisci sessionStorage
    sessionStorage.clear();
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
