import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const fixturesDir = path.join(root,'fixtures/generated');
export const bundleDir = path.join(root,'out/remotion-bundle');
export const outputDir = process.env.OUTPUT_DIR ?? path.join(root,'evidence/local/renderer');
