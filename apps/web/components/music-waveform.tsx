export function MusicWaveform({peaks,className}:{peaks:number[];className?:string}){
  const count=Math.min(128,peaks.length),visible=Array.from({length:count},(_,i)=>{
    let value=0;for(let j=Math.floor(i*peaks.length/count);j<Math.ceil((i+1)*peaks.length/count);j++)value=Math.max(value,peaks[j]);return value;
  }),maximum=Math.max(.05,...visible);
  return <svg className={className} viewBox={`0 0 ${Math.max(1,count)*3} 32`} preserveAspectRatio="none" aria-hidden="true">
    {visible.map((peak,i)=><line key={i} x1={i*3+1} x2={i*3+1} y1={16-Math.max(.5,peak/maximum*14)} y2={16+Math.max(.5,peak/maximum*14)}/>)}</svg>;
}
export function musicTime(ms:number){const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
