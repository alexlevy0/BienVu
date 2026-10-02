import {Suspense} from 'react';
import {VideoEditor} from '../../components/video-editor';
import '../landing.css';
import './editor.css';
export const metadata={title:'Éditeur vidéo',robots:{index:false,follow:true}};
export default function Page(){return <Suspense fallback={<p role="status">Chargement de l’Éditeur…</p>}><VideoEditor/></Suspense>;}
