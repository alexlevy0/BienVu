import {animate} from 'motion/mini';

type Cue={selector:string;x?:number;y?:number;stagger?:number;delay?:number;duration?:number};
const heading=(selector:string):Cue=>({selector,y:12,duration:.42});
// Observe the content within each section independently: tall mobile sections
// never play all their entrances while their lower content is still off screen.
const scenes:Record<string,Cue[]>={
 discover:[heading('.home-discover-heading'),{selector:'.home-example',y:16,stagger:.065}],
 avatars:[{selector:'.home-avatars-copy',y:14},{selector:'.home-avatar-preview',x:8,y:18,stagger:.09},{selector:'.home-avatars-benefits>article',y:10,stagger:.055}],
 renders:[heading('.home-renders-heading'),{selector:'.home-render-card',y:20,stagger:.075},{selector:'.home-renders-controls',y:8}],
 comparison:[heading('.home-comparison-heading'),{selector:'.home-comparison-frame',y:16},{selector:'.home-comparison-hint,.home-comparison-create',y:8}],
 photos:[heading('.home-life-heading'),{selector:'.home-life-photo',x:-12,y:8},{selector:'.home-life-video',x:12,y:18,delay:.08},{selector:'.home-life-extras',y:10},{selector:'.home-life-features>article',y:12,stagger:.055},{selector:'.home-life-demo-card',y:16,stagger:.07},{selector:'.home-life-faq,.home-life-cta',y:10}],
 kit:[{selector:'.home-kit-kicker,.home-kit-copy>h2,.home-kit-description',y:10,stagger:.045},{selector:'.home-kit-content-list>li',y:8,stagger:.025,duration:.36},{selector:'.home-kit-create',y:8}],
 sharing:[heading('.home-sharing-heading'),{selector:'.home-share-example',y:18,stagger:.075},{selector:'.home-share-download,.home-share-cta',y:12}],
 vitrine:[heading('.home-vitrine-heading'),{selector:'.home-vitrine-browser',y:18,duration:.5},{selector:'.home-vitrine-mobile',y:24,duration:.5,delay:.12},{selector:'.home-vitrine-benefits>article',y:10,stagger:.06}],
 editor:[heading('.home-editor-demo-heading'),{selector:'.home-editor-demo-window',y:18,duration:.5},{selector:'.home-editor-demo-features>article',y:10,stagger:.06},{selector:'.home-editor-demo-cta',y:10}],
 resources:[{selector:'h2,p,nav',y:8,stagger:.035,duration:.38}],
};
type Entrance={node:HTMLElement;cue:Cue;delay:number;state:'waiting'|'playing'|'done';control?:ReturnType<typeof animate>;opacity:string;translate:string;willChange:string};

export function mountHomeScrollMotion(root:HTMLElement,revealed:WeakSet<HTMLElement>){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),compact=matchMedia('(max-width: 760px), (pointer: coarse)');
 if(reduced.matches||typeof Element.prototype.animate!=='function')return()=>{};
 const records=new Map<HTMLElement,Entrance>();let disposed=false;
 const restore=(item:Entrance)=>{
  item.node.style.opacity=item.opacity;item.node.style.translate=item.translate;item.node.style.willChange=item.willChange;
 };
 const finish=(item:Entrance)=>{
  if(item.state==='done')return;
  item.state='done';revealed.add(item.node);item.control?.cancel();item.control=undefined;restore(item);
  item.node.dataset.homeReveal='done';entrances.unobserve(item.node);
 };
 const play=(item:Entrance)=>{
  if(item.state!=='waiting')return;
  if(reduced.matches||document.hidden){finish(item);return;}
  item.state='playing';item.node.dataset.homeReveal='playing';item.node.style.willChange='opacity, translate';
  try{
   item.control=animate(item.node,{opacity:[0,1],translate:[item.node.style.translate,'0px 0px']},{
    duration:(item.cue.duration??.46)*(compact.matches?.82:1),delay:item.delay*(compact.matches?.6:1),ease:[.22,1,.36,1],
   });
   // Cancel the finished WAAPI effect and restore authored styles so hover,
   // tilt and view transitions keep owning their original CSS transforms.
   void item.control.then(()=>{if(!disposed)finish(item);},()=>{if(!disposed)finish(item);});
  }catch{finish(item);}
 };
 const entrances=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){const item=records.get(entry.target as HTMLElement);if(item)play(item);}
 },{rootMargin:'0px 0px -20px 0px',threshold:0});
 const prepare=(section:HTMLElement)=>{
  const cues=scenes[section.dataset.homeMotion??''];if(!cues)return;
  for(const cue of cues)for(const [index,node] of [...section.querySelectorAll<HTMLElement>(cue.selector)].entries()){
   if(records.has(node)||revealed.has(node))continue;
   const bounds=node.getBoundingClientRect();
   if(!bounds.width||!bounds.height)continue;
   // Hydration, anchor navigation and fast scrolling must never make something
   // the visitor can already see disappear in order to replay an entrance.
   if(bounds.top<innerHeight+12){revealed.add(node);continue;}
   const item:Entrance={node,cue,delay:Math.min((cue.delay??0)+index*(cue.stagger??0),.16),state:'waiting',opacity:node.style.opacity,translate:node.style.translate,willChange:node.style.willChange};
   records.set(node,item);node.dataset.homeReveal='waiting';
   node.style.opacity='0';node.style.translate=`${compact.matches?0:cue.x??0}px ${(cue.y??12)*(compact.matches?.65:1)}px`;
   entrances.observe(node);
  }
 };
 // Prepare only nearby sections, preserving mobile content-visibility savings.
 const sections=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){sections.unobserve(entry.target);prepare(entry.target as HTMLElement);}
 },{rootMargin:'260px 0px',threshold:0});
 for(const section of root.querySelectorAll<HTMLElement>('[data-home-motion]'))sections.observe(section);
 const interact=(event:Event)=>{
  if(!(event.target instanceof Element))return;
  for(const item of records.values())if(item.node.contains(event.target))finish(item);
 };
 const preference=()=>{if(reduced.matches){sections.disconnect();for(const item of records.values())finish(item);}};
 const resize=()=>{for(const item of records.values()){if(item.state==='playing')finish(item);else if(item.state==='waiting')item.node.style.translate=`${compact.matches?0:item.cue.x??0}px ${(item.cue.y??12)*(compact.matches?.65:1)}px`;}};
 const hidden=()=>{if(document.hidden)for(const item of records.values())if(item.state==='playing')finish(item);};
 const leave=()=>{for(const item of records.values())finish(item);};
 root.addEventListener('focusin',interact,true);root.addEventListener('pointerdown',interact,true);
 reduced.addEventListener('change',preference);compact.addEventListener('change',resize);document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);
 return()=>{
  disposed=true;sections.disconnect();entrances.disconnect();
  root.removeEventListener('focusin',interact,true);root.removeEventListener('pointerdown',interact,true);
  reduced.removeEventListener('change',preference);compact.removeEventListener('change',resize);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);
  for(const item of records.values()){item.control?.cancel();restore(item);delete item.node.dataset.homeReveal;}
  records.clear();
 };
}
