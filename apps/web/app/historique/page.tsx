import {GenerationHistory} from '../../components/generation-history';
import {Shell} from '../../components/shell';
export const metadata = {title: 'Mes vidéos'};
export default function Page() {
  return <Shell><div className="page-heading"><div><p className="eyebrow">VOS BIENS PRENNENT VIE</p><h1>Vos vidéos,<br/><em>au même endroit.</em></h1><p className="page-intro">Retrouvez vos créations et téléchargez-les quand vous en avez besoin.</p></div></div><GenerationHistory/></Shell>;
}
