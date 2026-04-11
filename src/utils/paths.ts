/**
 * Path utilities
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  return join(dirname(currentFile), '..', '..');
}

export function getProjectRoot(): string {
  return process.cwd();
}
