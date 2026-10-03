import {AgencyForm} from '../../components/agency-form';
import {StudioFrame} from '../../components/studio-frame';
import {SocialConnections} from '../../components/social-connections';
import '../landing.css';
import './agency.css';

export const metadata = {title: 'Mon agence',robots:{index:false,follow:true}};
export default function Page() {
  return <StudioFrame active="agency"><div className="agency-studio">
    <header className="agency-studio-heading"><h1>Mon agence</h1><p>Votre identité, sur chaque vidéo.</p></header>
    <AgencyForm/>
    <SocialConnections/>
  </div></StudioFrame>;
}
