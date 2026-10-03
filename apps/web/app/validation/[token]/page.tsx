import {ClientReview} from '../../../components/client-review';
import '../../projets/workspace.css';
export const metadata={title:'Validation de votre vidéo',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){return <ClientReview token={(await params).token}/>;}
