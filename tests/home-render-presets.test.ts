import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultVideoCustomization,generationCreditCost,VideoCustomization,type AvatarCatalog} from '../packages/contracts/src/index';
import {applyHomeRenderPreset,homeRenderExampleCredits,homeRenderPresets,parseHomeRenderPreset,presetAvatar} from '../apps/web/lib/home-render-presets';

const catalog:AvatarCatalog={enabled:true,allowPremium:false,maxSeconds:6,current:null,revision:1,defaultLookId:'fixture-avatar',looks:[{
  id:'fixture-avatar',name:'Présentatrice',gender:'female',type:'studio_avatar',engines:['avatar_iii'],enabled:true,thumbnail:null,preview:null,transparentVerified:false,ownership:'public',updatedAt:new Date().toISOString()}]};
test('Trois rendus : les prix utilisent les règles produit et les options réelles de la sélection',()=>{
  const base=defaultVideoCustomization(),avatar=presetAvatar(catalog),slots=[29,18,7,2];
  assert.deepEqual(homeRenderPresets.map(p=>homeRenderExampleCredits(p.id)),[1,3,7]);
  for(const [index,preset] of homeRenderPresets.entries()){
    const settings=VideoCustomization.parse(applyHomeRenderPreset(preset.id,base,slots,avatar));
    assert.equal(generationCreditCost(settings,20),[1,3,7][index]);assert.deepEqual(settings.photoOrder,slots);
    assert.deepEqual(settings.runwayPhotos,index===2?slots:[]);assert.equal(settings.avatar?.moments,index===0?undefined:'full');
    assert.equal(generationCreditCost(settings,40),[1,5,9][index]);
  }
  assert.equal(parseHomeRenderPreset('__proto__'),null);assert.equal(parseHomeRenderPreset(null),null);assert.equal(parseHomeRenderPreset('avatar-ai'),'avatar-ai');
  assert.equal(base.avatar,undefined);assert.equal(avatar.moments,'full');
});
test('Présélection : respect du catalogue et des capacités, aucune activation prémium implicite',()=>{
  assert.throws(()=>presetAvatar({...catalog,enabled:false}),/indisponibles/);
  assert.throws(()=>presetAvatar({...catalog,looks:[]}),/Aucun présentateur/);
  const premium={...catalog,looks:[{...catalog.looks[0],engines:['avatar_iv' as const]}]};
  assert.throws(()=>presetAvatar(premium),/plus disponible/);assert.equal(presetAvatar({...premium,allowPremium:true}).engine,'avatar_iv');
  const avatar=presetAvatar(catalog);assert.equal(presetAvatar(catalog,{...avatar,lookId:'removed',width:40,hidden:true}).lookId,'fixture-avatar');
  assert.equal(presetAvatar(catalog,{...avatar,width:40,hidden:true}).hidden,undefined);
  assert.equal(applyHomeRenderPreset('standard',{...defaultVideoCustomization(),avatar},[0,1,2]).avatar,undefined);
});
