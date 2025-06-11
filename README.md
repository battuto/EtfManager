# 📈 ETF Portfolio Manager

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Bootstrap-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white" alt="Bootstrap" />
  <img src="https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white" alt="Chart.js" />
</div>

<div align="center">
  <h3>🎯 Professional ETF Investment Portfolio Management Platform</h3>
  <p>A comprehensive web application for tracking, analyzing, and optimizing your Exchange-Traded Fund (ETF) investments with real-time market data and advanced analytics.</p>
</div>

---

## ✨ Key Features

### 📊 **Portfolio Management**
- **Multi-Portfolio Support**: Create and manage multiple investment portfolios
- **Real-Time Price Updates**: Automatic ETF price fetching from financial APIs
- **Investment Tracking**: Detailed purchase history with profit/loss calculations
- **Portfolio Transfers**: Seamlessly move investments between portfolios

### 📈 **Advanced Analytics**
- **Performance Metrics**: Sharpe ratio, volatility, and risk assessment
- **Historical Analysis**: 30-day, 90-day, and yearly performance tracking
- **Diversification Score**: Automated portfolio diversification analysis
- **Interactive Charts**: Beautiful visualizations powered by Chart.js

### 🚨 **Smart Alerts & Monitoring**
- **Price Alerts**: Custom notifications for target prices
- **Performance Thresholds**: Alerts for significant gains or losses
- **Portfolio Rebalancing**: Suggestions for optimal asset allocation

### 🌙 **Modern User Experience**
- **Dark/Light Theme**: Toggle between visual themes
- **Responsive Design**: Mobile-first responsive interface
- **Real-Time Updates**: Live data synchronization
- **Intuitive Navigation**: Clean, professional UI/UX

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v14 or higher)
- **npm** (Node Package Manager)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/battuto/EtfManager.git
   cd EtfManager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   # or
   node server.js
   ```

4. **Access the application**
   ```
   Open your browser and navigate to: http://localhost:3000
   ```

---

## 🏗️ Project Structure

```
ETF-Portfolio-Manager/
├── 📁 config/              # Database configuration
├── 📁 controllers/         # Business logic controllers
│   ├── alertController.js      # Alert management
│   ├── analyticsController.js  # Portfolio analytics
│   ├── investmentController.js # Investment CRUD operations
│   └── portfolioController.js  # Portfolio management
├── 📁 data/                # SQLite database files
├── 📁 models/              # Data models
├── 📁 public/              # Static assets (CSS, JS, images)
├── 📁 routes/              # Express route definitions
├── 📁 utils/               # Utility functions
├── 📁 views/               # EJS templates
├── 🔧 server.js            # Application entry point
└── 📄 package.json         # Dependencies and scripts
```

---

## 💡 Core Technologies

| Technology | Purpose | Version |
|------------|---------|---------|
| **Node.js** | Runtime Environment | Latest LTS |
| **Express.js** | Web Framework | ^4.18.0 |
| **SQLite** | Database | ^5.1.0 |
| **EJS** | Template Engine | ^3.1.0 |
| **Chart.js** | Data Visualization | ^4.0.0 |
| **Bootstrap** | UI Framework | ^5.3.0 |
| **SweetAlert2** | Beautiful Alerts | ^11.0.0 |

---

## 📊 Features Overview

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
