const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'dist-electron');
const packageJsonPath = path.join(outputDir, 'package.json');
const rootPackageJsonPath = path.join(__dirname, '..', 'package.json');
const appInfoPath = path.join(outputDir, 'app-info.json');
const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  packageJsonPath,
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8'
);
fs.writeFileSync(
  appInfoPath,
  JSON.stringify({
    name: rootPackage.name,
    productName: rootPackage.build?.productName ?? rootPackage.name,
    version: rootPackage.version
  }, null, 2) + '\n',
  'utf8'
);
