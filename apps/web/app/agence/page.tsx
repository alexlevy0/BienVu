import {Shell} from '../../components/shell';
import {AgencyForm} from '../../components/agency-form';
export const metadata = {title: 'Mon agence'};
export default function Page() {
  return <Shell><div className="page-heading"><div><p className="eyebrow">VOTRE SIGNATURE, PARTOUT</p><h1>À l’image de<br/><em>votre agence.</em></h1><p className="page-intro">Une identité à renseigner une fois, pour toutes vos futures vidéos.</p></div></div><AgencyForm/></Shell>;
}
