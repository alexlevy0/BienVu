'use client';
import {useEffect,useState} from 'react';

// Keep the choice through navigation and guest sign-in in this tab.
const key='bienvu:subtitles-enabled';
export function useSubtitlePreference(){
  const [subtitlesEnabled,setValue]=useState(true);
  useEffect(()=>{try{setValue(sessionStorage.getItem(key)!=='false');}catch{/* Default remains enabled. */}},[]);
  function setSubtitlesEnabled(value:boolean){
    setValue(value);try{sessionStorage.setItem(key,String(value));}catch{/* Current selection still works. */}
  }
  return {subtitlesEnabled,setSubtitlesEnabled};
}
