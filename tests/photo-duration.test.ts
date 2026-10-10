import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestedPhotoDuration} from '../apps/web/lib/photo-duration';

test('durée conseillée : galerie courte, 7–9 photos et 10–12 photos ; choix suffisants conservés',()=>{
  for(const count of [0,3,6])assert.equal(suggestedPhotoDuration(count,20),null);
  for(const count of [7,8,9]){
    assert.equal(suggestedPhotoDuration(count,20),30);
    assert.equal(suggestedPhotoDuration(count,30),null);
    assert.equal(suggestedPhotoDuration(count,40),null);
  }
  for(const count of [10,11,12]){
    assert.equal(suggestedPhotoDuration(count,20),40);
    assert.equal(suggestedPhotoDuration(count,30),40);
    assert.equal(suggestedPhotoDuration(count,40),null);
  }
  for(const count of [-1,NaN,Infinity,7.5])assert.equal(suggestedPhotoDuration(count,20),null);
});
