// Raw HTTP HTML checks, without a browser and without paid provider calls.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_SEO_URL??'http://localhost:8787',url=new URL(base);
if(!['localhost','127.0.0.1','bienvu.online'].includes(url.hostname))throw Error('SEO_PROBE_ORIGIN_INVALID');
const headers={'User-Agent':'Googlebot SEO validation BienVu'},report=[];
const features=['video-immobiliere-ia','animation-photo-immobiliere','editeur-video-immobilier','publication-reseaux-sociaux-immobilier','modeles-video-immobilier','comment-ca-marche'];
const guides=['creer-reel-immobilier-instagram','choisir-photos-video-immobiliere','programmer-publications-immobilieres','creer-video-immobiliere-gratuite'];
const paths=['/','/explorer','/abonnement','/sources','/guides',...features.map(slug=>`/${slug}`),...guides.map(slug=>`/guides/${slug}`),...['paris','sud','lyon','bordeaux'].map(id=>`/exemples/${id}`)];
const titles=new Set();
for(const path of paths){const response=await fetch(base+path,{headers}),html=await response.text();assert.equal(response.status,200,path);
 const title=html.match(/<title>([^<]+)<\/title>/)?.[1];assert.ok(title,path+' title');assert.ok(!titles.has(title),path+' duplicate title');titles.add(title);
 assert.match(html,/<meta name="description" content="[^"]{40,}/);assert.match(html,/<meta property="og:title"/);assert.match(html,/<meta property="og:image"/);assert.match(html,/<meta name="twitter:card" content="summary_large_image"/);
 const canonical=html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];assert.ok(canonical,path+' canonical');
 assert.equal(new URL(canonical).href,new URL(path,'https://bienvu.online').href,path+' canonical');
 assert.equal((html.match(/<h1(?:\s|>)/g)??[]).length,1,path+' h1');assert.match(html,/<html lang="fr"/);assert.doesNotMatch(html,/<meta name="robots" content="[^"]*noindex/);
 for(const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(match[1]);
 if(path==='/explorer'){assert.match(html,/href="\/exemples\/paris"/);assert.doesNotMatch(html,/>Chargement des vidéos…</);}
 if(path.startsWith('/exemples/')){assert.match(html,/"@type":"VideoObject"/);assert.match(html,/<video/);}
 report.push({path,status:200,canonical:true,metadata:true,ssr:true});
}
for(const path of ['/connexion','/biens','/agence','/editeur','/projets','/publications','/admin']){const response=await fetch(base+path,{headers});const html=await response.text();assert.match(html,/<meta name="robots" content="[^"]*noindex/,path);}
assert.match(await(await fetch(base+'/?draft=264c088b-5fe7-49f5-aca7-ff4332bc5531',{headers})).text(),/<meta name="robots" content="[^"]*noindex/);
const robots=await(await fetch(base+'/robots.txt')).text();assert.match(robots,/Allow: \/api\/homepage\/media\//);assert.match(robots,/Allow: \/api\/explorer\//);assert.match(robots,/Disallow: \/api\//);
assert.doesNotMatch(robots,/Disallow: \/editeur\n/,'Le préfixe privé ne doit pas bloquer /editeur-video-immobilier');
const sitemap=await(await fetch(base+'/sitemap.xml')).text();for(const path of paths)assert.ok(sitemap.includes(`<loc>https://bienvu.online${path==='/'?'/':path}</loc>`),path+' sitemap');
assert.match(sitemap,/<video:video>/);assert.match(sitemap,/<lastmod>/);assert.doesNotMatch(sitemap,/<loc>[^<]*(?:\/admin|\/biens|\/validation|\/connexion|\/agence|\/editeur<|\/projets|\/publications|draft=|token=)/);
assert.equal((await fetch(base+'/guides/invented-page',{headers})).status,404);assert.equal((await fetch(base+'/laboratoire',{headers})).status,404);
for(const path of ['/explorer?category=unknown','/explorer?q=a&q=b'])assert.equal((await fetch(base+path,{headers})).status,404,path);
for(const path of ['/studio','/generer']){const response=await fetch(base+path,{redirect:'manual'});assert.equal(response.status,308);assert.equal(new URL(response.headers.get('location'),base).pathname,'/');}
assert.equal((await fetch(base+'/api/admin?section=seo')).status,401);
const image=await fetch(base+'/images/seo/bienvu-og.jpg');assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/jpeg/);
await mkdir('evidence/local/seo',{recursive:true});await writeFile('evidence/local/seo/http.json',JSON.stringify({origin:url.origin,at:new Date().toISOString(),checks:report,paidCalls:0},null,2));
console.log(`SEO vérifié : ${paths.length} pages publiques, HTML serveur, métadonnées, données structurées, sitemap vidéo et exclusions privées.`);
