'use client';
import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useInView,useReducedMotion,type Variants} from 'motion/react';
import {m,useCreationMotionReady} from './creation-motion';
import {HomeVisual,useHomepageMedia} from './homepage-media';
import {HomeIcon} from './home-icons';

type Phase='static'|'stacked'|'spread'|'settled';
type Offset={x:number;y:number};
const rotations=[-3,2,5,-1.5,-1.5,1,4];
const context=createContext<{phase:Phase;offsets:Offset[];settle():void}>({phase:'static',offsets:[],settle(){}});
const cards:Variants={
 stacked:({offset}:{offset:Offset})=>({x:offset.x,y:offset.y,scale:.68,rotate:0,opacity:0,transition:{duration:0}}),
 spread:({index,instant}:{index:number;instant:boolean})=>({x:0,y:0,scale:1,rotate:rotations[index],opacity:1,
  transition:instant?{duration:0}:{type:'spring',duration:.75,bounce:.12,delay:.12+index*.075,opacity:{duration:.2,delay:.12+index*.075}}}),
};

export function useMandateCardMotion(index:number){
 const {phase,offsets,settle}=useContext(context);
 return {initial:false as const,animate:phase==='static'?undefined:phase==='stacked'?'stacked':'spread',variants:cards,
  custom:{index,offset:offsets[index]??{x:0,y:0},instant:phase==='settled'},
  onAnimationComplete:()=>{if(index===6&&phase==='spread')settle();}};
}

/** Arm below the fold, then unfold once. SSR and slow feature loads stay visible. */
export function HomeMandateBoard({children}:{children:ReactNode}){
 const board=useRef<HTMLDivElement>(null),ready=useCreationMotionReady(),reduced=useReducedMotion();
 const seen=useInView(board,{once:true,amount:.15}),[phase,setPhase]=useState<Phase>('static'),[offsets,setOffsets]=useState<Offset[]>([]),state=useRef(phase);state.current=phase;
 const media=useHomepageMedia('kit.reel.visual');
 useLayoutEffect(()=>{
  const node=board.current;if(!ready||!node)return;
  if(reduced){setPhase('settled');return;}
  const measure=()=>{
   if(state.current==='spread'||state.current==='settled')return;
   const rect=node.getBoundingClientRect(),items=Array.from(node.querySelectorAll<HTMLElement>('.home-kit-card'));
   if(rect.height<1||items.length!==7||items.some(item=>item.offsetWidth<1))return;
   // Content already visible at hydration must never disappear to replay an entrance.
   if(state.current==='static'&&rect.top<window.innerHeight&&rect.bottom>0){setPhase('settled');return;}
   setOffsets(items.map(item=>({x:node.clientWidth*.5-item.offsetLeft-item.offsetWidth*.5,y:node.clientHeight*.5-item.offsetTop-item.offsetHeight*.5})));
   setPhase('stacked');
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
 },[ready,reduced]);
 useEffect(()=>{if(seen&&phase==='stacked')setPhase('spread');},[seen,phase]);
 const settle=()=>setPhase('settled');
 return <context.Provider value={{phase,offsets,settle}}><div ref={board} className="home-kit-board" role="group" aria-label="Un aperçu des sept contenus de votre mandat" data-kit-motion={phase}
  onFocusCapture={settle} onPointerDownCapture={settle}>
  {(phase==='stacked'||phase==='spread')&&<m.div className="home-kit-source" aria-hidden="true" initial={false} animate={{opacity:phase==='stacked'?1:0,scale:phase==='stacked'?1:.95}}
   transition={{duration:.22,delay:phase==='spread' ? .12 : 0}}><HomeVisual media={media}/><span><HomeIcon name="house" size={17}/>1 mandat</span></m.div>}
  {children}
 </div></context.Provider>;
}
