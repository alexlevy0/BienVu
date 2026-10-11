import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordProgress,remainingEstimate,remainingEstimateText,type ProgressSample} from '../apps/web/lib/generation-estimate';
const at=(seconds:number)=>new Date(seconds*1000).toISOString();

test('estimation : checkpoints réels, chargement tardif et horloges distinctes',()=>{
  let samples:ProgressSample[]=[];
  samples=recordProgress(samples,0,at(0),90_000);assert.deepEqual(remainingEstimate(samples,90_000),{kind:'estimating'});
  samples=recordProgress(samples,20,at(20),100_000);assert.deepEqual(remainingEstimate(samples,100_000),{kind:'estimating'});
  samples=recordProgress(samples,40,at(40),120_000);
  assert.deepEqual(remainingEstimate(samples,120_000),{kind:'countdown',seconds:55});
  assert.deepEqual(remainingEstimate(samples,125_000),{kind:'countdown',seconds:50});
  const delayed=recordProgress(recordProgress([],50,at(50),1000_000),60,at(60),1010_000);
  assert.deepEqual(remainingEstimate(delayed,1010_000),{kind:'countdown',seconds:35});
  assert.deepEqual(remainingEstimate([],NaN),{kind:'estimating'});
});

test('estimation : ralentissement, checkpoints dupliqués et retour périmé',()=>{
  const samples=recordProgress(recordProgress([],20,at(20),100_000),40,at(40),120_000);
  for(const [percent,timestamp] of [[40,at(60)],[30,at(70)],[50,at(30)],[99.5,at(50)],[55,'invalide']] as const)
    assert.equal(recordProgress(samples,percent,timestamp,130_000),samples);
  const slower=recordProgress(samples,50,at(70),150_000);
  const estimate=remainingEstimate(slower,150_000);assert.equal(estimate.kind,'countdown');
  assert.ok(estimate.kind==='countdown'&&estimate.seconds>55,'The estimate must increase when progress slows');
  assert.deepEqual(remainingEstimate(samples,146_000),{kind:'estimating'},'No countdown from a stalled checkpoint');
  assert.deepEqual(remainingEstimate(samples,120_000,true),{kind:'unavailable'});
  assert.deepEqual(remainingEstimate(recordProgress(recordProgress([],1,at(1),1000),4,at(200),200_000),200_000),{kind:'estimating'},'Do not invent a ten-minute deadline');
});

test('estimation : marge de finalisation, attente sans faux zéro et historique borné',()=>{
  let samples=recordProgress([],85,at(85),85_000);
  assert.deepEqual(remainingEstimate(samples,85_000),{kind:'countdown',seconds:10});
  assert.deepEqual(remainingEstimate(samples,95_000),{kind:'finishing'});
  for(const percent of [86,88,90,93,95,96,97,98,99])samples=recordProgress(samples,percent,at(percent),percent*1000);
  assert.ok(samples.length<=6);assert.equal(samples[0].percent,85);
  assert.deepEqual(remainingEstimate(samples,100_000),{kind:'finishing'},'New finishing checkpoints must not restart the timer');
  assert.equal(remainingEstimateText({kind:'finishing'}),'Finalisation en cours…');
  assert.equal(remainingEstimateText({kind:'countdown',seconds:65}),'≈ 1 min 05 s restantes');
});
