type PairVideo=Pick<HTMLVideoElement,'currentTime'|'duration'|'readyState'|'seeking'|'paused'|'muted'|'play'|'pause'|'addEventListener'|'removeEventListener'>&{
  requestVideoFrameCallback?:HTMLVideoElement['requestVideoFrameCallback'];
  cancelVideoFrameCallback?:HTMLVideoElement['cancelVideoFrameCallback'];
};
export type VideoPairState={requested:boolean;playing:boolean;loading:boolean;ready:boolean;error:boolean;time:number;duration:number};

// One clock and one audio track. Buffering or seeking either film stops both;
// becoming ready resumes the pair only if the visitor still wants to play.
export function synchronizeVideos(primary:PairVideo,secondary:PairVideo,onChange:(state:VideoPairState)=>void,
  initialTime=0,fallbackDuration=0){
  return synchronizeVideoGroup([primary,secondary],onChange,initialTime,fallbackDuration);
}
export function synchronizeVideoGroup(players:readonly PairVideo[],onChange:(state:VideoPairState)=>void,
  initialTime=0,fallbackDuration=0){
  if(!players.length||players.length>3||new Set(players).size!==players.length)throw Error('INVALID_VIDEO_GROUP');
  const [primary,...followers]=players;
  let requested=false,loading=false,error=false,disposed=false,epoch=0,starting:number|null=null;
  let target:number|null=initialTime,frame:number|null=null,timer:ReturnType<typeof setTimeout>|null=null;
  const duration=()=>{const known=players.map(p=>p.duration).filter(d=>Number.isFinite(d)&&d>0);return known.length?Math.min(...known):fallbackDuration;};
  const clamp=(time:number)=>Math.max(0,Math.min(time,duration()||time));
  const ready=()=>target===null&&players.every(p=>p.readyState>=2&&!p.seeking);
  const report=()=>{if(!disposed)onChange({requested,playing:requested&&!loading&&!error&&players.every(p=>!p.paused),loading,
    ready:ready(),error,time:clamp(target??primary.currentTime),duration:duration()});};
  const stopClock=()=>{if(frame!==null)primary.cancelVideoFrameCallback?.(frame);if(timer!==null)clearTimeout(timer);frame=null;timer=null;};
  const stopPlayers=()=>{epoch++;starting=null;stopClock();players.forEach(p=>p.pause());};
  const applyTarget=()=>{
    if(target===null)return;
    const next=clamp(target);
    for(const player of players)if(player.readyState>=1&&Math.abs(player.currentTime-next)>.02)player.currentTime=next;
    if(players.every(p=>p.readyState>=1))target=null;
  };
  const finish=()=>{requested=false;loading=false;stopPlayers();target=null;
    const end=duration();if(end>0)for(const player of players)if(player.readyState>=1)player.currentTime=end;
    report();};
  const tick=()=>{
    frame=null;timer=null;if(disposed||!requested||loading||error)return;
    if(duration()>0&&primary.currentTime>=duration()-.035){finish();return;}
    if(followers.some(player=>!player.seeking&&Math.abs(primary.currentTime-player.currentTime)>.12)){seek(primary.currentTime);return;}
    schedule();
  };
  const schedule=()=>{
    if(disposed||!requested||loading||frame!==null||timer!==null)return;
    if(primary.requestVideoFrameCallback)frame=primary.requestVideoFrameCallback(tick);
    else timer=setTimeout(tick,100);
  };
  const resume=()=>{
    if(disposed||!requested||error||starting!==null)return;
    applyTarget();
    if(!players.every(p=>p.readyState>=3&&!p.seeking)){loading=true;report();return;}
    const token=epoch;starting=token;followers.forEach(player=>{player.muted=true;});
    void Promise.all(players.map(p=>p.play())).then(()=>{
      if(disposed||token!==epoch||!requested)return;
      starting=null;loading=false;report();schedule();
    }).catch(()=>{
      if(disposed||token!==epoch||!requested)return;
      requested=false;loading=false;error=true;stopPlayers();report();
    });
  };
  function seek(time:number){
    if(disposed||!Number.isFinite(time))return;
    stopPlayers();target=clamp(time);loading=requested;applyTarget();report();resume();
  }
  const available=()=>{applyTarget();report();resume();};
  const waiting=()=>{if(disposed||!requested)return;loading=true;stopPlayers();report();};
  const failed=()=>{error=true;requested=false;loading=false;stopPlayers();report();};
  const timeupdate=()=>{if(requested&&duration()>0&&primary.currentTime>=duration()-.035)finish();else report();};
  for(const player of players){
    for(const name of ['loadedmetadata','loadeddata','canplay','seeked'])player.addEventListener(name,available);
    player.addEventListener('waiting',waiting);player.addEventListener('error',failed);player.addEventListener('ended',finish);
  }
  primary.addEventListener('timeupdate',timeupdate);report();
  return {
    play(){if(disposed)return;error=false;requested=true;loading=true;if(duration()>0&&primary.currentTime>=duration()-.035)seek(initialTime);else{report();resume();}},
    pause(){if(disposed)return;requested=false;loading=false;stopPlayers();report();},
    seek,
    destroy(){disposed=true;requested=false;stopPlayers();for(const player of players){
      for(const name of ['loadedmetadata','loadeddata','canplay','seeked'])player.removeEventListener(name,available);
      player.removeEventListener('waiting',waiting);player.removeEventListener('error',failed);player.removeEventListener('ended',finish);
    }primary.removeEventListener('timeupdate',timeupdate);},
  };
}
