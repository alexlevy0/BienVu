import {RouteMotion} from '../../components/route-motion';
import {PropertyLibrary} from '../../components/property-library';
import {StudioFrame} from '../../components/studio-frame';
import '../landing.css';
import './properties.css';
import '../ma-vitrine/vitrine.css';
export const metadata={title:'Mes biens',robots:{index:false,follow:true}};
export default function Page(){return <RouteMotion><StudioFrame active="videos"><PropertyLibrary/></StudioFrame></RouteMotion>;}
