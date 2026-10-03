'use client';
import {useEffect,useRef,type RefObject} from 'react';
// Keep the measured gain identical to the renderer, including gains above 1.
export function useEditorAudioGain(ref:RefObject<HTMLAudioElement|null>,gain:number,playing:boolean,key:string){
  const state=useRef<{context:AudioContext;node:GainNode;element:HTMLAudioElement;timer?:ReturnType<typeof setTimeout>}|null>(null);
  useEffect(()=>{const element=ref.current;if(!element)return;
    if(state.current?.timer)clearTimeout(state.current.timer);
    if(state.current&&state.current.element!==element){void state.current.context.close();state.current=null;}
    if(playing&&!state.current){try{const context=new AudioContext(),node=context.createGain();context.createMediaElementSource(element).connect(node);node.connect(context.destination);state.current={context,node,element};}catch{element.volume=Math.min(1,gain);return;}}
    if(state.current){element.volume=1;state.current.node.gain.setTargetAtTime(gain,state.current.context.currentTime,.02);if(playing)void state.current.context.resume().catch(()=>{});}
    else element.volume=Math.min(1,gain);
  },[ref,gain,playing,key]);
  useEffect(()=>()=>{ref.current?.pause();const current=state.current;if(current)current.timer=setTimeout(()=>{void current.context.close();if(state.current===current)state.current=null;},100);},[ref,key]);
}
