import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitForWorkflowAvatars} from '../apps/pipeline/src/avatar-workflow';

const start=Date.parse('2026-10-19T10:00:00Z'),minute=60_000;
type Steps=Parameters<typeof waitForWorkflowAvatars>[0];
type Checkpoint=Awaited<ReturnType<Steps['do']>>;

test('HeyGen lent : un avatar prêt après 22 minutes reste attendu',async t=>{
  t.mock.timers.enable({apis:['Date'],now:start});
  let checks=0,deadlines=0;
  const steps:Steps={do:async(_name,_config,perform)=>perform(),sleepUntil:async(_name,at)=>{
    assert.equal(Number(at)-Date.now(),30_000);t.mock.timers.setTime(Number(at));
  }};
  const done=await waitForWorkflowAvatars(steps,async()=>{deadlines++;return new Date(start+120*minute).toISOString();},async maySubmit=>{
    checks++;assert.equal(maySubmit,true);
    return Date.now()>=start+22*minute;
  });
  assert.equal(done,true);assert.equal(checks,45);assert.equal(deadlines,1);assert.equal(Date.now(),start+22*minute);
});

test('HeyGen toujours en cours : échéance à trente minutes et dernier contrôle sans nouvelle soumission',async t=>{
  t.mock.timers.enable({apis:['Date'],now:start});
  const checks:boolean[]=[],wakes:number[]=[];
  const steps:Steps={do:async(_name,_config,perform)=>perform(),sleepUntil:async(_name,at)=>{
    wakes.push(Number(at));t.mock.timers.setTime(Number(at));
  }};
  assert.equal(await waitForWorkflowAvatars(steps,async()=>new Date(start+120*minute).toISOString(),async maySubmit=>{checks.push(maySubmit);return false;}),false);
  assert.equal(Date.now(),start+30*minute);assert.equal(wakes.length,60);
  assert.equal(checks.length,61);assert.equal(checks.at(-1),false);assert.ok(checks.slice(0,-1).every(Boolean));
});

test('l’échéance globale borne l’attente et raccourcit la dernière pause',async t=>{
  t.mock.timers.enable({apis:['Date'],now:start});
  const end=start+2*minute+17_000,checks:boolean[]=[];
  const steps:Steps={do:async(_name,_config,perform)=>perform(),sleepUntil:async(_name,at)=>{
    assert.ok(Number(at)<=end);t.mock.timers.setTime(Number(at));
  }};
  assert.equal(await waitForWorkflowAvatars(steps,async()=>new Date(end).toISOString(),async maySubmit=>{
    checks.push(maySubmit);return false;
  }),false);
  assert.equal(Date.now(),end);assert.equal(checks.at(-1),false);
});

test('une reprise rejoue les checkpoints et conserve l’échéance initiale',async t=>{
  t.mock.timers.enable({apis:['Date'],now:start});
  const checkpoints=new Map<string,Checkpoint>(),slept=new Set<string>();
  let restart=true,deadlines=0,checks=0;
  const steps:Steps={do:async(name,_config,perform)=>{
    if(!checkpoints.has(name))checkpoints.set(name,await perform());
    return checkpoints.get(name)!;
  },sleepUntil:async(name,at)=>{
    if(slept.has(name))return;
    if(restart&&Number(at)===start+12*minute){restart=false;throw Error('SIMULATED_RESTART');}
    t.mock.timers.setTime(Math.max(Date.now(),Number(at)));slept.add(name);
  }};
  const deadline=async()=>{deadlines++;return new Date(start+120*minute).toISOString();};
  const check=async()=>{checks++;return false;};
  await assert.rejects(waitForWorkflowAvatars(steps,deadline,check),/SIMULATED_RESTART/);
  t.mock.timers.setTime(start+20*minute);
  assert.equal(await waitForWorkflowAvatars(steps,deadline,check),false);
  assert.equal(Date.now(),start+30*minute);assert.equal(deadlines,1);
  assert.equal(checkpoints.get('avatar-wait-deadline')!.deadline,start+30*minute);
  assert.ok(checks<61,'Les lectures déjà validées ne sont pas rejouées au redémarrage.');
});

test('le temps des appels fournisseur est inclus dans la fenêtre, un résultat définitif arrête immédiatement l’attente',async t=>{
  t.mock.timers.enable({apis:['Date'],now:start});
  let checks=0;
  const steps:Steps={do:async(_name,_config,perform)=>perform(),sleepUntil:async(_name,at)=>t.mock.timers.setTime(Number(at))};
  assert.equal(await waitForWorkflowAvatars(steps,async()=>new Date(start+120*minute).toISOString(),async()=>{
    checks++;t.mock.timers.setTime(Date.now()+30_000);return false;
  }),false);
  assert.equal(Date.now(),start+30*minute+30_000);assert.equal(checks,31);
  checks=0;
  assert.equal(await waitForWorkflowAvatars(steps,async()=>new Date(start+120*minute).toISOString(),async()=>{checks++;return true;}),true);
  assert.equal(checks,1);
});

test('un clip prêt lors du dernier contrôle est conservé',async t=>{
  t.mock.timers.enable({apis:['Date'],now:start});
  const steps:Steps={do:async(_name,_config,perform)=>perform(),sleepUntil:async(_name,at)=>t.mock.timers.setTime(Number(at))};
  assert.equal(await waitForWorkflowAvatars(steps,async()=>new Date(start+120*minute).toISOString(),async maySubmit=>{
    if(Date.now()===start+30*minute){assert.equal(maySubmit,false);return true;}
    return false;
  }),true);
});
