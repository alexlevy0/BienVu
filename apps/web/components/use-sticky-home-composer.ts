'use client';
import {useLayoutEffect,useRef,useState,type RefObject} from 'react';

// Keep one live form in the DOM: moving it must not lose input focus, a pasted
// URL, an import estimate or the reserved space in the original hero.
export function useStickyHomeComposer(dockRef:RefObject<HTMLDivElement|null>,enabled:boolean) {
  const slotRef=useRef<HTMLDivElement>(null),[sticky,setSticky]=useState(false);
  useLayoutEffect(()=>{
    const slot=slotRef.current,dock=dockRef.current,workspace=slot?.closest('.home-workspace');
    if(!enabled||!slot||!dock||!workspace){setSticky(false);return;}
    const reduced=matchMedia('(prefers-reduced-motion: reduce)'),desktop=matchMedia('(min-width: 901px)');
    let floating=false,frame=0,animation:Animation|null=null,lastWidth=slot.getBoundingClientRect().width;
    let normalHeight=dock.getBoundingClientRect().height;
    const cancel=()=>{animation?.cancel();animation=null;};
    const release=()=>{
      delete dock.dataset.floating;slot.style.removeProperty('min-height');
      if(document.activeElement===dock.querySelector('.home-composer-tools-toggle'))
        dock.querySelector<HTMLInputElement>('#home-listing-url')?.focus({preventScroll:true});
      setSticky(false);
    };
    const measureNormal=()=>{
      const phase=dock.dataset.floating;
      delete dock.dataset.floating;
      normalHeight=dock.getBoundingClientRect().height;
      if(phase)dock.dataset.floating=phase;
    };
    const place=()=>{
      const bounds=workspace.getBoundingClientRect();
      dock.style.setProperty('--home-composer-left',`${Math.max(0,bounds.left)}px`);
      dock.style.setProperty('--home-composer-width',`${bounds.width}px`);
      dock.style.setProperty('--home-composer-top',`${window.visualViewport?.offsetTop??0}px`);
    };
    const animate=(frames:Keyframe[],done?:()=>void)=>{
      if(reduced.matches){done?.();return;}
      animation=dock.animate(frames,{duration:440,easing:'cubic-bezier(.22,.8,.25,1)'});
      const current=animation;
      void current.finished.then(()=>{if(animation===current){animation=null;done?.();}}).catch(()=>{/* A new scroll direction supersedes this transition. */});
    };
    const update=()=>{
      frame=0;
      if(!desktop.matches){cancel();floating=false;release();return;}
      const bounds=slot.getBoundingClientRect(),top=window.visualViewport?.offsetTop??0;
      if(Math.abs(bounds.width-lastWidth)>.5){
        lastWidth=bounds.width;cancel();measureNormal();
        if(floating){slot.style.minHeight=`${normalHeight}px`;place();}
        else if(dock.dataset.floating)release();
      }
      const next=bounds.top<=top;
      if(next===floating)return;
      const from=dock.getBoundingClientRect();cancel();floating=next;
      if(next){
        slot.style.minHeight=`${normalHeight}px`;place();dock.dataset.floating='true';setSticky(true);
        const target=dock.getBoundingClientRect();
        animate([
          {left:`${from.left}px`,width:`${from.width}px`,transform:`translateY(${Math.max(-18,Math.min(0,from.top-target.top))}px)`},
          {left:`${target.left}px`,width:`${target.width}px`,transform:'translateY(0)'}
        ]);
      }else{
        // Return by translating and changing width, never by scaling the text.
        dock.dataset.floating='returning';
        const target=dock.getBoundingClientRect();
        animate([
          {width:`${from.width}px`,transform:`translate(${from.left-target.left}px,${from.top-target.top}px)`},
          {width:`${target.width}px`,transform:'translate(0,0)'}
        ],release);
      }
    };
    const schedule=()=>{if((desktop.matches||dock.dataset.floating)&&!frame)frame=requestAnimationFrame(update);};
    const resize=()=>{if(floating&&desktop.matches)place();schedule();};
    const motionChanged=()=>{cancel();if(!floating&&dock.dataset.floating)release();schedule();};
    const observer=new ResizeObserver(()=>{
      if(!dock.dataset.floating)normalHeight=dock.getBoundingClientRect().height;
      schedule();
    });
    observer.observe(slot);observer.observe(dock);
    window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',resize,{passive:true});
    window.visualViewport?.addEventListener('resize',resize,{passive:true});
    window.visualViewport?.addEventListener('scroll',resize,{passive:true});
    reduced.addEventListener('change',motionChanged);desktop.addEventListener('change',schedule);update();
    return()=>{
      cancel();cancelAnimationFrame(frame);observer.disconnect();release();
      window.removeEventListener('scroll',schedule);window.removeEventListener('resize',resize);
      window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);
      reduced.removeEventListener('change',motionChanged);desktop.removeEventListener('change',schedule);
      for(const key of ['left','width','top'])dock.style.removeProperty(`--home-composer-${key}`);
    };
  },[dockRef,enabled]);
  return {slotRef,sticky};
}
