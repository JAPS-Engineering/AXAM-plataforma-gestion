const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const clientDir = path.join(__dirname, '..', 'client');

if (fs.existsSync(clientDir)) {
    console.log('📦 Client directory found. Installing client dependencies...');
    try {
        execSync('npm install', { stdio: 'inherit', cwd: clientDir });
        console.log('✅ Client dependencies installed successfully.');
    } catch (error) {
        console.error('❌ Error installing client dependencies:', error);
        process.exit(1);
    }
} else {
    console.log('⚠️ Client directory not found. Skipping client dependency installation.');
    // This is expected in production Docker builds where we only copy the built assets
}
