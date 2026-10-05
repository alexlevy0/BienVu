import {PropertyDetail} from '../../../components/property-detail';
import {StudioFrame} from '../../../components/studio-frame';
import '../../landing.css';
import '../properties.css';
export const metadata={title:'Mon bien',robots:{index:false,follow:true}};
export default async function Page({params}:{params:Promise<{id:string}>}){return <StudioFrame active="videos"><PropertyDetail id={(await params).id.replace(/%3a/gi,':')}/></StudioFrame>;}
