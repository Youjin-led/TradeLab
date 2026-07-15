// Look at the actual okx package
const path = require('path');
const okxDir = path.join(__dirname, 'node_modules', 'okx');
const fs = require('fs');

// Read package.json
const pkg = JSON.parse(fs.readFileSync(path.join(okxDir, 'package.json'), 'utf8'));
console.log('main:', pkg.main);
console.log('version:', pkg.version);

// Read the index file
const indexPath = path.join(okxDir, pkg.main || 'index.js');
console.log('index path:', indexPath);
const content = fs.readFileSync(indexPath, 'utf8');
console.log('index.js content (first 500 chars):');
console.log(content.slice(0, 500));
process.exit(0);
