import {test} from 'node:test';import assert from 'node:assert/strict';
import {avatarFrameStyle,avatarContentBounds,avatarContentStyle,defaultAvatarCustomization} from '../packages/contracts/src/avatars';
test('Avatar : marge transparente exclue, dimensions inclusives, pose vide et seuil alpha',()=>{
  const rgba=new Uint8Array(10*20*4);for(let y=5;y<=15;y++)for(let x=2;x<=7;x++)rgba[(y*10+x)*4+3]=255;
  rgba[3]=1;assert.deepEqual(avatarContentBounds(rgba,10,20),{left:2,top:5,width:6,height:11});
  assert.equal(avatarContentBounds(new Uint8Array(10*20*4),10,20),null);assert.throws(()=>avatarContentBounds(rgba,10,19),/AVATAR_PIXELS_INVALID/);
});
test('Avatar : position basse sans marge dans les deux formats, petites/grandes tailles et même cadrage dans les aperçus',()=>{
  const bounds={left:72,top:305,width:563,height:695};
  for(const [width,height] of [[1080,1920],[1920,1080],[300,533.333333],[540,960]])for(const size of [15,25,40,67,100])for(const appearance of ['circle','card','cutout'] as const){
    const settings={...defaultAvatarCustomization('fixture'),appearance,width:size,y:85};const placement=avatarFrameStyle(settings,width,height,appearance==='cutout');
    assert.ok(Math.abs(placement.top-Math.max(0,height-placement.height))<1e-8);
    const content=avatarContentStyle(bounds,720,1280,placement.width,placement.height);
    assert.ok(Math.abs(content.top+(bounds.top+bounds.height)*(content.height/1280)-placement.height)<1e-8,'Visible silhouette touches the frame bottom');
    assert.ok(Math.abs(content.width/720-content.height/1280)<1e-8,'No distortion');
    assert.ok(Number.isFinite(content.left)&&Number.isFinite(content.top));
  }
  const usual=avatarFrameStyle(defaultAvatarCustomization('fixture'),1080,1920);assert.equal(usual.top,1920*.38-usual.height/2,'Other positions preserved');
  const a=avatarFrameStyle({...defaultAvatarCustomization('fixture'),appearance:'cutout',width:67,y:85},1080,1920,true),b=avatarFrameStyle({...defaultAvatarCustomization('fixture'),appearance:'cutout',width:67,y:85},270,480,true);
  for(const key of ['width','height','top','left'] as const)assert.ok(Math.abs(a[key]/4-b[key])<1e-8);
});
