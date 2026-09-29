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
test('hausse explicite à 40 € : historique préservé, coupure 35 € et marge de 5 €',()=>{
  const old={...fresh(),fixedAndOtherCents:2425,committedCents:50,attempts:1,days:{'2026-09-27':1}};
  assert.throws(()=>reserve(old,now),/BUDGET_LIMIT/);
  const raised=reserve({...old,ceilingCents:3500,envelopeCents:4000},now);
  assert.equal(raised.attempts,2);assert.equal(raised.committedCents,100);assert.equal(raised.days['2026-09-27'],2);
  assert.equal(summary(raised).remainingEnvelopeCents,1475);
  assert.throws(()=>reserve({...raised,fixedAndOtherCents:3351},now),/BUDGET_LIMIT/);
  assert.throws(()=>reserve({...raised,ceilingCents:3501},now),/BUDGET_CONFIG_INVALID/);
  assert.throws(()=>reserve({...raised,envelopeCents:3500},now),/BUDGET_CONFIG_INVALID/);
});
