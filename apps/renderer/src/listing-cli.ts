import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {renderListingVideo, renderListingStills} from './listing-render';
const directory=path.resolve(process.argv[2]??'');
try {
  const file=path.join(directory,'manifest.json');
  if((await stat(file)).size>64_000)throw new Error('VIDEO_MANIFEST_TOO_LARGE');
  const manifest=JSON.parse(await readFile(file,'utf8'));
  if(process.argv[3]==='stills') {
    let frame=0;const frames=manifest.scenes.map((s:{durationFrames:number})=>{const at=frame;frame+=s.durationFrames;return at+Math.min(15,s.durationFrames-1);});
    frames.push(frame-1);
    await renderListingStills(manifest,directory,path.join(directory,'stills'),frames);
    console.log(JSON.stringify({stills:frames.length,directory:path.join(directory,'stills')}));
  } else console.log(JSON.stringify(await renderListingVideo(manifest,directory)));
}catch(error){console.error(JSON.stringify({error:error instanceof Error&&/^[A-Z_]{3,64}$/.test(error.message)?error.message:'VIDEO_RENDER_FAILED'}));process.exitCode=1;}
