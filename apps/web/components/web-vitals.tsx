'use client';
import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {onCLS,onINP,onLCP,type Metric} from 'web-vitals';
import {seoPage} from '../lib/seo-paths';
export function PublicWebVitals() {
  const path=usePathname(),initial=useRef(path),started=useRef(false),valid=useRef(true);
  if(path!==initial.current)valid.current=false;
  useEffect(()=>{
    const page=seoPage(initial.current);if(started.current||!page||location.search||/bot|headless/i.test(navigator.userAgent))return;
    started.current=true;
    // Measure the initial document only. A SPA navigation is not a new document metric.
    const send=(metric:Metric)=>{if(!valid.current)return;const body=JSON.stringify({page,metric:metric.name,value:metric.value});
      void fetch('/api/metrics/web-vitals',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,credentials:'omit'}).catch(()=>{});};
    onLCP(send);onCLS(send);onINP(send);
  },[]);
  return null;
}
