import {redirect} from 'next/navigation';
import {PublicShowcase} from '../../../components/showcase-public';
import {StructuredData} from '../../../components/structured-data';
import {readShowcasePage,showcaseQuery,agencyShowcaseMetadata,agencySchema,type ShowcaseSearch} from '../../../lib/showcase-pages';
export const dynamic='force-dynamic';
type Props={params:Promise<{slug:string}>;searchParams:Promise<ShowcaseSearch>};
export async function generateMetadata({params,searchParams}:Props){const query=showcaseQuery(await searchParams),{data}=await readShowcasePage((await params).slug,query.toString());return agencyShowcaseMetadata(data,Boolean(query.size));}
export default async function Page({params,searchParams}:Props){const{slug}=await params,query=showcaseQuery(await searchParams),{data}=await readShowcasePage(slug,query.toString());if(slug!==data.config.slug)redirect(`/agences/${data.config.slug}${query.size?'?'+query:''}`);
  return <><StructuredData data={agencySchema(data)}/><PublicShowcase data={data} query={Object.fromEntries(query)}/></>;}
