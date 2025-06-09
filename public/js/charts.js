class PortfolioCharts {
    constructor(investmentsData) {
        // Verifica che Chart.js sia disponibile
        if (typeof Chart === 'undefined') {
            console.error('Chart.js non è disponibile');
            throw new Error('Chart.js non è disponibile');
        }

        this.investmentsData = investmentsData || [];

        // Verifica che ci siano dati validi
        if (!Array.isArray(this.investmentsData) || this.investmentsData.length === 0) {
            console.warn('Nessun dato di investimento disponibile per i grafici');
        }

        // Palette di colori ottimizzata per accessibilità e leggibilità
        this.colors = [
            'rgba(78, 115, 223, 0.8)',
            'rgba(28, 200, 138, 0.8)',
            'rgba(54, 185, 204, 0.8)',
            'rgba(246, 194, 62, 0.8)',
            'rgba(231, 74, 59, 0.8)',
            'rgba(111, 66, 193, 0.8)',
            'rgba(32, 201, 166, 0.8)',
            'rgba(90, 92, 105, 0.8)',
            'rgba(133, 135, 150, 0.8)',
            'rgba(90, 92, 105, 0.8)'
        ];
        this.borderColors = this.colors.map(color => color.replace('0.8', '1'));

        // Configurazioni condivise per i grafici
        this.sharedOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: 10,
                    titleFont: {
                        size: 14
                    },
                    bodyFont: {
                        size: 13
                    },
                    displayColors: true,
                    intersect: false,
                    mode: 'index'
                }
            }
        };
    }

    // Grafico composizione portfolio (doughnut)
    renderCompositionChart(elementId) {
        try {
            const canvas = document.getElementById(elementId);
            if (!canvas) {
                console.error(`Canvas con ID ${elementId} non trovato`);
                return null;
            }

            const ctx = canvas.getContext('2d');
            const tickers = this.investmentsData.map(inv => inv.ticker);
            const values = this.investmentsData.map(inv => inv.current_value || 0);
            const total = values.reduce((sum, val) => sum + val, 0);

            if (values.every(v => v === 0)) {
                console.warn('Tutti i valori sono zero, impossibile creare il grafico');
                this._renderEmptyChart(canvas, 'Nessun dato disponibile');
                return null;
            }

            return new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: tickers,
                    datasets: [{
                        data: values,
                        backgroundColor: this.colors.slice(0, tickers.length),
                        borderColor: 'white',
                        borderWidth: 2,
                        hoverOffset: 6
                    }]
                },
                options: {
                    ...this.sharedOptions,
                    plugins: {
                        ...this.sharedOptions.plugins,
                        legend: {
                            ...this.sharedOptions.plugins.legend,
                            position: 'bottom'
                        },
                        title: {
                            display: true,
                            text: 'Composizione del Portfolio',
                            font: { size: 16, weight: 'bold' }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.raw;
                                    const percentage = Math.round((value / total) * 100);
                                    return `${context.label}: ${value.toFixed(2)}€ (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        } catch (error) {
            console.error('Errore nella creazione del grafico di composizione:', error);
            return null;
        }
    }

    // Grafico performance (bar)
    renderPerformanceChart(elementId) {
        try {
            const ctx = document.getElementById(elementId).getContext('2d');
            const tickers = this.investmentsData.map(inv => inv.ticker);
            const percentChanges = this.investmentsData.map(inv => inv.percent_change || 0);

            if (!tickers.length) {
                this._renderEmptyChart(ctx.canvas, 'Nessun dato disponibile');
                return null;
            }

            return new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: tickers,
                    datasets: [{
                        label: 'Performance (%)',
                        data: percentChanges,
                        backgroundColor: percentChanges.map(val =>
                            val >= 0 ? 'rgba(28, 200, 138, 0.8)' : 'rgba(231, 74, 59, 0.8)'),
                        borderColor: percentChanges.map(val =>
                            val >= 0 ? 'rgba(28, 200, 138, 1)' : 'rgba(231, 74, 59, 1)'),
                        borderWidth: 1
                    }]
                },
                options: {
                    ...this.sharedOptions,
                    scales: {
                        y: {
                            beginAtZero: false,
                            grid: {
                                drawBorder: false,
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    },
                    plugins: {
                        ...this.sharedOptions.plugins,
                        title: {
                            display: true,
                            text: 'Performance degli ETF',
                            font: { size: 16, weight: 'bold' }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Errore nella creazione del grafico di performance:', error);
            return null;
        }
    }

    // Grafico andamento nel tempo
    renderTimelineChart(elementId, historicalData) {
        try {
            const ctx = document.getElementById(elementId).getContext('2d');

            if (!historicalData || !historicalData.dates || !historicalData.dates.length) {
                this._renderEmptyChart(ctx.canvas, 'Dati storici non disponibili');
                return null;
            }

            // Ottimizzazione: riduci il numero di punti per grafici più fluidi su periodi lunghi
            const maxDataPoints = 60;
            let dates = historicalData.dates;
            let values = historicalData.values;

            if (dates.length > maxDataPoints) {
                const factor = Math.ceil(dates.length / maxDataPoints);
                const sampledDates = [];
                const sampledValues = [];

                for (let i = 0; i < dates.length; i += factor) {
                    sampledDates.push(dates[i]);
                    sampledValues.push(values[i]);
                }

                // Assicurati di includere sempre l'ultimo punto
                if (sampledDates[sampledDates.length - 1] !== dates[dates.length - 1]) {
                    sampledDates.push(dates[dates.length - 1]);
                    sampledValues.push(values[values.length - 1]);
                }

                dates = sampledDates;
                values = sampledValues;
            }

            // Calcola variazione percentuale
            const firstValue = values[0];
            const percentValues = values.map(value =>
                firstValue ? ((value - firstValue) / firstValue) * 100 : 0);

            return new Chart(ctx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [
                        {
                            label: 'Valore (€)',
                            data: values,
                            borderColor: 'rgba(78, 115, 223, 1)',
                            backgroundColor: 'rgba(78, 115, 223, 0.2)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.1,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Variazione (%)',
                            data: percentValues,
                            borderColor: 'rgba(28, 200, 138, 1)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0.1,
                            yAxisID: 'y1',
                            hidden: true // Nascosto di default
                        }
                    ]
                },
                options: {
                    ...this.sharedOptions,
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Data'
                            },
                            ticks: {
                                maxTicksLimit: 10 // Limita il numero di etichette sull'asse x
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Valore (€)'
                            },
                            beginAtZero: false,
                            position: 'left'
                        },
                        y1: {
                            title: {
                                display: true,
                                text: 'Variazione (%)'
                            },
                            beginAtZero: false,
                            position: 'right',
                            grid: {
                                drawOnChartArea: false // Nascondi grid per il secondo asse
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        }
                    },
                    plugins: {
                        ...this.sharedOptions.plugins,
                        title: {
                            display: true,
                            text: 'Andamento Portfolio',
                            font: { size: 16, weight: 'bold' }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Errore nella creazione del grafico timeline:', error);
            return null;
        }
    }

    // Grafico allocazione e diversificazione
    renderAllocationChart(elementId, analyticsData) {
        try {
            const ctx = document.getElementById(elementId).getContext('2d');

            if (!analyticsData || !analyticsData.allocations || !analyticsData.allocations.length) {
                this._renderEmptyChart(ctx.canvas, 'Dati di allocazione non disponibili');
                return null;
            }

            const tickers = analyticsData.allocations.map(item => item.ticker);
            const allocations = analyticsData.allocations.map(item => item.allocation);

            return new Chart(ctx, {
                type: 'polarArea',
                data: {
                    labels: tickers,
                    datasets: [{
                        data: allocations,
                        backgroundColor: this.colors.slice(0, tickers.length),
                        borderWidth: 1
                    }]
                },
                options: {
                    ...this.sharedOptions,
                    plugins: {
                        ...this.sharedOptions.plugins,
                        legend: {
                            position: 'right'
                        },
                        title: {
                            display: true,
                            text: 'Allocazione Portfolio',
                            font: { size: 16, weight: 'bold' }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.label}: ${context.raw.toFixed(1)}%`;
                                }
                            }
                        },
                        subtitle: {
                            display: true,
                            text: `Indice Diversificazione: ${analyticsData.metrics.diversification.toFixed(0)}%`,
                            position: 'bottom',
                            font: { size: 14 }
                        }
                    },
                    scales: {
                        r: {
                            ticks: {
                                display: false
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Errore nella creazione del grafico allocazione:', error);
            return null;
        }
    }

    // Utility per mostrare messaggio "nessun dato" invece di canvas vuoto
    _renderEmptyChart(canvas, message = 'Nessun dato disponibile') {
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Imposta stile
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#6c757d';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
    }
}