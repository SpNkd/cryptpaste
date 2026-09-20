import { spawn } from 'node:child_process';

const env = { ...process.env, API_PORT: process.env.API_PORT || '8787', FRONTEND_PORT: process.env.FRONTEND_PORT || '5173', STORAGE: 'memory' };
const commands = [
  ['backend', 'npm', ['--prefix', 'backend', 'run', 'dev']],
  ['frontend', 'npm', ['--prefix', 'frontend', 'run', 'dev']],
];
const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, { env, stdio: ['inherit', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return child;
});
const stop = () => children.forEach((child) => child.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await Promise.race(children.map((child) => new Promise((resolve) => child.on('exit', resolve))));
stop();
