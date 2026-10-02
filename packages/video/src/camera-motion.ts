// Deterministic, restrained camera motion. Overscan always covers the frame:
// translations are smaller than the smallest zoom margin at 1080 × 1920.
export function cameraMotion(frame:number,duration:number,index:number,enabled=true,cinematic=false){
  if(!enabled)return {scale:1,x:0,y:0};
  const t=Math.max(0,Math.min(1,frame/Math.max(1,duration-1))),e=t*t*(3-2*t);
  // Keep momentum between cinema shots, with a little easing at the edges.
  // This remains a 2D crop of the source, not generated depth or new scenery.
  if(cinematic){const c=.75*t+.25*e;
    switch(index%4){
      case 0:return {scale:1.065+.095*c,x:-22+44*c,y:10-20*c};
      case 1:return {scale:1.16-.095*c,x:22-44*c,y:-10+20*c};
      case 2:return {scale:1.12+.01*c,x:46-92*c,y:0};
      default:return {scale:1.105+.015*c,x:0,y:50-100*c};
    }
  }
  switch(index%4){
    case 0:return {scale:1.08+.045*e,x:-18+36*e,y:12-24*e};
    case 1:return {scale:1.125-.04*e,x:22-44*e,y:-10+20*e};
    case 2:return {scale:1.09+.025*e,x:10-20*e,y:28-56*e};
    default:return {scale:1.115-.025*e,x:-24+48*e,y:0};
  }
}
