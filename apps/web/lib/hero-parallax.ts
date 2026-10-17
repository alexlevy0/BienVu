type Box={left:number;right:number;top:number;bottom:number;width:number;height:number};
const clamp=(v:number)=>Math.max(-1,Math.min(1,v));
export function heroParallaxTarget(x:number,y:number,box:Box){
 if(!box.width||!box.height||![x,y].every(Number.isFinite))return {x:0,y:0};
 const distance=Math.hypot(Math.max(box.left-x,0,x-box.right),Math.max(box.top-y,0,y-box.bottom));
 const strength=Math.max(0,1-distance/160);
 return {x:clamp((x-box.left)/box.width*2-1)*strength,y:clamp((y-box.top)/box.height*2-1)*strength};
}
