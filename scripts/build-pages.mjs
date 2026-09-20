import { copyFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build:frontend'], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const entrypoint = 'frontend/dist/index.html';
if (!existsSync(entrypoint)) throw new Error(`Missing ${entrypoint}`);
copyFileSync(entrypoint, 'frontend/dist/404.html');
