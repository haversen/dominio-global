import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Un error de sintaxis en un archivo del navegador deja la página en blanco: se comprueban todos.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ...readdirSync(path.join(root, 'public/js')).map((f) => path.join(root, 'public/js', f)),
  path.join(root, 'public/sw.js'),
  ...readdirSync(path.join(root, 'shared')).filter((f) => f.endsWith('.js')).map((f) => path.join(root, 'shared', f)),
];

test('los archivos del navegador no tienen errores de sintaxis', () => {
  for (const file of files) {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }), path.relative(root, file));
  }
});
