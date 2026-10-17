'use client';
import Link from 'next/link';
import {useSiteFeatures} from './site-features';
export function ExplorerLink({className,children}:{className?:string;children:React.ReactNode}){const features=useSiteFeatures();return features.explorer?<Link className={className} href="/explorer" prefetch={false}>{children}</Link>:null;}
