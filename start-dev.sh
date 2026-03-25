#!/bin/bash

# Branivo Development Startup Script
# This script automatically starts all development services

set -e

echo "🚀 Starting Branivo Development Environment..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "Makefile" ] || [ ! -d "branivo-api" ] || [ ! -d "branivo-web" ] || [ ! -d "branivo_app" ]; then
    print_error "Please run this script from the root of the Branivo project"
    exit 1
fi

# Clean up old processes
print_status "Cleaning up old processes..."
pkill -f "npm run start:dev" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "flutter run" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Start Docker infrastructure
print_status "Starting Docker infrastructure..."
docker compose up -d

# Wait for services
print_status "Waiting for Docker services to be ready..."
sleep 3

# Check if Docker services are running
if ! docker ps | grep -q "branivo-postgres"; then
    print_error "PostgreSQL container is not running. Check Docker setup."
    exit 1
fi

if ! docker ps | grep -q "branivo-redis"; then
    print_error "Redis container is not running. Check Docker setup."
    exit 1
fi

print_success "Docker infrastructure is ready!"

# Start API server
print_status "Starting API server..."
cd branivo-api
npm run start:dev > ../api.log 2>&1 &
API_PID=$!
cd ..
print_success "API server started (PID: $API_PID)"

# Wait for API to start
print_status "Waiting for API server to be ready..."
sleep 5

# Check if API is responding
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    print_success "API server is responding!"
else
    print_warning "API server may not be fully ready yet, but continuing..."
fi

# Start web server
print_status "Starting web server..."
cd branivo-web
npm run dev > ../web.log 2>&1 &
WEB_PID=$!
cd ..
print_success "Web server started (PID: $WEB_PID)"

# Wait for web to start
print_status "Waiting for web server to be ready..."
sleep 3

# Check if web is responding
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    print_success "Web server is responding!"
else
    print_warning "Web server may not be fully ready yet, but continuing..."
fi

echo ""
print_success "Backend services are ready!"
echo ""
echo "🌐 Web Portal: http://localhost:3001"
echo "🔌 API: http://localhost:3000"
echo "🐘 PostgreSQL: localhost:5432"
echo "🔴 Redis: localhost:6379"
echo "📧 MailHog: http://localhost:8025"
echo "🗄️ pgAdmin: http://localhost:5050"
echo ""
echo "Test login credentials:"
echo "  Admin: admin@branivo.bg / Admin1234!"
echo "  Agent: agent@branivo.bg / Agent1234!"
echo "  Driver: driver@branivo.bg / Driver1234!"
echo ""

# Ask if user wants to start Flutter app
read -p "Do you want to start the Flutter mobile app? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    print_status "Starting Flutter app..."
    cd branivo_app
    flutter run --dart-define=API_BASE_URL=http://192.168.100.185:3000
else
    echo ""
    print_status "Flutter app not started. You can run it later with:"
    echo "  make flutter"
    echo "  # or"
    echo "  cd branivo_app && flutter run --dart-define=API_BASE_URL=http://192.168.100.185:3000"
fi

echo ""
print_success "Development environment is ready!"
echo "Use 'make dev-stop' to stop all services."