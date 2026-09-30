import {GenerationHistory} from '../../components/generation-history';
import {StudioFrame} from '../../components/studio-frame';
import '../landing.css';
import './history.css';
export const metadata = {title: 'Mes vidéos',robots:{index:false,follow:true}};
export default function Page() {
  return <StudioFrame active="videos"><GenerationHistory/></StudioFrame>;
}
