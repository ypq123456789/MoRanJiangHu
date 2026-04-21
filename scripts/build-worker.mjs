import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, '.tmp-worker-build');
const outputFile = path.join(outputDir, 'index.js');

if (existsSync(outputDir)) {
  rmSync(outputDir, { recursive: true, force: true });
}
mkdirSync(outputDir, { recursive: true });

try {
  execSync('npx wrangler@4 pages functions build --outdir=.tmp-worker-build --output-config-path=.tmp-worker-build/wrangler.json', {
    cwd: repoRoot,
    stdio: 'inherit'
  });
} catch (error) {
  process.exit(1);
}

if (!existsSync(outputFile)) {
  console.error(`Worker bundle was not generated at ${outputFile}`);
  process.exit(1);
}
