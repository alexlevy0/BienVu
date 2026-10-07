import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {mkdir,copyFile} from 'node:fs/promises';
const require=createRequire(new URL('../apps/web/package.json',import.meta.url));
const root=dirname(require.resolve('maplibre-gl/package.json'));
const destination=new URL('../apps/web/public/maplibre/',import.meta.url);
await mkdir(destination,{recursive:true});
for(const name of ['maplibre-gl.mjs','maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'])await copyFile(resolve(root,'dist',name),new URL(name,destination));
await copyFile(resolve(root,'LICENSE.txt'),new URL('LICENSE.txt',destination));
