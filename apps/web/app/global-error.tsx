'use client';
import {ErrorFallback} from '../components/error-fallback';
export default function GlobalError(props:{error:Error&{digest?:string};retry:()=>void}){
 return <html lang="fr"><head><title>Interruption momentanée · BienVu</title></head><body style={{margin:0}}><ErrorFallback {...props} global/></body></html>;
}
