/**
 * Fix script to recreate users and ensure they work
 */
import { runQuery, get, getAll } from './config/database.js';
import bcrypt from 'bcryptjs';

async function fixUsers() {
    try {
        console.log('🔧 Fixing users table and recreating demo users...');
        
        // Drop existing users table if it exists
        await runQuery('DROP TABLE IF EXISTS users');
        console.log('🗑️ Dropped existing users table');
        
        // Create users table with correct structure
        await runQuery(`
            CREATE TABLE users (
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
        console.log('✅ Created users table');

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
            
            // Test password immediately
            const testUser = await get('SELECT username, password_hash FROM users WHERE username = ?', [userData.username]);
            const testPassword = await bcrypt.compare(userData.password, testUser.password_hash);
            console.log(`🔍 Password test for ${userData.username}: ${testPassword ? 'PASS' : 'FAIL'}`);
        }

        // Verify users
        const allUsers = await getAll('SELECT username, email, role FROM users');
        console.log('\n📊 All users in database:');
        allUsers.forEach(user => {
            console.log(`  - ${user.username} (${user.email}) - ${user.role}`);
        });
        
        console.log('\n🎉 Users fixed! You can now login with:');
        console.log('👤 Admin: admin / Admin123!');
        console.log('👤 Demo User: demo_user / DemoUser123!');
        
    } catch (error) {
        console.error('❌ Error fixing users:', error);
    }
    
    process.exit(0);
}

fixUsers();
