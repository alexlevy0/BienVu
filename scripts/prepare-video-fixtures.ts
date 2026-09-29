import {makeVideoFixture} from './video-fixtures';
for(const kind of ['trial','paid'] as const) {
  const {directory,manifest}=await makeVideoFixture(kind);
  console.log(JSON.stringify({kind,directory,scenes:manifest.scenes.length,newTtsCalls:0,newTextCalls:0}));
}
