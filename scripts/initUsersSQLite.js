/**
 * @fileoverview Script to initialize demo users for ETF Manager (SQLite)
 * Creates admin and demo users for testing
 */

import { runQuery, get } from '../config/database.js';
import bcrypt from 'bcryptjs';

/**
 * Initialize demo users in the SQLite database
 */
export async function initDemoUsers() {
    try {
        console.log('🔄 Initializing demo users...');

        // Create users table if it doesn't exist
        await runQuery(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                first_name TEXT,
                last_name TEXT,
                role TEXT DEFAULT 'user',
                subscription_tier TEXT DEFAULT 'basic',
                is_active BOOLEAN DEFAULT 1,
                email_verified BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if users already exist
        const existingUser = await get('SELECT COUNT(*) as count FROM users');
        if (existingUser && existingUser.count > 0) {
            console.log('✅ Demo users already exist, skipping initialization');
            return;
        }

        // Demo users data
        const demoUsers = [
            {
                username: 'admin',
                email: 'admin@etfmanager.com',
                password: 'Admin123!',
                first_name: 'Admin',
                last_name: 'User',
                role: 'admin',
                subscription_tier: 'premium'
            },
            {
                username: 'demo_user',
                email: 'demo@etfmanager.com',
                password: 'DemoUser123!',
                first_name: 'Demo',
                last_name: 'User',
                role: 'user',
                subscription_tier: 'basic'
            },
            {
                username: 'test_premium',
                email: 'premium@etfmanager.com',
                password: 'Premium123!',
                first_name: 'Premium',
                last_name: 'User',
                role: 'user',
                subscription_tier: 'premium'
            }
        ];

        // Create users
        for (const userData of demoUsers) {
            const hashedPassword = await bcrypt.hash(userData.password, 12);
            
            await runQuery(`
                INSERT INTO users (
                    username, email, password_hash, first_name, last_name, 
                    role, subscription_tier, is_active, email_verified
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
            `, [
                userData.username,
                userData.email,
                hashedPassword,
                userData.first_name,
                userData.last_name,
                userData.role,
                userData.subscription_tier
            ]);

            console.log(`✅ Created user: ${userData.username} (${userData.role})`);
        }

        console.log('🎉 Demo users initialization completed!');
        console.log('');
        console.log('📋 Login Credentials:');
        console.log('👤 Admin: admin / Admin123!');
        console.log('👤 Demo User: demo_user / DemoUser123!'); 
        console.log('👤 Premium User: test_premium / Premium123!');
        console.log('');

    } catch (error) {
        console.error('❌ Error initializing demo users:', error);
        throw error;
    }
}
