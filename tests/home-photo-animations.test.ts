import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultVideoCustomization,defaultAvatarCustomization,generationCreditCost,GenerationCustomization,requestedAnimations} from '../packages/contracts/src/index';
import {withPhotoAnimationChoice} from '../apps/web/lib/photo-animation-choice';
import {applyHomeRenderPreset} from '../apps/web/lib/home-render-presets';

test('animations de la homepage : estimation et requête suivent les photos choisies, y compris après la douzième',()=>{
  const slots=[29,18,7,2],base=defaultVideoCustomization();
  const enabled=withPhotoAnimationChoice(base,slots,true);
  assert.deepEqual(enabled.photoOrder,slots);assert.deepEqual(enabled.runwayPhotos,slots);
  assert.equal(generationCreditCost(enabled),5);assert.equal(GenerationCustomization.safeParse(enabled).success,true);
  const disabled=withPhotoAnimationChoice(enabled,slots,false);
  assert.deepEqual(disabled.runwayPhotos,[]);assert.equal(generationCreditCost(disabled),1);
  assert.equal(disabled.photoMotion,true);assert.equal(disabled.transition,base.transition);
  assert.equal(base.runwayPhotos,undefined);assert.deepEqual(slots,[29,18,7,2]);
});
test('animations de la homepage : le toggle prime sur la présélection sans retirer ni refacturer l’avatar',()=>{
  const slots=[0,1,2,3],avatar={...defaultAvatarCustomization('fixture'),moments:'full' as const};
  const preset=applyHomeRenderPreset('avatar-ai',defaultVideoCustomization(),slots,avatar);
  const disabled=withPhotoAnimationChoice(preset,slots,false);
  assert.deepEqual(disabled.avatar,preset.avatar);assert.equal(generationCreditCost(disabled,40),5);
  const enabled=withPhotoAnimationChoice(disabled,slots,true);assert.equal(generationCreditCost(enabled,40),9);
  assert.equal(GenerationCustomization.safeParse(enabled).success,true);
});
test('animations de la homepage : remplacement du compteur historique et sélection partielle avant choix global',()=>{
  const partial={...defaultVideoCustomization(),photoOrder:[20,5,9,1],runwayPhotos:[5,1]};
  assert.equal(requestedAnimations(partial),2);assert.equal(generationCreditCost(partial),3);
  assert.deepEqual(withPhotoAnimationChoice(partial,partial.photoOrder,true).runwayPhotos,[20,5,9,1]);
  assert.deepEqual(withPhotoAnimationChoice({...partial,runwayPhotos:undefined,runwayClips:2},partial.photoOrder,false).runwayPhotos,[]);
  assert.equal(withPhotoAnimationChoice({...partial,runwayPhotos:undefined,runwayClips:2},partial.photoOrder,false).runwayClips,undefined);
  assert.deepEqual(partial.runwayPhotos,[5,1]);
});
test('animations de la homepage : 30 photos importées ne facturent jamais plus de 12 photos sélectionnées',()=>{
  const slots=Array.from({length:30},(_,i)=>i),enabled=withPhotoAnimationChoice(defaultVideoCustomization(),slots,true);
  assert.equal(enabled.photoOrder?.length,12);assert.equal(enabled.runwayPhotos?.length,12);
  assert.equal(generationCreditCost(enabled),13);assert.equal(GenerationCustomization.safeParse(enabled).success,true);
});
