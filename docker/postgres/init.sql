-- PostgreSQL initialization script for ETF Portfolio Manager
-- This script runs automatically when the Docker container starts

-- Create database if it doesn't exist
-- SELECT 'CREATE DATABASE etf_portfolio' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'etf_portfolio')\gexec

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom functions for better data handling
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Grant necessary permissions
-- This will be handled by the application initialization
