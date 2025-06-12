# ETF Portfolio Manager - Docker Deployment Guide

## Quick Start

### Development Environment

```bash
# 1. Clone the repository
git clone <repository-url>
cd EtfManager

# 2. Copy environment file
cp .env.docker .env

# 3. Start development environment
docker-compose --profile development up -d

# 4. Run database migration
docker-compose exec app npm run migrate

# 5. Access the application
# App: http://localhost:3000
# Database Admin: http://localhost:8080
```

### Production Environment

```bash
# 1. Configure environment
cp .env.docker .env
# Edit .env with production values

# 2. Start production environment
docker-compose --profile production up -d

# 3. Run migration
docker-compose exec app npm run migrate
```

## Services

### Application Stack
- **app**: Node.js application (port 3000)
- **postgres**: PostgreSQL database (port 5432)
- **redis**: Redis cache/sessions (port 6379)
- **nginx**: Reverse proxy (ports 80/443)

### Development Tools
- **adminer**: Database admin interface (port 8080)

## Commands

```bash
# Start all services
docker-compose up -d

# Start with specific profile
docker-compose --profile development up -d
docker-compose --profile production up -d

# View logs
docker-compose logs -f app
docker-compose logs -f postgres

# Execute commands in container
docker-compose exec app npm run migrate
docker-compose exec app npm test
docker-compose exec postgres psql -U etf_user -d etf_portfolio

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Rebuild application
docker-compose build app
docker-compose up -d app
```

## Environment Variables

Key environment variables to configure:

```bash
# Security (REQUIRED)
JWT_SECRET=your-secret-key
POSTGRES_PASSWORD=secure-password
REDIS_PASSWORD=secure-password

# Database
POSTGRES_DB=etf_portfolio
POSTGRES_USER=etf_user

# External APIs
ALPHA_VANTAGE_API_KEY=your-api-key
FINANCIALMODELINGPREP_API_KEY=your-api-key
```

## Data Persistence

Data is persisted in Docker volumes:
- `etf_postgres_data`: PostgreSQL database
- `etf_redis_data`: Redis cache/sessions

## Backup and Restore

### Database Backup
```bash
# Backup database
docker-compose exec postgres pg_dump -U etf_user etf_portfolio > backup.sql

# Restore database
docker-compose exec -T postgres psql -U etf_user etf_portfolio < backup.sql
```

### Volume Backup
```bash
# Backup volumes
docker run --rm -v etf_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data
```

## Security Considerations

### Production Checklist
- [ ] Change all default passwords
- [ ] Generate strong random secrets
- [ ] Configure SSL certificates
- [ ] Set up firewall rules
- [ ] Enable database SSL
- [ ] Configure email service
- [ ] Set up monitoring
- [ ] Configure log rotation

### SSL Configuration
Place SSL certificates in `docker/nginx/ssl/`:
- `cert.pem`: SSL certificate
- `key.pem`: Private key

## Monitoring

### Health Checks
```bash
# Check application health
curl http://localhost:3000/api/health

# Check service status
docker-compose ps
```

### Logs
```bash
# Application logs
docker-compose logs app

# Database logs
docker-compose logs postgres

# All logs
docker-compose logs
```

## Troubleshooting

### Common Issues

**Database connection errors:**
```bash
# Check database is running
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test connection
docker-compose exec app npm run db:test
```

**Permission issues:**
```bash
# Fix file permissions
sudo chown -R 1000:1000 logs backups uploads
```

**Memory issues:**
```bash
# Increase Docker memory limit
# Docker Desktop: Settings > Resources > Memory
```

### Reset Environment
```bash
# Stop and remove everything
docker-compose down -v --remove-orphans

# Remove images
docker-compose down --rmi all

# Start fresh
docker-compose up -d
```

## Development

### Local Development with Docker
```bash
# Start dependencies only
docker-compose up -d postgres redis

# Run app locally
npm install
npm run dev

# Stop dependencies
docker-compose stop postgres redis
```

### Testing
```bash
# Run tests in container
docker-compose exec app npm test

# Run migration tests
docker-compose exec app npm run test:migration
```
