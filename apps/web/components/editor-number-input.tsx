'use client';
import {useEffect,useState} from 'react';

// Keep a number being typed locally. Applying the minimum on each keystroke
// prevents entering values such as 48 (the intermediate 4 is below 20).
export function EditorNumberInput(p:{value:number;min:number;max:number;step?:number;label?:string;onValue(value:number):void}){
  const [text,setText]=useState(String(p.value));
  useEffect(()=>setText(String(p.value)),[p.value]);
  const commit=()=>{
    const number=text.trim()?Number(text):p.value,value=Number.isFinite(number)?Math.max(p.min,Math.min(p.max,number)):p.value;
    setText(String(value));p.onValue(value);
  };
  return <input aria-label={p.label} type="number" min={p.min} max={p.max} step={p.step??1} value={text}
    onChange={e=>{const value=e.target.value;setText(value);const number=Number(value);
      if(value.trim()&&Number.isFinite(number)&&number>=p.min&&number<=p.max)p.onValue(number);}}
    onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();e.currentTarget.blur();}}}/>;
}
