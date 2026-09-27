import {bundle} from '@remotion/bundler';
import {ensureBrowser} from '@remotion/renderer';
import path from 'node:path';
import {root, fixturesDir, bundleDir} from './paths';
await bundle({entryPoint:path.join(root,'packages/video/src/index.tsx'),publicDir:fixturesDir,outDir:bundleDir});
if(!process.env.REMOTION_BROWSER_EXECUTABLE)await ensureBrowser();
