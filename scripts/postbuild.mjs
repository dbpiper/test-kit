/* eslint-disable no-sync */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');
const cjsPath = path.join(distDir, 'index.cjs');
const webCjsPath = path.join(distDir, 'index.web.cjs');
const unifiedDts = path.join(distDir, 'index.unified.d.ts');
const mainDts = path.join(distDir, 'index.d.ts');

if (!fs.existsSync(distDir)) {
    process.exit(0);
}

if (fs.existsSync(cjsPath)) {
    fs.renameSync(cjsPath, webCjsPath);
}

const bootstrap = fs.readFileSync(
    path.join(__dirname, 'bootstrap.cjs'),
    'utf8'
);

fs.writeFileSync(cjsPath, bootstrap);

// Prefer unified type definitions as the package-level types
try {
    if (fs.existsSync(unifiedDts)) {
        fs.renameSync(unifiedDts, mainDts);
    }
} catch {
    // noop: keep whatever d.ts tsdown produced as fallback
}
