'use client';
import './creation-motion.css';
import {createContext,useCallback,useContext,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {AnimatePresence,LazyMotion,MotionConfig,useIsPresent,useReducedMotion,type HTMLMotionProps} from 'motion/react';
import * as m from 'motion/react-m';
import {HomeIcon} from './home-icons';

export {m,AnimatePresence};
export const creationSpring={type:'spring',stiffness:380,damping:38,mass:.8} as const;
const scope=createContext({active:false,ready:false});
export function useCreationMotionReady(){return useContext(scope).ready;}

/** Feature code loads after hydration; nested creation tools reuse the same scope. */
export function CreationMotion({children}:{children:ReactNode}){
 const nested=useContext(scope),[ready,setReady]=useState(false);
 const loadFeatures=useCallback(()=>import('./creation-motion-features').then(module=>{setReady(true);return module.default;}).catch(()=>new Promise<never>(()=>{/* Controls keep their immediate fallback when the feature chunk is unavailable. */})),[]);
 if(nested.active)return children;
 return <scope.Provider value={{active:true,ready}}><MotionConfig reducedMotion="user" transition={creationSpring}><LazyMotion features={loadFeatures} strict>{children}</LazyMotion></MotionConfig></scope.Provider>;
}

/** Keep fields mounted while collapsing them, preserving values and draft state. */
export function CreationReveal({open,children,...props}:Pick<HTMLMotionProps<'div'>,'id'|'className'|'style'>&{open:boolean;children:ReactNode}){
 const reduced=useReducedMotion(),ready=useCreationMotionReady(),target={height:open?'auto':0,opacity:open?1:0};
 return <m.div {...props} data-creation-reveal initial={false} animate={ready?target:undefined} style={{...props.style,...(!ready?target:{})}}
   transition={reduced?{duration:0}:{height:creationSpring,opacity:{duration:open ? .18 : .12}}} inert={!open} aria-hidden={!open}>
   <div className="creation-reveal-content">{children}</div>
 </m.div>;
}

function CreationScene({children,onHeight}:{children:ReactNode;onHeight(height:number):void}){
 const present=useIsPresent(),reduced=useReducedMotion(),ready=useCreationMotionReady(),node=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const element=node.current;if(!element||!present)return;
  const measure=()=>onHeight(element.getBoundingClientRect().height);
  measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
 },[present,onHeight]);
 return <m.div ref={node} className="creation-scene" initial={ready?{opacity:0,y:reduced?0:6}:false} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduced?0:-4}}
   transition={{duration:reduced?0:present ? .18 : .12,ease:'easeOut'}} inert={!present} aria-hidden={!present}
   style={present?undefined:{position:'absolute',inset:'0 0 auto'}}>{children}</m.div>;
}

/** Animate natural height, rather than scaling text or keeping two active forms. */
export function CreationSwap({identity,children,className}:{identity:string;children:ReactNode;className?:string}){
 const reduced=useReducedMotion(),ready=useCreationMotionReady(),[height,setHeight]=useState<number|'auto'>('auto');
 const measure=useCallback((next:number)=>setHeight(current=>typeof current==='number'&&Math.abs(current-next)<.5?current:next),[]);
 return <m.div className={`creation-swap${className?' '+className:''}`} initial={false} animate={ready?{height}:undefined} style={ready?undefined:{height:'auto'}} transition={reduced?{duration:0}:creationSpring}>
  <AnimatePresence initial={false}><CreationScene key={identity} onHeight={measure}>{children}</CreationScene></AnimatePresence>
 </m.div>;
}

export function CreationDisclosure({label,children,className,disabled,open:controlled,onOpenChange}:{label:ReactNode;children:ReactNode;className?:string;disabled?:boolean;open?:boolean;onOpenChange?(open:boolean):void}){
 const id=useId(),[local,setLocal]=useState(false),open=controlled??local;
 const change=(next:boolean)=>{setLocal(next);onOpenChange?.(next);};
 return <div className={`creation-disclosure${className?' '+className:''}`} data-open={open} onKeyDown={event=>{if(event.key==='Escape'&&open){event.stopPropagation();change(false);event.currentTarget.querySelector<HTMLButtonElement>('.creation-disclosure-toggle')?.focus();}}}>
  <m.button className="creation-disclosure-toggle" type="button" disabled={disabled} aria-expanded={open} aria-controls={id} onClick={()=>change(!open)} whileTap={{scale:.99}}>
   {label}<m.span className="creation-disclosure-chevron" initial={false} animate={{rotate:open?180:0}}><HomeIcon name="chevron" size={17}/></m.span>
  </m.button>
  <CreationReveal open={open} id={id}><div className="creation-disclosure-body">{children}</div></CreationReveal>
 </div>;
}
