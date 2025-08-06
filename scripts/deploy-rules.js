// deploy-rules.js
// Script to deploy updated Firebase security rules

const { execSync } = require('child_process');

console.log('Deploying updated Firebase security rules...');

try {
  // Deploy database rules
  execSync('npx firebase deploy --only database', { stdio: 'inherit' });
  console.log('Firebase security rules successfully deployed!');
} catch (error) {
  console.error('Error deploying Firebase security rules:', error);
  process.exit(1);
}
