import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reserve,summary,containerGrossUsd,type Budget} from '../apps/pipeline/src/budget';
const now=new Date('2026-09-27T12:00:00Z');
const fresh=():Budget=>({month:'2026-09',paused:false,fixedAndOtherCents:800,committedCents:0,attempts:0,days:{}});
test('5 tentatives maximum ; les échecs ne réinitialisent pas le budget',()=>{
  let b=fresh();for(let i=0;i<5;i++)b=reserve(b,now);
  assert.equal(b.attempts,5);assert.equal(b.committedCents,250);assert.throws(()=>reserve(b,now),/SPRINT_RENDER_LIMIT/);
  assert.equal(summary(b).remainingEnvelopeCents,1950);
});
test('frais déjà engagés + réservation respectent la pause à 25 €',()=>{
  assert.throws(()=>reserve({...fresh(),fixedAndOtherCents:2460},now),/BUDGET_LIMIT/);
  assert.equal(summary({...fresh(),committedCents:1200}).alert,true);
});
test('coupe-circuit et changement de mois exigent action opérateur',()=>{
  assert.throws(()=>reserve({...fresh(),paused:true},now),/PROBES_PAUSED/);
  assert.throws(()=>reserve(fresh(),new Date('2026-10-01T00:00:00Z')),/RECONCILIATION/);
});
test('coût brut inclut RAM/disque provisionnés pendant tout le temps actif',()=>{
  assert.ok(Math.abs(containerGrossUsd(120,120)-0.0043008)<1e-10);
  assert.throws(()=>containerGrossUsd(-1,120));
});
