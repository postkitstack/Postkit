#!/bin/bash

# PostKit Build and Install Script
set -e

echo "🚀 Building and installing PostKit..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js version 16 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"

if ! node -e "
const [required, current] = ['$REQUIRED_VERSION', '$NODE_VERSION'].map(v => v.split('.').map(Number));
const isValid = current[0] > required[0] || 
                (current[0] === required[0] && current[1] > required[1]) ||
                (current[0] === required[0] && current[1] === required[1] && current[2] >= required[2]);
process.exit(isValid ? 0 : 1);
"; then
    echo "❌ Error: Node.js version $NODE_VERSION is not supported. Please install Node.js version 16 or higher."
    exit 1
fi
# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building PostKit..."
npm run build

# Create global symlink for development or install globally
if [[ "$1" == "--dev" ]]; then
    echo "🔗 Removing existing development symlink..."
    npm unlink -g postkit 2>/dev/null || true
    echo "🔗 Creating development symlink..."
    npm link
    echo "✅ PostKit installed in development mode. Use 'npm unlink -g postkit' to remove."
else
    echo "🗑️ Removing existing global installation..."
    npm uninstall -g postkit 2>/dev/null || true
    echo "🌐 Installing globally..."
    npm install -g .
    echo "✅ PostKit installed globally."
fi

# Verify installation
echo "🔍 Verifying installation..."
if command -v postkit &> /dev/null; then
    echo "✅ PostKit successfully installed!"
    echo "📋 Version: $(postkit --version 2>/dev/null || echo 'Unable to get version')"
    echo "🎯 Usage: postkit --help"
else
    echo "❌ Installation verification failed. PostKit command not found."
    exit 1
fi

echo "🎉 Build and install completed successfully!"