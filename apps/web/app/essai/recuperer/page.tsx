import {TrialReturn} from '../../../components/trial-return';
import {StudioFrame} from '../../../components/studio-frame';
import '../../landing.css';
export const metadata={title:'Récupérer ma vidéo',robots:{index:false,follow:false}};
export default function Page(){return <StudioFrame active="videos"><TrialReturn/></StudioFrame>;}
