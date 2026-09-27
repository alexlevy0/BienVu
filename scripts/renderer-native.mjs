import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const mode=process.argv[2];
if(!['render','serve'].includes(mode))throw new Error('Choisir render ou serve');
const env={...process.env};
if(process.platform==='darwin') {
  const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
  const rendererRequire=createRequire(require.resolve('@remotion/renderer'));
  const binaries=dirname(rendererRequire.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`));
  env.BIENVU_FFPROBE_PATH??=join(binaries,'ffprobe');
  env.BIENVU_FFMPEG_PATH??=join(binaries,'ffmpeg');
}
const args=mode==='serve'
  ?['--env-file=apps/pipeline/.dev.vars','--import','tsx','apps/renderer/src/server.ts']
  :['--import','tsx','apps/renderer/src/cli.ts',...process.argv.slice(3)];
const child=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
