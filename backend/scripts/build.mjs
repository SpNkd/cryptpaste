import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'src'), { recursive: true });
for (const file of ['constants.mjs', 'errors.mjs', 'validation.mjs', 'repository.mjs', 'handler.mjs', 'index.mjs']) {
  const source = await readFile(join(root, 'src', file), 'utf8');
  const outputName = file.replace(/\.mjs$/, '.js');
  await writeFile(join(dist, 'src', outputName), source.replaceAll('.mjs', '.js'));
}
await writeFile(join(dist, 'package.json'), JSON.stringify({ type: 'module', main: 'src/index.mjs', dependencies: { '@ydbjs/auth': '^6.3.1', '@ydbjs/core': '^6.3.1', '@ydbjs/query': '^6.3.0' } }, null, 2));
