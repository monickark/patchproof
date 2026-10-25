import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
const source = await readFile(new URL('./src/classify-instance.ts', import.meta.url), 'utf8');
await writeFile(new URL('./dist/classify-instance.mjs', import.meta.url), stripTypeScriptTypes(source));
for (const name of ['monitor.mjs', 'cli.mjs']) {
  await copyFile(new URL(`./src/${name}`, import.meta.url), new URL(`./dist/${name}`, import.meta.url));
}
console.log('Built PatchProof in dist/');
