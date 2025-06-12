/**
 * @fileoverview PostgreSQL Database Configuration for Multi-User ETF Manager
 * Replaces SQLite with scalable PostgreSQL database with user management
 */

import { Sequelize, DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';

// Database connection configuration
const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'etf_manager',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    logging: process.env.NODE_ENV !== 'production' ? console.log : false,
    pool: {
        max: 20,          // Maximum connections in pool
        min: 5,           // Minimum connections in pool
        acquire: 60000,   // Maximum time to get connection
        idle: 10000       // Maximum time connection can be idle
    },
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    }
});

/**
 * User Model - Central user management
 */
const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        validate: {
            len: [3, 50],
            isAlphanumeric: true
        }
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    first_name: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    last_name: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    subscription_tier: {
        type: DataTypes.ENUM('free', 'premium', 'enterprise'),
        defaultValue: 'free'
    },
    last_login: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['email'] },
        { fields: ['username'] },
        { fields: ['is_active'] }
    ],
    hooks: {
        beforeCreate: async (user) => {
            if (user.password_hash) {
                user.password_hash = await bcrypt.hash(user.password_hash, 12);
            }
        },
        beforeUpdate: async (user) => {
            if (user.changed('password_hash')) {
                user.password_hash = await bcrypt.hash(user.password_hash, 12);
            }
        }
    }
});

/**
 * User instance methods
 */
User.prototype.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password_hash);
};

User.prototype.getFullName = function() {
    return `${this.first_name || ''} ${this.last_name || ''}`.trim() || this.username;
};

/**
 * Portfolio Model - Updated for multi-user
 */
const Portfolio = sequelize.define('Portfolio', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            len: [1, 255]
        }
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    is_default: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'EUR',
        validate: {
            isIn: [['EUR', 'USD', 'GBP', 'JPY', 'CHF']]
        }
    }
}, {
    tableName: 'portfolios',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['user_id'] },
        { fields: ['user_id', 'name'], unique: true },
        { fields: ['user_id', 'is_default'] }
    ]
});

/**
 * Investment Model - Updated for multi-user
 */
const Investment = sequelize.define('Investment', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    },
    portfolio_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Portfolio,
            key: 'id'
        }
    },
    ticker: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
            len: [1, 20],
            isUppercase: true
        }
    },
    shares: {
        type: DataTypes.DECIMAL(15, 6),
        allowNull: false,
        validate: {
            min: 0.000001
        }
    },
    buy_price: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        validate: {
            min: 0.01
        }
    },
    buy_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'investments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['user_id'] },
        { fields: ['portfolio_id'] },
        { fields: ['ticker'] },
        { fields: ['user_id', 'portfolio_id'] },
        { fields: ['user_id', 'ticker'] }
    ]
});

/**
 * Alert Model - Updated for multi-user
 */
const Alert = sequelize.define('Alert', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    },
    ticker: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
            len: [1, 20],
            isUppercase: true
        }
    },
    alert_type: {
        type: DataTypes.ENUM('price_above', 'price_below', 'volume_spike', 'percentage_change'),
        allowNull: false
    },
    target_price: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true
    },
    percentage_change: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true
    },
    condition_type: {
        type: DataTypes.ENUM('above', 'below'),
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    notification_method: {
        type: DataTypes.ENUM('email', 'browser', 'both'),
        defaultValue: 'browser'
    },
    triggered_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'alerts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['user_id'] },
        { fields: ['ticker'] },
        { fields: ['user_id', 'is_active'] },
        { fields: ['is_active', 'ticker'] }
    ]
});

/**
 * User Session Model - For authentication tracking
 */
const UserSession = sequelize.define('UserSession', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    },
    session_token: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
    ip_address: {
        type: DataTypes.INET,
        allowNull: true
    },
    user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'user_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['session_token'] },
        { fields: ['user_id'] },
        { fields: ['expires_at'] }
    ]
});

/**
 * Define Model Associations
 */
// User associations
User.hasMany(Portfolio, { foreignKey: 'user_id', as: 'portfolios', onDelete: 'CASCADE' });
User.hasMany(Investment, { foreignKey: 'user_id', as: 'investments', onDelete: 'CASCADE' });
User.hasMany(Alert, { foreignKey: 'user_id', as: 'alerts', onDelete: 'CASCADE' });
User.hasMany(UserSession, { foreignKey: 'user_id', as: 'sessions', onDelete: 'CASCADE' });

// Portfolio associations
Portfolio.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Portfolio.hasMany(Investment, { foreignKey: 'portfolio_id', as: 'investments', onDelete: 'CASCADE' });

// Investment associations
Investment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Investment.belongsTo(Portfolio, { foreignKey: 'portfolio_id', as: 'portfolio' });

// Alert associations
Alert.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Session associations
UserSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

/**
 * Database initialization and synchronization
 */
export async function initializeDatabase() {
    try {
        console.log('🔗 Connecting to PostgreSQL database...');
        
        // Test connection
        await sequelize.authenticate();
        console.log('✅ Database connection established successfully');
        
        // Sync models (create tables if they don't exist)
        await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
        console.log('✅ Database models synchronized');
        
        // Create default admin user if none exists
        const userCount = await User.count();
        if (userCount === 0) {
            await createDefaultAdmin();
        }
        
        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    }
}

/**
 * Create default admin user
 */
async function createDefaultAdmin() {
    try {
        const adminUser = await User.create({
            username: 'admin',
            email: 'admin@etfmanager.com',
            password_hash: 'admin123', // Will be hashed by hook
            first_name: 'ETF',
            last_name: 'Administrator',
            subscription_tier: 'enterprise'
        });
        
        // Create default portfolio for admin
        await Portfolio.create({
            user_id: adminUser.id,
            name: 'My Portfolio',
            description: 'Default investment portfolio',
            is_default: true
        });
        
        console.log('✅ Default admin user created (admin/admin123)');
    } catch (error) {
        console.error('❌ Failed to create default admin:', error);
    }
}

/**
 * Get database connection with connection pooling
 */
export function getDatabase() {
    return sequelize;
}

/**
 * Close database connection
 */
export async function closeDatabase() {
    try {
        await sequelize.close();
        console.log('✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error closing database connection:', error);
    }
}

// Export models
export {
    sequelize,
    User,
    Portfolio,
    Investment,
    Alert,
    UserSession
};
