import {GenerationDetail} from '../../../components/generation-detail';
import {StudioFrame} from '../../../components/studio-frame';
import '../../landing.css';
export const metadata={title:'Ma vidéo',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){return <StudioFrame active="videos"><GenerationDetail id={(await params).id}/></StudioFrame>;}
