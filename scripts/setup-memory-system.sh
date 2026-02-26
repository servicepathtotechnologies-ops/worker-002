#!/bin/bash

# Setup script for Memory System
# This script sets up the database and initializes the memory system

set -e

echo "🧠 Setting up Memory System..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    echo "   Please set it in your .env file:"
    echo "   DATABASE_URL=postgresql://user:password@host:port/database"
    exit 1
fi

echo "✅ DATABASE_URL is set"

# Check if Prisma is installed
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is not installed. Please install Node.js and npm."
    exit 1
fi

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy || npx prisma migrate dev --name init

# Check if pgvector extension exists
echo "🔍 Checking for pgvector extension..."
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;" || {
    echo "⚠️  Warning: Could not create pgvector extension automatically"
    echo "   Please run this SQL manually in your database:"
    echo "   CREATE EXTENSION IF NOT EXISTS vector;"
}

echo ""
echo "✅ Memory System setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Ensure OPENAI_API_KEY is set in .env for vector search"
echo "   2. Start the server: npm run dev"
echo "   3. Test the API: curl http://localhost:3001/api/memory/cache/stats"
echo ""
