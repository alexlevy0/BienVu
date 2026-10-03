import {StudioFrame} from '../../components/studio-frame';
import {SocialCalendar} from '../../components/social-calendar';
import '../landing.css';
export const metadata={title:'Mes publications',robots:{index:false,follow:true}};
export default function Page(){return <StudioFrame active="social"><SocialCalendar/></StudioFrame>;}
