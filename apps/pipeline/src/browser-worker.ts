import {launch,limits,history,sessions} from '@cloudflare/playwright';
import {imageSize} from 'image-size';
import {ImportFailure} from '@bienvu/contracts';
import {extractJsonLd} from '../../../packages/importers/src/extract';
import {extractAgency} from '../../../packages/importers/src/espaces-atypiques';
import {safeUrl,checkPublicDns,readLimited} from '../../../packages/importers/src/safety';
import {authorized,json,smallJson} from './auth';
import {cases,diagnosticPhoto} from './browser-cases';

type Secrets={PROBE_TOKEN?:string};
export default {
  async fetch(request:Request,env:BrowserEnv&Secrets,ctx:ExecutionContext):Promise<Response> {
    if(!authorized(request,env.PROBE_TOKEN))return json({error:'UNAUTHORIZED'},401);
    if(request.method==='GET'&&new URL(request.url).pathname==='/status') {
      try {
        const [currentLimits,activeSessions,recentSessions]=await Promise.all([limits(env.BROWSER),sessions(env.BROWSER),history(env.BROWSER)]);
        return json({at:new Date().toISOString(),mode:env.PROBE_MODE,enabled:env.ALLOW_REAL_BROWSER==='true',limits:currentLimits,activeSessions,recentSessions});
      } catch {return json({error:'BROWSER_STATUS_UNAVAILABLE'},502);}
    }
    if(request.method!=='POST')return json({error:'NOT_FOUND'},404);
    if(env.ALLOW_REAL_BROWSER!=='true')return json({error:'REAL_BROWSER_DISABLED'},503);
    if(new URL(request.url).pathname==='/photo-diagnostic') {
      const key='probes/browser-reservations/photo-diagnostic';
      if(!await env.MEDIA.put(key,new Date().toISOString(),{onlyIf:{etagDoesNotMatch:'*'}}))return json({error:'CASE_ALREADY_ATTEMPTED'},409);
      let result:Record<string,unknown>;
      try {
        const url=safeUrl(diagnosticPhoto,cases.agency.hosts);await checkPublicDns(url.hostname);
        const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(8000)});
        result={httpStatus:response.status,contentType:response.headers.get('content-type'),location:response.headers.get('location'),sizeBytes:response.ok?(await readLimited(response,10*1024*1024)).length:0};
        if(!response.ok)await response.body?.cancel();
      } catch(error) {result={errorName:error instanceof Error?error.name:'UnknownError',message:error instanceof Error?error.message.slice(0,200):'PHOTO_FAILED'};}
      const report={at:new Date().toISOString(),mode:env.PROBE_MODE,sourceUrl:diagnosticPhoto,browserSessions:0,result};
      await env.MEDIA.put('probes/photo-diagnostic.json',JSON.stringify(report));return json(report);
    }
    if(new URL(request.url).pathname!=='/probe')return json({error:'NOT_FOUND'},404);
    let input:unknown;try{input=await smallJson(request);}catch{return json({error:'INVALID_INPUT'},400);}
    const name=(input as {case?:string})?.case;
    if(name!=='figaro'&&name!=='agency'&&name!=='agency-gallery-check'&&name!=='agency-static-check'&&name!=='agency-keepalive-check')return json({error:'UNKNOWN_CASE'},400);
    const selected=cases[name];if(!selected.url)return json({error:'CASE_NOT_CONFIGURED'},422);
    const staticMode=name==='agency-static-check'||name==='agency-keepalive-check';
    // Un essai par cas : 2 initiaux + 3 corrections bornées, sans effacer les échecs.
    // L'écriture conditionnelle R2 interdit deux lancements concurrents du même cas.
    const reserved=await env.MEDIA.put(`probes/browser-reservations/${name}`,new Date().toISOString(),{onlyIf:{etagDoesNotMatch:'*'}});
    if(!reserved)return json({error:'CASE_ALREADY_ATTEMPTED'},409);
    const start=Date.now();const runId=crypto.randomUUID();
    const diagnostics={blockedRequests:0,requests:0,downloadBytes:0,browserClosed:false,sessionId:null as string|null,stage:'dns',photoRejects:[] as Array<{sourceUrl:string;reason:string}>};
    let browser:Awaited<ReturnType<typeof launch>>|undefined;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let result:Record<string,unknown>={};
    const validHosts=new Set<string>();
    const validate=async(value:string)=>{const u=safeUrl(value,selected.hosts);if(!validHosts.has(u.hostname)){await checkPublicDns(u.hostname);validHosts.add(u.hostname);}return u;};
    try {
      await validate(selected.url);
      diagnostics.stage='launch';
      // Les téléchargements HTTP/R2 n'envoient pas de commandes CDP. L'inactivité
      // ne doit pas fermer le décodeur pendant ces I/O ; le timer actif reste 60 s.
      const launchPromise=launch(env.BROWSER,{keep_alive:60_000,guardrails:{allowedDomains:[...selected.hosts]}});
      let launchTimer:ReturnType<typeof setTimeout>|undefined;
      try {
        browser=await Promise.race([launchPromise,new Promise<never>((_,reject)=>{
          launchTimer=setTimeout(()=>reject(new ImportFailure('IMPORT_TIMEOUT','Démarrage du navigateur trop long.')),20_000);
        })]);
      } catch(error) {
        // Si le fournisseur acquiert tardivement une session, la fermer sans naviguer.
        ctx.waitUntil(launchPromise.then(b=>b.close()).catch(()=>undefined));throw error;
      } finally {if(launchTimer)clearTimeout(launchTimer);}
      diagnostics.sessionId=browser.sessionId();
      diagnostics.stage='navigation';
      const activeBrowser=browser;
      timer=setTimeout(()=>{void activeBrowser.close().catch(()=>undefined);},60_000);
      const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:false});
      await context.routeWebSocket('**/*',ws=>ws.close());
      // Chaque réponse redirigée est rendue au navigateur puis la nouvelle URL est contrôlée.
      // La liste d'hôtes fermée est volontaire : cette sonde n'est pas l'import public du sprint 03.
      await context.route('**/*',async route=>{
        try {
          diagnostics.requests++;if(diagnostics.requests>100)throw new Error('REQUEST_LIMIT');
          // Le cas statique lit uniquement les faits et la galerie déjà dans le HTML.
          // Cela borne les sous-requêtes Workers Free et ne démontre pas une hydratation JS.
          if(staticMode&&route.request().resourceType()!=='document')throw new Error('STATIC_PROBE_RESOURCE_BLOCKED');
          await validate(route.request().url());
          if(!['document','script','stylesheet','image','xhr','fetch','font'].includes(route.request().resourceType()))throw new Error('RESOURCE_BLOCKED');
          const response=await route.fetch({maxRedirects:0,timeout:10_000});
          const data=await response.body();diagnostics.downloadBytes+=data.length;
          if(data.length>10*1024*1024||diagnostics.downloadBytes>50*1024*1024)throw new Error('RESPONSE_TOO_LARGE');
          if(response.status()>=300&&response.status()<400){const location=response.headers().location;if(location)await validate(new URL(location,route.request().url()).href);}
          await route.fulfill({response,body:data});
        } catch {diagnostics.blockedRequests++;await route.abort().catch(()=>undefined);}
      });
      const page=await context.newPage();
      const response=await page.goto(selected.url,{waitUntil:'domcontentloaded',timeout:35_000});
      if(!response||[404,410].includes(response.status()))throw new ImportFailure('SOURCE_UNAVAILABLE','Annonce absente ou retirée.');
      if([401,403,429].includes(response.status()))throw new ImportFailure('SOURCE_BLOCKED','Accès refusé par la source.');
      if(!response.ok())throw new ImportFailure('SOURCE_UNAVAILABLE','Source indisponible.');
      await validate(page.url());
      diagnostics.stage='extraction';
      // Le carrousel remplace ses ancres après hydratation. Relire aussi le HTML
      // de cette même navigation, sans requête supplémentaire ni nouvelle URL.
      const originalHtml=name==='figaro'?'':(await response.text()).slice(0,1_000_000);
      const snapshot=await page.evaluate((html)=>{
        const liveGallery=Array.from(document.querySelectorAll<HTMLAnchorElement>('article.vente #gallery a.rsImg')).slice(0,24).map(a=>a.href);
        const sourceDocument=new DOMParser().parseFromString(html,'text/html');
        const sourceGallery=Array.from(sourceDocument.querySelectorAll<HTMLAnchorElement>('article.vente #gallery a.rsImg')).slice(0,24).map(a=>new URL(a.getAttribute('href')??'',location.href).href);
        return {
        title:document.title.slice(0,300),
        blocked:/captcha|access denied|accès refusé|verify you are human/i.test(document.body.innerText.slice(0,4000)),
        documents:Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0,20).map(s=>(s.textContent??'').slice(0,100_000)),
        agency:{
          title:document.querySelector('article.vente h1.annonce-title')?.textContent?.trim().slice(0,300)??'',
          canonical:document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href??'',
          data:Array.from(document.scripts).slice(0,100).flatMap(s=>{const m=(s.textContent??'').slice(0,100_000).match(/(?:^|\s)dataLayer\s*=\s*(\[[\s\S]*?\])\s*;/);if(!m)return [];try{return JSON.parse(m[1]);}catch{return [];}}) as Record<string,unknown>[],
          gallery:[...new Set([...liveGallery,...sourceGallery])].slice(0,24),
          galleryLiveCount:liveGallery.length,gallerySourceCount:sourceGallery.length,
          summary:Array.from(document.querySelectorAll('article.vente .info-resume')).slice(0,30).map(n=>n.textContent?.trim()).join(' ').slice(0,3000),
        },
      };},originalHtml);
      if(snapshot.blocked)throw new ImportFailure('SOURCE_BLOCKED','Protection anti-robot détectée, sans contournement.');
      const documents=snapshot.documents.flatMap(s=>{try{return [JSON.parse(s)];}catch{return [];}});
      const listing=name==='figaro'?extractJsonLd(documents,page.url()):extractAgency(snapshot.agency,page.url());
      diagnostics.stage='photos';
      const decoder=await context.newPage();
      const photos:Array<{sourceUrl:string;objectKey:string;sha256:string;width:number;height:number;sizeBytes:number;mime:string}>=[];
      const hashes=new Set<string>();let bytes=0;
      for(const sourceUrl of listing.photoUrls) {
        if(Date.now()-start>55_000)break;
        try {
          await validate(sourceUrl);
          let photo=await fetch(sourceUrl,{redirect:'manual',signal:AbortSignal.timeout(8000)});
          // Photos redirigées : refus explicite pour cette sonde, jamais suivi implicite.
          if(!photo.ok){diagnostics.photoRejects.push({sourceUrl,reason:`HTTP_${photo.status}`});await photo.body?.cancel();continue;}
          const data=await readLimited(photo,10*1024*1024);bytes+=data.length;if(bytes>50*1024*1024)break;
          const meta=imageSize(data);
          if(!['jpg','jpeg','png','webp'].includes(meta.type??'')||meta.width<640||meta.height<360)continue;
          const decoded=await decoder.evaluate(async base64=>{
            const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
            const bitmap=await createImageBitmap(new Blob([bytes]));
            const dimensions={width:bitmap.width,height:bitmap.height};bitmap.close();return dimensions;
          },Buffer.from(data).toString('base64'));
          if(decoded.width!==meta.width||decoded.height!==meta.height)continue;
          const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(n=>n.toString(16).padStart(2,'0')).join('');
          if(hashes.has(hash))continue;hashes.add(hash);
          const mime=meta.type==='jpg'?'image/jpeg':`image/${meta.type}`;
          const objectKey=`probes/imports/${runId}/${hash}`;
          await env.MEDIA.put(objectKey,data,{httpMetadata:{contentType:mime}});
          photos.push({sourceUrl,objectKey,sha256:hash,width:meta.width,height:meta.height,sizeBytes:data.length,mime});
          if(photos.length>=3)break;
        } catch(error) {diagnostics.photoRejects.push({sourceUrl,reason:error instanceof Error?error.message.slice(0,160):'PHOTO_FAILED'});}
      }
      result={ok:photos.length>=3,listing,photos,photoBytes:bytes,galleryLiveCount:snapshot.agency.galleryLiveCount,gallerySourceCount:snapshot.agency.gallerySourceCount,...(photos.length<3?{error:'INSUFFICIENT_PHOTOS'}:{})};
    } catch(error) {
      result={ok:false,error:error instanceof ImportFailure?error.code:Date.now()-start>=55_000?'IMPORT_TIMEOUT':'BROWSER_PROBE_FAILED',errorName:error instanceof Error?error.name:'UnknownError',message:error instanceof ImportFailure?error.message:'Sonde interrompue ; consulter les diagnostics bornés.'};
    } finally {
      if(timer)clearTimeout(timer);
      if(browser)try{await browser.close();diagnostics.browserClosed=true;}catch{diagnostics.browserClosed=false;}
    }
    const report={...result,case:name,sourceUrl:selected.url,runId,at:new Date().toISOString(),mode:env.PROBE_MODE,resourcePolicy:staticMode?'document-only':'bounded-resources',
      browserLocation:env.PROBE_MODE==='remote'?'cloudflare':'local',durationMs:Date.now()-start,diagnostics,attempts:1,textTokens:0,ttsCalls:0,
      estimatedBrowserUsd:(Date.now()-start)/3_600_000*0.09,actualBilledEur:null};
    await env.MEDIA.put(`probes/imports/${runId}/report.json`,JSON.stringify(report),{httpMetadata:{contentType:'application/json'}});
    return json(report,result.ok?200:422);
  },
};
