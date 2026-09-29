import {bundle} from '@remotion/bundler';
import {ensureBrowser} from '@remotion/renderer';
import path from 'node:path';
import {copyFile} from 'node:fs/promises';
import {root, fixturesDir, bundleDir} from './paths';
await bundle({entryPoint:path.join(root,'packages/video/src/index.tsx'),publicDir:fixturesDir,outDir:bundleDir});
await copyFile(path.join(root,'apps/web/public/fonts/inter-tight.woff2'),path.join(bundleDir,'public/video-font.woff2'));
if(!process.env.REMOTION_BROWSER_EXECUTABLE)await ensureBrowser();
