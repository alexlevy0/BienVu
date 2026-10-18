import {test} from 'node:test';
import assert from 'node:assert/strict';
import {heroCardPosition} from '../apps/web/lib/hero-carousel';
import {HomepageCommand} from '../packages/contracts/src/homepage';

test('Hero carousel: every selection brings exactly one stable card forward and keeps its two neighbours',()=>{
 for(const selected of [0,1,2]){
  const positions=[0,1,2].map(index=>heroCardPosition(index,selected));
  assert.equal(positions[selected],0);
  assert.deepEqual([...positions].sort(),[-1,0,1]);
  assert.equal(heroCardPosition((selected+1)%3,selected),1);
  assert.equal(heroCardPosition((selected+2)%3,selected),-1);
 }
 assert.deepEqual([0,1,2].map(index=>heroCardPosition(index,1)),[-1,0,1]);
});
test('Hero companions can be replaced or withdrawn through the existing homepage publication workflow',()=>{
 for(const slot of ['hero.left.video','hero.right.video'])for(const source of [null,{kind:'video',id:crypto.randomUUID()}]){
  assert.ok(HomepageCommand.safeParse({action:'assign',slot,source,revision:1,requestId:crypto.randomUUID()}).success);
 }
});
