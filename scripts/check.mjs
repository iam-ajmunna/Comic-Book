import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const dir of ['src', 'scripts', 'tests']) {
  for (const file of readdirSync(dir).filter((name) => /\.(m?js)$/.test(name)))
    execFileSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['--check', 'sw.js'], { stdio: 'inherit' });
console.log('All JavaScript syntax checks passed.');
