/* eslint-disable no-sync */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');
const cjsPath = path.join(distDir, 'index.cjs');
const webCjsPath = path.join(distDir, 'index.web.cjs');

if (!fs.existsSync(distDir)) {
    process.exit(0);
}

if (fs.existsSync(cjsPath)) {
    fs.renameSync(cjsPath, webCjsPath);
}

const bootstrap = `'use strict';
let useNative = false;
try {
  require.resolve('@testing-library/react-native');
  useNative = true;
} catch (_) {}
// Support both default and named exports of createKit/createKitNative
const mod = useNative ? require('./index.native.cjs') : require('./index.web.cjs');
module.exports = mod;
`;

fs.writeFileSync(cjsPath, bootstrap);
