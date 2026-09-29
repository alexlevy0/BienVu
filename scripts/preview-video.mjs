// Lecteur local de recette, sans accès à R2 ni secrets dans le navigateur.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve} from 'node:path';
const port=8795;
const files=new Map([['/cloudflare.mp4',resolve('evidence/remote/sprint-06/video-cloudflare.mp4')],
  ['/trial.mp4',resolve('evidence/local/sprint-06/job-video-trial/video.mp4')],
  ['/docker.mp4',resolve('evidence/local/sprint-06/container/video.mp4')],
  ['/paid.mp4',resolve('evidence/local/sprint-06/job-video-paid/video.mp4')]]);
const page=`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BienVu — recette vidéo</title><style>body{margin:0;background:#e1e8d9;color:#132a23;font:16px system-ui}main{max-width:900px;margin:auto;padding:20px}h1{font-size:26px}video{display:block;width:min(100%,380px);max-height:75vh;aspect-ratio:9/16;margin:12px auto;background:#132a23}button,a{font:inherit;padding:10px;margin:3px}p{line-height:1.5}small{display:block;text-align:center}</style>
<main><h1>Recette vidéo BienVu</h1><p>Annonce et photos synthétiques. Voix Google déjà validée. Ces fichiers sont des recettes ; un fichier Cloudflare n'est disponible qu'après un rendu distant réussi et vérifié.</p>
<button data-file="trial">Essai local</button><button data-file="paid">Variante payante locale</button>
<button data-file="docker">Essai Docker local</button><button data-file="cloudflare">Essai Cloudflare</button>
<video id="video" controls playsinline preload="metadata" src="/trial.mp4"></video>
<button id="play">Lire la vidéo</button><button id="pause">Mettre en pause</button><small id="status">Chargement</small></main>
<script src="/player.js"></script></html>`;
const js=`const v=document.getElementById('video'),s=document.getElementById('status');
for(const button of document.querySelectorAll('[data-file]'))button.onclick=()=>{v.src='/'+button.dataset.file+'.mp4';v.load()};
document.getElementById('play').onclick=()=>v.play();document.getElementById('pause').onclick=()=>v.pause();
for(const e of ['loadedmetadata','timeupdate','ended','error'])v.addEventListener(e,()=>s.textContent=v.error?'Erreur de lecture':v.currentTime.toFixed(1)+' / '+v.duration.toFixed(1)+' s — '+v.videoWidth+' × '+v.videoHeight+(v.ended?' — Lecture terminée':''));`;
const server=createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${port}`||!['GET','HEAD'].includes(req.method??'')){res.writeHead(403);res.end();return;}
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'};
  if(req.url==='/'||req.url==='/player.js'){res.writeHead(200,{...headers,'Content-Type':req.url==='/'?'text/html; charset=utf-8':'text/javascript'});res.end(req.url==='/'?page:js);return;}
  const file=files.get(req.url);if(!file){res.writeHead(404);res.end();return;}
  const info=await stat(file).catch(()=>null);if(!info){res.writeHead(404);res.end();return;}
  const match=req.headers.range&&/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
  const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(info.size-1,Number(match[2])):info.size-1;
  if(req.headers.range&&!match||start<0||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
  res.writeHead(match?206:200,{...headers,'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,
    ...(match?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{})});
  if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
});
server.listen(port,'127.0.0.1',()=>console.log(`Lecteur privé local : http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.closeAllConnections();server.close();});
