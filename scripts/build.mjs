import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
await cp('web', 'dist', { recursive: true });
await cp('LICENSE', 'dist/LICENSE');
console.log('Static site ready in dist/');
