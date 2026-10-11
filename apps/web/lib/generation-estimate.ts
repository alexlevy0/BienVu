export type ProgressSample={percent:number;at:number;observedAt:number};
export type RemainingEstimate={kind:'estimating'}|{kind:'finishing'}|{kind:'unavailable'}|{kind:'countdown';seconds:number};
const FRAMES_COMPLETE=85,FINISHING_SECONDS=10,STALE_MS=25_000;

// Measure server checkpoint deltas, excluding import, voices, boot and asset
// staging. Arrival times only anchor the countdown to the browser's clock.
export function recordProgress(samples:ProgressSample[],percent:number,updatedAt:string,observedAt:number):ProgressSample[]{
  const at=Date.parse(updatedAt),last=samples.at(-1);
  if(!Number.isFinite(at)||!Number.isFinite(observedAt)||!Number.isInteger(percent)||percent<=0||percent>99
    ||last&&(percent<=last.percent||at<=last.at))return samples;
  const next=[...samples,{percent,at,observedAt}],finishing=next.find(s=>s.percent>=FRAMES_COMPLETE);
  if(next.length>6&&finishing)return [finishing,...next.slice(-5).filter(s=>s!==finishing)];
  return next.slice(-6);
}

export function remainingEstimate(samples:ProgressSample[],now:number,unavailable=false):RemainingEstimate{
  if(unavailable)return {kind:'unavailable'};
  const last=samples.at(-1);
  if(!last||!Number.isFinite(now))return {kind:'estimating'};
  if(last.percent>=FRAMES_COMPLETE){
    const first=samples.find(s=>s.percent>=FRAMES_COMPLETE)!;
    const seconds=Math.ceil(FINISHING_SECONDS-(now-first.observedAt)/1000);
    return seconds>0?{kind:'countdown',seconds}:{kind:'finishing'};
  }
  if(samples.length<2||now-last.observedAt>STALE_MS)return {kind:'estimating'};
  const first=samples[0],delta=last.percent-first.percent,elapsed=(last.at-first.at)/1000;
  if(delta<3||elapsed<2)return {kind:'estimating'};
  const projected=(FRAMES_COMPLETE-last.percent)*elapsed/delta+FINISHING_SECONDS;
  const seconds=Math.ceil(projected-(now-last.observedAt)/1000);
  if(seconds<=0||projected>600)return {kind:'estimating'};
  return {kind:'countdown',seconds};
}

export function remainingEstimateText(estimate:RemainingEstimate):string{
  if(estimate.kind==='unavailable')return 'Actualisation en attente';
  if(estimate.kind==='finishing')return 'Finalisation en cours…';
  if(estimate.kind==='estimating')return 'Estimation en cours…';
  const minutes=Math.floor(estimate.seconds/60),seconds=estimate.seconds%60;
  return `≈ ${minutes?`${minutes} min ${String(seconds).padStart(2,'0')} s`:`${seconds} s`} restantes`;
}
