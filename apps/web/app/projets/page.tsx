import {StudioFrame} from '../../components/studio-frame';
import {WorkspaceLibrary} from '../../components/workspace-library';
import '../landing.css';
import './workspace.css';
export const metadata={title:'Dossiers et modèles',robots:{index:false,follow:true}};
export default function Page(){return <StudioFrame active="projects"><WorkspaceLibrary/></StudioFrame>;}
