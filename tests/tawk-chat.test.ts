import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareTawkChat,resumeTawkChat,suspendTawkChat,tawkChatAllowed,tawkNavigationStart} from '../apps/web/lib/tawk-chat';

test('support is available on public and studio pages, separately from analytics consent',()=>{
  for(const path of ['/','/blog','/abonnement','/partenaires','/confidentialite','/connexion','/agence','/biens/fixture','/editeur?draft=fixture','/publications'])assert.equal(tawkChatAllowed(path),true,path);
});

test('support rejects admin, private validation and credential-bearing URLs',()=>{
  for(const path of ['/admin?view=system','/admin/fixture','/validation/private-link','/api/social/oauth/callback','/connexion?token=secret','/agence?code=secret','/connexion?access_token=secret','/connexion?state=secret','/abonnement?session_id=secret','/?homePreview=secret','/connexion#token=secret'])assert.equal(tawkChatAllowed(path),false,path);
});

test('a deferred widget cannot start on a private page; it resumes once on returning',()=>{
  const calls:string[]=[],mock={location:{href:'https://bienvu.online/'},Tawk_API:{start:()=>calls.push('start'),showWidget:()=>calls.push('show'),hideWidget:()=>calls.push('hide'),shutdown:()=>calls.push('shutdown')}};
  const original=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{value:mock,configurable:true});
  try{
    prepareTawkChat();prepareTawkChat();
    assert.equal(window.Tawk_API?.autoStart,false);
    assert.equal(window.Tawk_API?.customStyle?.zIndex,40);
    assert.ok(window.Tawk_LoadStart instanceof Date);
    assert.deepEqual([...calls],[]);
    mock.location.href='https://bienvu.online/validation/secret';
    window.Tawk_API?.onStatusChange?.('online');
    assert.deepEqual([...calls],['hide','shutdown']);
    mock.location.href='https://bienvu.online/editeur';
    resumeTawkChat();resumeTawkChat();
    assert.deepEqual(calls.slice(2),['start','show']);
    calls.length=0;tawkNavigationStart('/blog');assert.deepEqual([...calls],[]);
    tawkNavigationStart('/admin');assert.deepEqual([...calls],['hide','shutdown']);
    mock.location.href='https://bienvu.online/admin';resumeTawkChat();
    assert.equal(calls.includes('start'),false);
    mock.location.href='https://bienvu.online/';resumeTawkChat();
    assert.equal(calls.at(-1),'start');suspendTawkChat();
  }finally{if(original)Object.defineProperty(globalThis,'window',original);else Reflect.deleteProperty(globalThis,'window');}
});
