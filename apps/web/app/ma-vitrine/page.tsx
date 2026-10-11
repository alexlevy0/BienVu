import {ShowcaseManager} from '../../components/showcase-manager';
import {StudioFrame} from '../../components/studio-frame';
import '../landing.css';
import '../agences/showcase.css';
import './vitrine.css';
export const metadata={title:'Ma vitrine',robots:{index:false,follow:false}};
export default function Page(){return <StudioFrame active="showcase"><ShowcaseManager/></StudioFrame>;}
