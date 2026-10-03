import {Suspense} from 'react';
import {StudioFrame} from '../../components/studio-frame';
import {TeamPanel} from '../../components/team-panel';
import '../landing.css';
import '../projets/workspace.css';
export const metadata={title:'Votre équipe',robots:{index:false,follow:false}};
export default function Page(){return <StudioFrame active="projects"><Suspense fallback={<p>Chargement…</p>}><TeamPanel/></Suspense></StudioFrame>;}
