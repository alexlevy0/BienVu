import {test} from 'node:test';
import assert from 'node:assert/strict';
import {synchronizeVideos,synchronizeVideoGroup,type VideoPairState} from '../apps/web/lib/synchronized-videos';

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
test('Trois rendus : attente commune, une seule piste audio, buffer et dérive du troisième corrigés',async t=>{
  const players=[new Video(),new Video(),new Video()],states:VideoPairState[]=[],group=synchronizeVideoGroup(players,state=>states.push(state),0,20);t.after(()=>group.destroy());
  group.play();players[0].ready(20);players[1].ready(20);await flush();assert.ok(players.every(p=>p.paused));
  players[2].ready(20);await flush();assert.ok(states.at(-1)?.playing);assert.deepEqual(players.map(p=>p.muted),[false,true,true]);
  players[2].readyState=2;players[2].dispatchEvent(new Event('waiting'));assert.ok(players.every(p=>p.paused));assert.ok(states.at(-1)?.loading);
  players[2].readyState=4;players[2].dispatchEvent(new Event('canplay'));await flush();assert.ok(players.every(p=>!p.paused));
  players[0].currentTime=8;players[1].currentTime=8.02;players[2].currentTime=6;players[0].frame();await flush();assert.ok(players.every(p=>Math.abs(p.currentTime-8)<=.021));assert.equal(players[2].currentTime,8);
  group.pause();group.seek(12);assert.deepEqual(players.map(p=>p.currentTime),[12,12,12]);assert.ok(players.every(p=>p.paused));
  group.destroy();assert.equal(players[0].frames.size,0);
});
test('Trois rendus : fin au plus court, erreur et annulation pendant une lecture demandée',async t=>{
  const players=[new Video(),new Video(),new Video()],states:VideoPairState[]=[],group=synchronizeVideoGroup(players,state=>states.push(state));t.after(()=>group.destroy());
  players.forEach((p,i)=>p.ready([40,30,20][i]));group.play();await flush();players[0].currentTime=19.99;players[0].frame();
  assert.ok(players.every(p=>p.paused));assert.equal(states.at(-1)?.time,20);assert.equal(states.at(-1)?.requested,false);
  group.play();await flush();assert.deepEqual(players.map(p=>p.currentTime),[0,0,0]);
  players[2].dispatchEvent(new Event('error'));assert.ok(players.every(p=>p.paused));assert.ok(states.at(-1)?.error);
  group.play();group.pause();await flush();assert.ok(players.every(p=>p.paused));assert.equal(states.at(-1)?.playing,false);
  assert.throws(()=>synchronizeVideoGroup([],()=>{}),/INVALID_VIDEO_GROUP/);assert.throws(()=>synchronizeVideoGroup([players[0],players[0]],()=>{}),/INVALID_VIDEO_GROUP/);
});
test('Hero : boucle synchronisée, son unique et arrêt définitif après une pause ou destruction',async t=>{
 const left=new Video(),right=new Video(),states:VideoPairState[]=[];
 const pair=synchronizeVideos(left,right,state=>states.push(state),0,40,{loop:true});t.after(()=>pair.destroy());
 left.ready();right.ready();pair.play();await flush();left.currentTime=39.99;right.currentTime=39.99;left.frame();await flush();
 assert.equal(left.currentTime,0);assert.equal(right.currentTime,0);assert.equal(states.at(-1)?.playing,true);assert.equal(left.muted,false);assert.equal(right.muted,true);
 left.readyState=2;left.dispatchEvent(new Event('waiting'));assert.equal(left.paused,true);assert.equal(right.paused,true);
 pair.pause();left.readyState=4;left.dispatchEvent(new Event('canplay'));left.dispatchEvent(new Event('ended'));await flush();
 assert.equal(states.at(-1)?.requested,false);assert.equal(left.paused,true);assert.equal(right.paused,true);
 pair.destroy();const count=states.length;left.dispatchEvent(new Event('ended'));await flush();assert.equal(states.length,count);assert.equal(left.frames.size,0);
});
