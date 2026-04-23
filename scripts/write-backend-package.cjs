const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'dist-electron');
const packageJsonPath = path.join(outputDir, 'package.json');

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  packageJsonPath,
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8'
);
