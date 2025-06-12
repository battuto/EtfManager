# 📈 ETF Portfolio Manager

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Bootstrap-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white" alt="Bootstrap" />
  <img src="https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white" alt="Chart.js" />
</div>

<div align="center">
  <h3>🎯 Piattaforma Professionale Multi-Utente per la Gestione di Portafogli ETF</h3>
  <p>Un'applicazione web completa e enterprise-ready per il tracking, l'analisi e l'ottimizzazione degli investimenti in Exchange-Traded Fund (ETF) con supporto multi-utente completo e gestione sessioni guest avanzata.</p>
</div>

> **🚀 Versione 3.0 Multi-User Ready**: Sistema di autenticazione completo, separazione dati utente, associazione automatica portfolio guest e architettura scalabile!

---

## ✨ Caratteristiche Principali

### 🔐 **Sistema Multi-Utente Completo**
- **Autenticazione Sicura**: Login/registrazione con bcrypt e express-session
- **Separazione Dati**: Ogni utente vede solo i propri portfolio e investimenti
- **Utenti Demo**: Accesso immediato con credenziali predefinite
- **Gestione Ruoli**: Amministratori e utenti standard con permessi differenziati

### 🎯 **Gestione Sessioni Guest Avanzata**
- **Access Senza Registrazione**: Gli utenti possono creare portfolio come guest
- **Associazione Automatica**: Portfolio guest vengono associati dopo login/registrazione
- **Migrazione Seamless**: Transizione trasparente da guest a utente autenticato
- **Preservazione Dati**: Nessuna perdita di portfolio o investimenti durante la migrazione

### 📊 **Gestione Portfolio Avanzata**
- **Supporto Multi-Portfolio**: Creazione e gestione di portafogli multipli per utente
- **Aggiornamenti Real-Time**: Recupero automatico prezzi ETF dalle API finanziarie
- **Tracking Investimenti**: Storico dettagliato acquisti con calcoli profit/loss
- **Trasferimenti Portfolio**: Spostamento seamless investimenti tra portfolio

### 📈 **Analytics Avanzate**
- **Metriche Performance**: Sharpe ratio, volatilità, e valutazione del rischio
- **Analisi Storica**: Performance tracking 30-giorni, 90-giorni, e annuale
- **Diversification Score**: Analisi automatica diversificazione portfolio
- **Grafici Interattivi**: Visualizzazioni avanzate powered by Chart.js

### 👨‍💼 **Dashboard Amministrativo**
- **Gestione Utenti**: CRUD completo utenti con controlli permessi
- **Monitoraggio Sistema**: Statistiche real-time e health monitoring
- **Analytics Sistema**: Metriche performance e utilizzo risorse
- **Audit Logging**: Tracciamento completo operazioni amministrative

### 🚨 **Sistema Alert Intelligente**
- **Alert Prezzi**: Notifiche personalizzate per target prices
- **Soglie Performance**: Alert per guadagni o perdite significative
- **Rebalancing Portfolio**: Suggerimenti per allocazione asset ottimale

### 🐳 **Enterprise Ready**
- **Containerizzazione Docker**: Deployment completo con Docker Compose
### 🐳 **Enterprise Ready**
- **Architettura Scalabile**: Supporto SQLite (attuale) e PostgreSQL (futuro)
- **Sicurezza Avanzata**: Password hashing bcrypt e sessioni sicure
- **Containerizzazione Docker**: Deployment completo con Docker Compose
- **Migration Tools**: Strumenti automatici per upgrade e migrazione dati

---

## 🚀 Quick Start

### 🎯 **Accesso Immediato con Utenti Demo**

Il sistema include utenti demo preconfigurati per test immediato:

| 👤 Username | 🔑 Password | 🛡️ Ruolo | 📋 Descrizione |
|-------------|-------------|-----------|----------------|
| `admin` | `Admin123!` | Amministratore | Accesso completo al sistema |
| `demo_user` | `DemoUser123!` | Utente Standard | Accesso funzionalità base |

### 🛠️ **Setup Locale (Raccomandato)**

#### Prerequisites
- **Node.js** (v18 or higher)
- **npm** (Node Package Manager)

#### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/EtfManager.git
   cd EtfManager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Initialize database and demo users**
   ```bash
   node fix_users.js
   ```

4. **Start the application**
   ```bash
   npm start
   # or
   node server.js
   ```

5. **Access the application**
   - **Main app**: http://localhost:3000
   - **Login**: Use demo credentials above
   - **Create portfolio as guest**: Access homepage without login

### 🐳 **Option 2: Docker Deployment**

For production deployment with PostgreSQL:

```bash
# Clone the repository
git clone https://github.com/yourusername/EtfManager.git
cd EtfManager

# Start with Docker Compose
docker-compose up -d

# Access the application
# Main app: http://localhost:3000
# Adminer (DB admin): http://localhost:8080
```

### � **Guest to User Flow**

1. **📂 Create Portfolio as Guest**: Access http://localhost:3000 without login
2. **💰 Add Investments**: Create investments in your guest portfolio
3. **🔐 Register/Login**: Use the register form or demo credentials
4. **✨ Automatic Association**: Your guest portfolio becomes linked to your account
   ```bash
   npm install
   ```

3. **Setup environment (copy and modify)**
   ```bash
   cp .env.docker .env
   ```

4. **Run database migration (if migrating from SQLite)**
   ```bash
   npm run migrate
   ```

5. **Start the application**
   ```bash
   npm start
   ```

#### Access
- **Main Application**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin (admin users only)

