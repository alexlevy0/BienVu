import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reserve,summary,containerGrossUsd,type Budget} from '../apps/pipeline/src/budget';
import {MAX_MONTHLY_BUDGET_CENTS,MIN_BUDGET_SAFETY_MARGIN_CENTS} from '../packages/contracts/src/admin';
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
test('hausse explicite à 50 € : la coupure 45 € garde 5 € de marge',()=>{
  const old={...fresh(),fixedAndOtherCents:3475,committedCents:25,attempts:1,days:{'2026-09-27':1}};
  assert.throws(()=>reserve({...old,ceilingCents:3500,envelopeCents:4000},now),/BUDGET_LIMIT/);
  const raised=reserve({...old,ceilingCents:4500,envelopeCents:5000},now);
  assert.equal(raised.fixedAndOtherCents,old.fixedAndOtherCents);
  assert.equal(summary(raised).remainingEnvelopeCents,1450);
  assert.throws(()=>reserve({...raised,ceilingCents:4501},now),/BUDGET_CONFIG_INVALID/);
  assert.throws(()=>reserve({...raised,envelopeCents:MAX_MONTHLY_BUDGET_CENTS+1},now),/BUDGET_CONFIG_INVALID/);
});

test('enveloppe 100 € explicitement autorisée : coupure 90 €, frais historiques conservés',()=>{
  const b=reserve({...fresh(),fixedAndOtherCents:4475,committedCents:25,attempts:1,ceilingCents:9000,envelopeCents:10000},now);
  assert.equal(b.fixedAndOtherCents,4475);assert.equal(b.committedCents,75);
  assert.equal(summary(b).remainingEnvelopeCents,5450);
  assert.throws(()=>reserve({...b,fixedAndOtherCents:8880},now),/BUDGET_LIMIT/);
  assert.throws(()=>reserve({...b,ceilingCents:9501},now),/BUDGET_CONFIG_INVALID/);
});

test('enveloppe 200 € : rendu autorisé, marge et réservations historiques conservées',()=>{
  const previous={...fresh(),fixedAndOtherCents:9050,committedCents:100,attempts:2,days:{'2026-09-27':2},ceilingCents:9000,envelopeCents:10000};
  assert.throws(()=>reserve(previous,now),/BUDGET_LIMIT/);
  const raised=reserve({...previous,ceilingCents:18000,envelopeCents:20000},now);
  assert.equal(raised.fixedAndOtherCents,previous.fixedAndOtherCents);
  assert.equal(raised.committedCents,150);assert.equal(raised.attempts,3);assert.equal(raised.days['2026-09-27'],3);
  assert.equal(summary(raised).remainingEnvelopeCents,10800);
  assert.throws(()=>reserve({...raised,fixedAndOtherCents:17801},now),/BUDGET_LIMIT/);
  assert.doesNotThrow(()=>reserve({...raised,ceilingCents:19500},now));
  for(const invalid of [{ceilingCents:MAX_MONTHLY_BUDGET_CENTS-MIN_BUDGET_SAFETY_MARGIN_CENTS+1},{envelopeCents:MAX_MONTHLY_BUDGET_CENTS+1},{envelopeCents:18499},{ceilingCents:18000.5}])
    assert.throws(()=>reserve({...raised,...invalid},now),/BUDGET_CONFIG_INVALID/);
  assert.equal(summary(fresh()).envelopeCents,3000,'Aucune augmentation implicite des anciens journaux');
});

test('montant administrateur à 300 € : rendu autorisé et coupure choisie respectée',()=>{
  const initial={...fresh(),fixedAndOtherCents:20500,ceilingCents:28000,envelopeCents:30000};
  const b=reserve(initial,now);assert.equal(b.committedCents,50);assert.equal(summary(b).envelopeCents,30000);
  assert.throws(()=>reserve({...initial,fixedAndOtherCents:27951},now),/BUDGET_LIMIT/);
  assert.throws(()=>reserve({...initial,ceilingCents:29501},now),/BUDGET_CONFIG_INVALID/);
});
