import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PublicShowcase} from '../../../components/showcase-public';
import {showcaseExampleData, showcaseExamplePath, showcaseExampleProperties} from '../../../lib/showcase-example';
import {seoMetadata} from '../../../lib/seo';
import '../../agences/showcase.css';
import './example.css';

export const metadata = seoMetadata({title:'Découvrez Ma vitrine — Exemple d’agence', description:'Explorez un exemple de vitrine BienVu : catalogue vidéo, fiches de biens et présentation d’agence sur ordinateur et mobile.', path:showcaseExamplePath, noindex:true});

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const search = await searchParams;
  const query = Object.fromEntries(['q','transaction','type','locality','budget','rooms'].flatMap(key => typeof search[key] === 'string' ? [[key, search[key]]] : []));
  const property = typeof search.bien === 'string' ? showcaseExampleProperties.find(item => item.id === search.bien) : undefined;
  if (search.bien && !property) notFound();
  const data = showcaseExampleData(property ? {} : query);
  return <><aside className="vitrine-example-banner" aria-label="Exemple de Ma vitrine"><Link href="/">← Retour à BienVu</Link><p><strong>Exemple de vitrine</strong> · Agence et annonces fictives. Le formulaire de contact est désactivé.</p><Link className="vitrine-example-create" href="/ma-vitrine" prefetch={false}>Créer ma vitrine →</Link></aside><PublicShowcase data={data} property={property} query={query} homePath={showcaseExamplePath}/></>;
}
