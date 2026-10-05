import {PublicExplore} from '../../components/public-explore';
import {StudioFrame} from '../../components/studio-frame';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {notFound} from 'next/navigation';
import {listPublic} from '../../lib/sharing';
import {seoMetadata} from '../../lib/seo';
import {RequestFailure} from '../../lib/http';
import {readHomepageConfig} from '../../lib/homepage-media';
import {publicExample} from '../../lib/public-examples';
import {examples} from '../../lib/marketing-content';
import '../landing.css';
import './explorer.css';

export const dynamic='force-dynamic';
type Query=Promise<{q?:string|string[];category?:string|string[];sort?:string|string[];cursor?:string|string[]}>;
function single(query:Awaited<Query>) {
  if(Object.values(query).some(value=>Array.isArray(value)))notFound();
  return query as {q?:string;category?:string;sort?:string;cursor?:string};
}
export async function generateMetadata({searchParams}:{searchParams:Query}) {
  const query=single(await searchParams),filtered=Boolean(query.q||query.category&&query.category!=='all'||query.sort&&query.sort!=='newest');
  const path='/explorer'+(!filtered&&query.cursor?`?cursor=${encodeURIComponent(query.cursor)}`:'');
  return seoMetadata({title:'Exemples de vidéos immobilières créées avec BienVu',description:'Découvrez les présentations vidéo de BienVu et les vidéos partagées par les agences : appartements, maisons, formats et inspirations de montage.',path,noindex:filtered});
}
export default async function Page({searchParams}:{searchParams:Query}) {
  const params=single(await searchParams),category=params.category??'all',sort=params.sort??'newest',query=params.q?.trim()??'';
  if(!['all','apartments','houses','exceptional'].includes(category)||!['newest','oldest'].includes(sort)||query.length>80)notFound();
  const filters={query,category:category as 'all'|'apartments'|'houses'|'exceptional',sort:sort as 'newest'|'oldest'};
  let initialPage:Awaited<ReturnType<typeof listPublic>>;
  const {env}=await getCloudflareContext({async:true}),config=await readHomepageConfig(env.DB);
  try{initialPage=await listPublic(env.DB,params.cursor,filters);}catch(error){if(error instanceof RequestFailure&&error.code==='VALIDATION_ERROR')notFound();throw error;}
  const demos=await Promise.all(examples.map(async item=>{const example=(await publicExample(item.id,config))!;return {...example,category:example.custom?null:example.category,exceptional:example.custom?false:example.exceptional,durationSeconds:example.seconds};}));
  return <StudioFrame active="explore"><PublicExplore key={JSON.stringify(params)} initialPage={initialPage} initialFilters={filters} demos={demos}/></StudioFrame>;
}
