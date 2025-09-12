#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

/**
 * TypeScript type checking script
 * Invokes tsc --noEmit and fails CI on error
 */
async function runTypeCheck() {
  console.log('🔍 Running TypeScript type checking...');
  
  const tsc = spawn('npx', ['tsc', '--noEmit'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true
  });

  return new Promise((resolve, reject) => {
    tsc.on('close', (code) => {
      if (code === 0) {
        console.log('✅ TypeScript compilation successful - no type errors found');
        resolve(0);
      } else {
        console.error('❌ TypeScript compilation failed with type errors');
        process.exit(1);
      }
    });

    tsc.on('error', (error) => {
      console.error('❌ Failed to run TypeScript compiler:', error.message);
      process.exit(1);
    });
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTypeCheck().catch(console.error);
}

export { runTypeCheck };