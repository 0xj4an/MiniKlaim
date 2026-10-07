#!/usr/bin/env node
/**
 * Copy cities.pbf from all-the-cities to .next directory
 * so it's available in the Railway serverless environment.
 */
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const source = join(projectRoot, 'node_modules', 'all-the-cities', 'cities.pbf');
const destDir = join(projectRoot, '.next', 'server', 'vendor', 'all-the-cities');
const dest = join(destDir, 'cities.pbf');

console.log('📦 Copying cities.pbf for production build...');
console.log(`   Source: ${source}`);
console.log(`   Dest:   ${dest}`);

try {
  // Create destination directory
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  
  // Copy file
  copyFileSync(source, dest);
  
  console.log('✅ Successfully copied cities.pbf');
} catch (error) {
  console.error('❌ Failed to copy cities.pbf:', error.message);
  // Don't fail the build, just warn
  process.exit(0);
}
