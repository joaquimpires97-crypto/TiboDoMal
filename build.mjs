import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(projectDir, 'dist');
const staticFiles = ['index.html', 'app.js', 'styles.css', 'favicon.svg'];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
for (const file of staticFiles) {
  await cp(path.join(projectDir, file), path.join(outputDir, file));
}
console.log(`Built ${staticFiles.length} static files in ${outputDir}`);
