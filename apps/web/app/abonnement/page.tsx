import {StudioFrame} from '../../components/studio-frame';
import {Offers} from '../../components/offers';
import '../landing.css';
import './offers.css';

export const metadata = {title: 'Découvrir les offres'};

export default function Page() {
  return <StudioFrame active="offers" showFooter={false}><Offers/></StudioFrame>;
}
