#!/bin/bash

echo "🚀 Starting NydArt Metrics Service..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "⚠️  Please edit .env file with your configuration before starting the service."
    echo "   Key variables to configure:"
    echo "   - MONGODB_URI"
    echo "   - REDIS_URL"
    echo "   - JWT_SECRET"
    echo "   - Service URLs"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the service
echo "🎯 Starting metrics service on port 5005..."
echo "📊 Prometheus metrics will be available at: http://localhost:5005/metrics"
echo "🏥 Health check available at: http://localhost:5005/health"
echo "📈 API documentation available in README.md"

npm start 