---

## 🏗️ Struttura del Progetto

```
ETF-Portfolio-Manager/
├── 📁 config/              # Configurazione database
│   ├── database.js             # Config SQLite/PostgreSQL
│   └── postgresql.js           # Setup PostgreSQL + Sequelize
├── 📁 controllers/         # Controller business logic
│   ├── alertController.js      # Gestione alert
│   ├── analyticsController.js  # Analytics portfolio
│   ├── authController.js       # Autenticazione utenti
│   ├── investmentController.js # CRUD investimenti
│   ├── portfolioController.js  # Gestione portfolio
│   └── admin/
│       └── adminController.js  # Dashboard amministrativo
├── 📁 data/                # File database SQLite
├── 📁 docker/              # Configurazioni Docker
│   ├── nginx/                  # Config Nginx
│   ├── postgres/               # Init scripts PostgreSQL
│   └── README.md               # Guida deployment
├── 📁 middleware/          # Middleware Express
│   └── auth.js                 # Autenticazione JWT
├── 📁 models/              # Modelli dati Sequelize
├── 📁 public/              # Assets statici
│   ├── css/                    # Stylesheet
│   └── js/                     # JavaScript frontend
├── 📁 routes/              # Definizioni route Express
│   ├── index.js                # Route principali
│   └── admin/                  # Route amministrative
├── 📁 scripts/             # Script utilità
│   └── migrate.js              # Script migrazione DB
├── 📁 utils/               # Funzioni utility
├── 📁 views/               # Template EJS
│   ├── layouts/                # Layout principali
│   ├── partials/               # Componenti riutilizzabili
│   └── admin/                  # Template admin
├── 🐳 docker-compose.yml   # Orchestrazione Docker
├── 🐳 Dockerfile          # Container applicazione
├── 🔧 server.js            # Entry point applicazione
└── 📄 package.json         # Dipendenze e script
```

---

## 💡 Tecnologie Core

| Tecnologia | Scopo | Versione |
|------------|-------|----------|
| **Node.js** | Runtime Environment | Latest LTS |
| **Express.js** | Web Framework | ^4.18.0 |
| **PostgreSQL** | Database Produzione | ^8.11.0 |
| **SQLite** | Database Sviluppo | ^5.1.0 |
| **Sequelize** | ORM Database | ^6.35.0 |
| **EJS** | Template Engine | ^3.1.0 |
| **Chart.js** | Visualizzazione Dati | ^4.0.0 |
| **Bootstrap** | UI Framework | ^5.3.0 |
| **Docker** | Containerizzazione | Latest |
| **JWT** | Autenticazione | ^9.0.2 |

---

## 📊 Panoramica Funzionalità

### Gestione Investimenti
- ✅ Aggiungi/Modifica/Elimina investimenti ETF
- ✅ Importa/Esporta dati CSV
- ✅ Aggiornamenti automatici prezzi
- ✅ Storico transazioni dettagliato

### Dashboard Analytics
- 📈 **Grafico Composizione**: Visualizzazione allocazione portfolio
- 📊 **Grafico Performance**: Tracking performance storica
- 📉 **Timeline Chart**: Analisi timeline investimenti
- 🎯 **Allocation Chart**: Raccomandazioni allocazione asset

### Gestione Rischio
- 🛡️ **Analisi Volatilità**: Calcoli deviazione standard
- 📊 **Sharpe Ratio**: Metriche rendimento aggiustato per rischio
- 🎯 **Diversification Score**: Valutazione bilanciamento portfolio
- ⚠️ **Alert Rischio**: Notifiche automatiche rischio

---

## 📊 Panoramica Funzionalità (English)

### Investment Management
- ✅ Add/Edit/Delete ETF investments
- ✅ CSV Import/Export functionality
- ✅ Automatic price updates
- ✅ Detailed transaction history

### Analytics Dashboard
- 📈 **Composition Chart**: Portfolio allocation visualization
- 📊 **Performance Chart**: Historical performance tracking
- 📉 **Timeline Chart**: Investment timeline analysis
- 🎯 **Allocation Chart**: Asset allocation recommendations

### Risk Management
- 🛡️ **Volatility Analysis**: Standard deviation calculations
- 📊 **Sharpe Ratio**: Risk-adjusted return metrics
- 🎯 **Diversification Score**: Portfolio balance assessment
- ⚠️ **Risk Alerts**: Automated risk notifications

---

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:
```env
NODE_ENV=production
PORT=3000
DATABASE_PATH=./data/portfolio.db
```

### Database Setup
The application automatically creates and configures the SQLite database on first run.

---

## 📱 Screenshots

### Dashboard Overview
*Professional portfolio overview with real-time data and interactive charts*

### Analytics Dashboard
*Comprehensive analytics with performance metrics and visualizations*

### Investment Management
*Intuitive investment tracking with detailed transaction history*

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add some amazing feature'
   ```
4. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request**

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Financial Data APIs** for real-time ETF pricing
- **Chart.js Community** for excellent visualization libraries
- **Bootstrap Team** for responsive UI components
- **Node.js Community** for robust backend ecosystem

---

<div align="center">
  <h3>🌟 Star this repository if you find it helpful!</h3>
  <p>Made with ❤️ for investors who want to optimize their ETF portfolios</p>
  
  **[📊 View Demo](https://your-demo-link.com)** | **[🐛 Report Bug](https://github.com/battuto/EtfManager/issues)** | **[💡 Request Feature](https://github.com/battuto/EtfManager/issues)**
</div>
