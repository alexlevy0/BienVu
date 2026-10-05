import {cache} from 'react';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import {publicExample} from '../../../lib/public-examples';
import {examples} from '../../../lib/marketing-content';
import {seoMetadata,videoSchema,breadcrumbs} from '../../../lib/seo';
import {StructuredData} from '../../../components/structured-data';
import {StudioFrame} from '../../../components/studio-frame';
import '../../landing.css';
import '../../marketing.css';
export const dynamic='force-dynamic';
const read=cache(async(id:string)=>{const value=await publicExample(id);if(!value)notFound();return value;});
export async function generateMetadata({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,example=await read(id);
  return seoMetadata({title:`${example.title} — Exemple de vidéo immobilière BienVu`,description:example.description,path:`/exemples/${id}`,image:example.poster});
}
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,example=await read(id),path=`/exemples/${id}`;
  return <StudioFrame active="explore"><article className="marketing-page">
    <StructuredData data={videoSchema({...example,path})}/><StructuredData data={breadcrumbs([{name:'BienVu',path:'/'},{name:'Exemples',path:'/explorer'},{name:example.title,path}])}/>
    <nav className="marketing-breadcrumb" aria-label="Fil d’Ariane"><Link href="/explorer">Explorer les vidéos</Link><span aria-hidden="true">/</span><span>{example.title}</span></nav>
    <div className="marketing-example-layout"><video className="marketing-example-player" src={example.src} poster={example.poster} controls playsInline preload="none" aria-label={example.title}/>
      <div className="marketing-example-copy"><p className="marketing-kicker">UNE PRÉSENTATION EN VIDÉO</p><h1>{example.title}</h1><p>{example.description}</p>{example.locality&&<p>{example.locality} · {Math.round(example.seconds)} secondes</p>}
        <p>{example.custom?`Sélection publique BienVu · ${example.agency}.`:'Démonstration à partir d’images générées, avec une agence fictive. La lecture de cet exemple est sans voix off.'}</p><h2>À adapter à votre bien</h2><p>Ajoutez les photos de votre annonce, votre ville, votre prix et l’identité de votre agence. Choisissez la voix française, les sous-titres et le format qui conviennent à votre présentation.</p><p>Vous pouvez ensuite revoir les textes, les cadrages et le rythme dans l’éditeur avant de partager votre vidéo.</p><div className="marketing-actions"><Link href="/" className="marketing-button">Créer ma vidéo →</Link><Link href="/editeur-video-immobilier">Découvrir l’éditeur ↗</Link></div></div></div>
    <section className="marketing-related"><h2>D’autres présentations</h2><div>{examples.filter(item=>item.id!==id).map(item=><Link href={`/exemples/${item.id}`} key={item.id}>Présentation {examples.indexOf(item)+1}<span aria-hidden="true">↗</span></Link>)}</div></section><nav className="marketing-resources"><Link href="/video-immobiliere-ia">Créer une vidéo immobilière par IA</Link><Link href="/guides/choisir-photos-video-immobiliere">Choisir les photos du montage</Link><Link href="/abonnement">Comprendre les crédits</Link></nav>
  </article></StudioFrame>;
}
