'use client';
import {ErrorFallback} from '../components/error-fallback';
export default function ErrorPage(props:{error:Error&{digest?:string};retry:()=>void}){return <ErrorFallback {...props}/>;}
