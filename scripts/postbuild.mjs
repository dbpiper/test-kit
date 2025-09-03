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

// After build, fix unscoped init_* calls emitted by the bundler in CJS outputs
// by qualifying them with require_setup. This avoids ReferenceError at runtime
// when chunks are split and init_* live in the setup chunk.
const qualifyInitCalls = (file) => {
    if (!fs.existsSync(file)) return;
    const src = fs.readFileSync(file, 'utf8');
    // Only process files that import the setup chunk
    if (!src.includes("require('./setup-")) return;
    const replaced = src.replace(
        /(^|\n)(\s*)init_(\w+)\(/g,
        (_m, pre, ws, name) => `${pre}${ws}require_setup.init_${name}(`
    );
    if (replaced !== src) fs.writeFileSync(file, replaced);
};

// Qualify for native and web CJS entry points
qualifyInitCalls(path.join(distDir, 'index.native.cjs'));
qualifyInitCalls(path.join(distDir, 'index.web.cjs'));

// Prefer unified type definitions as the package-level types
try {
    if (fs.existsSync(unifiedDts)) {
        fs.renameSync(unifiedDts, mainDts);
    }
} catch {
    // noop: keep whatever d.ts tsdown produced as fallback
}
