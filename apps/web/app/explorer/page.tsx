import {PublicExplore} from '../../components/public-explore';
import {StudioFrame} from '../../components/studio-frame';
import '../landing.css';
import './explorer.css';

export const metadata = {title: 'Explorer'};
export default function Page() {return <StudioFrame active="explore"><PublicExplore/></StudioFrame>;}
