import confetti from 'canvas-confetti';

const storageKey='bienvu:generation-celebrations';
const seen=new Set<string>();
let restored=false,activeCanvas:HTMLCanvasElement|null=null;

function claim(id:string){
  if(!restored){
    restored=true;
    try{
      const saved:unknown=JSON.parse(sessionStorage.getItem(storageKey)??'[]');
      if(Array.isArray(saved))for(const value of saved.slice(-200))
        if(typeof value==='string'&&value.length<=128)seen.add(value);
    }catch{/* The in-memory guard also works when storage is unavailable. */}
  }
  if(seen.has(id))return false;
  seen.add(id);
  if(seen.size>200)seen.delete(seen.values().next().value!);
  try{sessionStorage.setItem(storageKey,JSON.stringify([...seen]));}catch{}
  return true;
}

export function celebrateGeneration(id:string):(()=>void)|null{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(document.hidden||reduced.matches||!claim(id))return null;
  return launchConfetti();
}

// An explicit preview shares the effect without inventing a job or recording
// it in the completed-generation guard.
export function launchConfetti():(()=>void)|null{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  if(document.hidden||reduced.matches)return null;
  // Several results can finish together. One pair of cannons celebrates them
  // without multiplying canvases, particles or work over the video player.
  if(activeCanvas)return null;
  const canvas=document.createElement('canvas');
  canvas.className='generation-confetti';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',
    pointerEvents:'none',zIndex:'90',contain:'strict',transition:'opacity 300ms ease'});
  document.body.appendChild(canvas);
  let fire:ReturnType<typeof confetti.create>;
  try{fire=confetti.create(canvas,{resize:true,useWorker:true,disableForReducedMotion:true});}
  catch{canvas.remove();return null;}
  activeCanvas=canvas;
  const timers:number[]=[];
  let stopped=false;
  const stop=()=>{
    if(stopped)return;stopped=true;
    timers.forEach(clearTimeout);fire.reset();canvas.remove();
    if(activeCanvas===canvas)activeCanvas=null;
    document.removeEventListener('visibilitychange',hidden);
    reduced.removeEventListener('change',motionChanged);
  };
  const hidden=()=>{if(document.hidden)stop();};
  const motionChanged=()=>{if(reduced.matches)stop();};
  document.addEventListener('visibilitychange',hidden);
  reduced.addEventListener('change',motionChanged);
  const mobile=innerWidth<768;
  const velocity=Math.min(70,Math.max(25,innerWidth*.04));
  const colors=['#213e31','#648360','#90aa7d','#e1e9da','#648360','#90aa7d','#f3efdf','#d5b66f'];
  const burst=(count:number,scalar:number)=>{
    if(stopped)return;
    try{
      const options:confetti.Options={particleCount:count,spread:58,startVelocity:velocity,decay:.925,
        gravity:.8,ticks:210,scalar,colors,shapes:['square'],flat:false};
      // Origins sit beyond the viewport: only the paper enters the screen.
      void fire({...options,angle:55,origin:{x:-.015,y:.64},drift:.15});
      void fire({...options,angle:125,origin:{x:1.015,y:.64},drift:-.15});
    }catch{stop();}
  };
  burst(mobile?18:32,.8);
  if(stopped)return stop;
  timers.push(window.setTimeout(()=>burst(mobile?16:28,.55),100));
  timers.push(window.setTimeout(()=>burst(mobile?16:30,1.05),220));
  timers.push(window.setTimeout(()=>{canvas.style.opacity='0';},3800));
  timers.push(window.setTimeout(stop,4100));
  return stop;
}
