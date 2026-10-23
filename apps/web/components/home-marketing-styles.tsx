'use client';
import { useEffect } from 'react';

const href = `/media/ui/home-marketing.css?v=${process.env.NEXT_PUBLIC_BIENVU_RELEASE ?? 'development'}`;
const id = 'bienvu-home-marketing-css';
function loadStyles() {
  const link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) return;
  const apply = () => {
    link.media = 'all';
  };
  if (link.sheet) apply();
  else link.addEventListener('load', apply, { once: true });
}
// Start before hydration on direct visits; the effect also covers client-side
// navigation. React hoists the actual stylesheet into the server-rendered head:
// desktop layout never depends on a script running before its first paint.
const bootstrap = `(()=>{const l=document.getElementById('${id}');if(!l)return;const a=()=>{l.media='all'};if(l.sheet)a();else l.addEventListener('load',a,{once:true})})()`;
export function HomeMarketingStyles() {
  useEffect(loadStyles, []);
  return (
    <>
      <link rel="stylesheet" id={id} href={href} media="(min-width: 761px)" precedence="home-marketing" />
      <link rel="preload" href={href} as="style" fetchPriority="low" />
      {/** biome-ignore lint/security/noDangerouslySetInnerHtml: The bootstrap is a source-controlled constant; only the fixed stylesheet element ID is interpolated. */}
      <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      <noscript>
        <link rel="stylesheet" href={href} />
      </noscript>
    </>
  );
}
