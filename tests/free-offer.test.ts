import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Database} from '../packages/db/src/index';
import {publicFreeOffer} from '../apps/web/lib/free-offer';

function database(policy:unknown):Database{
  return {prepare(sql){
    assert.equal(sql,'SELECT free_enabled,free_monthly,enabled FROM trial_policy WHERE id=1');
    return {bind(){return this;},async first<T>(){return policy as T|null;},async run(){throw Error('Read only');}};
  }};
}

test('l’offre publique suit le quota actif et les deux activations indépendantes',async()=>{
  assert.deepEqual(await publicFreeOffer(database({free_enabled:1,free_monthly:3,enabled:1}),true),{monthlyCredits:3,anonymousTrial:true});
  assert.deepEqual(await publicFreeOffer(database({free_enabled:1,free_monthly:7,enabled:0}),true),{monthlyCredits:7,anonymousTrial:false});
  assert.deepEqual(await publicFreeOffer(database({free_enabled:1,free_monthly:7,enabled:1}),false),{monthlyCredits:7,anonymousTrial:false});
  assert.deepEqual(await publicFreeOffer(database({free_enabled:0,free_monthly:3,enabled:1}),true),{monthlyCredits:null,anonymousTrial:true});
  assert.equal(await publicFreeOffer(database({free_enabled:0,free_monthly:3,enabled:1}),false),null);
});

test('aucune promesse gratuite n’est inventée en l’absence de politique ou de quota valide',async()=>{
  assert.equal(await publicFreeOffer(database(null),true),null);
  for(const free_monthly of [0,-1,1.5,'3',null,Number.NaN]){
    assert.equal(await publicFreeOffer(database({free_enabled:1,free_monthly,enabled:0}),true),null);
  }
  assert.equal(await publicFreeOffer({prepare(){throw Error('Unavailable');}},true),null);
});
