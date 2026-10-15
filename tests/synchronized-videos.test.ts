import {test} from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeVideos,type VideoPairState} from '../apps/web/lib/synchronized-videos';

class Video extends EventTarget{
  currentTime=0;duration=NaN;readyState=0;seeking=false;paused=true;muted=false;plays=0;rejectPlay=false;
  private next=0;frames=new Map<number,VideoFrameRequestCallback>();
  async play(){this.plays++;if(this.rejectPlay)throw Error('PLAY_BLOCKED');this.paused=false;}
  pause(){this.paused=true;}
  requestVideoFrameCallback(callback:VideoFrameRequestCallback){const id=++this.next;this.frames.set(id,callback);return id;}
  cancelVideoFrameCallback(id:number){this.frames.delete(id);}
  ready(seconds=40){this.duration=seconds;this.readyState=4;this.dispatchEvent(new Event('loadedmetadata'));this.dispatchEvent(new Event('canplay'));}
  frame(){const pending=[...this.frames.values()];this.frames.clear();for(const fn of pending)fn(0,{presentationTime:0,expectedDisplayTime:0,width:1280,height:720,mediaTime:this.currentTime,presentedFrames:1});}
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(t:{after(fn:()=>void):void}){
  const left=new Video(),right=new Video(),states:VideoPairState[]=[];
  const pair=synchronizeVideos(left,right,state=>states.push(state),4.4,40);t.after(()=>pair.destroy());
  return {left,right,pair,states,state:()=>states.at(-1)!};
}
test('Comparaison : attend les deux sources et démarre sur le même plan, avec une seule piste sonore',async t=>{
  const {left,right,pair,state}=fixture(t);pair.play();left.ready();await flush();
  assert.equal(left.plays,0);assert.equal(right.plays,0);assert.equal(state().loading,true);
  right.ready();await flush();assert.equal(state().playing,true);assert.equal(state().loading,false);
  assert.equal(left.currentTime,4.4);assert.equal(right.currentTime,4.4);assert.equal(right.muted,true);
  assert.equal(left.muted,false,'Le contrôleur conserve le choix de son de la piste principale');
});
test('Comparaison : un chargement interrompt les deux vidéos, puis reprend ensemble',async t=>{
  const {left,right,pair,state}=fixture(t);left.ready();right.ready();pair.play();await flush();
  left.readyState=2;left.dispatchEvent(new Event('waiting'));
  assert.equal(left.paused,true);assert.equal(right.paused,true);assert.equal(state().requested,true);assert.equal(state().loading,true);
  right.dispatchEvent(new Event('canplay'));await flush();assert.equal(left.plays,1);
  left.readyState=4;left.dispatchEvent(new Event('canplay'));await flush();
  assert.equal(left.plays,2);assert.equal(right.plays,2);assert.equal(state().playing,true);
});
test('Comparaison : annuler pendant le chargement ne relance pas la lecture à réception des données',async t=>{
  const {left,right,pair,state}=fixture(t);pair.play();pair.pause();left.ready();right.ready();await flush();
  assert.equal(left.plays,0);assert.equal(right.plays,0);assert.equal(state().requested,false);assert.equal(state().loading,false);
});
test('Comparaison : recherche commune, pause conservée, dérive corrigée et temps borné',async t=>{
  const {left,right,pair,state}=fixture(t);left.ready();right.ready();pair.seek(18.5);await flush();
  assert.equal(left.currentTime,18.5);assert.equal(right.currentTime,18.5);assert.equal(left.plays,0);
  pair.play();await flush();left.currentTime=20;right.currentTime=19;left.frame();await flush();
  assert.equal(left.currentTime,20);assert.equal(right.currentTime,20);assert.equal(state().playing,true);
  pair.pause();pair.seek(-10);assert.equal(left.currentTime,0);pair.seek(1000);assert.equal(right.currentTime,40);
});
test('Comparaison : fin commune au plus court, nouvelle lecture et aucune horloge après destruction',async t=>{
  const {left,right,pair,state,states}=fixture(t);left.ready(40);right.ready(30);pair.play();await flush();
  left.currentTime=29.98;left.frame();assert.equal(state().time,30);assert.equal(state().duration,30);
  assert.equal(left.paused,true);assert.equal(right.paused,true);assert.equal(state().requested,false);
  pair.play();await flush();assert.equal(left.currentTime,4.4);assert.equal(right.currentTime,4.4);
  pair.destroy();const count=states.length;left.dispatchEvent(new Event('canplay'));right.dispatchEvent(new Event('error'));left.frame();await flush();
  assert.equal(states.length,count);assert.equal(left.frames.size,0);assert.equal(left.paused,true);assert.equal(right.paused,true);
});
test('Comparaison : erreur sur une source ou refus de lecture arrête la paire et permet de réessayer',async t=>{
  const {left,right,pair,state}=fixture(t);left.ready();right.ready();pair.play();await flush();
  right.dispatchEvent(new Event('error'));assert.equal(state().error,true);assert.equal(left.paused,true);assert.equal(right.paused,true);
  right.rejectPlay=true;pair.play();await flush();assert.equal(state().error,true);assert.equal(state().requested,false);
  right.rejectPlay=false;pair.play();await flush();assert.equal(state().error,false);assert.equal(state().playing,true);
});
