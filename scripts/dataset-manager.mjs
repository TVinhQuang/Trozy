import { spawn } from 'node:child_process';
import { projectRoot } from '../src/shared/project-paths.mjs';
import path from 'node:path';

const action = process.argv[2] || 'audit';
const pythonExe = path.join(projectRoot, '.runtime/meter-digits/visionstate-yolo/python/python.exe');

let scriptTarget = '';
if (action === 'fetch') {
  scriptTarget = path.join(projectRoot, 'scripts/datasets/fetch.py');
} else if (action === 'build-water') {
  scriptTarget = path.join(projectRoot, 'scripts/datasets/build_water.py');
} else if (action === 'build-electric') {
  scriptTarget = path.join(projectRoot, 'scripts/datasets/build_electric.py');
} else if (action === 'audit') {
  scriptTarget = path.join(projectRoot, 'scripts/datasets/audit.py');
} else {
  console.error(`Unknown action: ${action}. Use fetch, build-water, build-electric, or audit.`);
  process.exit(1);
}

const child = spawn(pythonExe, [scriptTarget, ...process.argv.slice(3)], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
