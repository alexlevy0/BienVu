import {test} from 'node:test';
import assert from 'node:assert/strict';
import {surfaceSpeechText} from '../packages/voice/src/index';

test('surfaces : lecture naturelle des décimales, sans arrondi ni perte des zéros',()=>{
  for(const [input,expected] of [
    ['291,27 m²','deux cent quatre-vingt-onze virgule vingt-sept mètres carrés'],
    ['291.27 mètres carrés','deux cent quatre-vingt-onze virgule vingt-sept mètres carrés'],
    ['291,07m2','deux cent quatre-vingt-onze virgule zéro sept mètres carrés'],
    ['42,06 M²','quarante-deux virgule zéro six mètres carrés'],
    ['12,005 mètres carrés','douze virgule zéro zéro cinq mètres carrés'],
    ['291,00 m²','deux cent quatre-vingt-onze virgule zéro zéro mètres carrés'],
    ['182,50 m²','cent quatre-vingt-deux virgule cinquante mètres carrés'],
    ['1\u202f291,27 m²','mille deux cent quatre-vingt-onze virgule vingt-sept mètres carrés'],
    ['Une surface de deux cent quatre-vingt-onze virgule deux sept mètres carrés.',
      'Une surface de deux cent quatre-vingt-onze virgule vingt-sept mètres carrés.'],
    ['Une surface de douze virgule zéro zéro deux sept mètres carrés.',
      'Une surface de douze virgule zéro zéro vingt-sept mètres carrés.'],
  ]){
    assert.equal(surfaceSpeechText(input),expected,input);
    assert.equal(surfaceSpeechText(expected),expected,'idempotent: '+input);
  }
});

test('surfaces : plusieurs mesures dans une narration et protection des autres nombres',()=>{
  assert.equal(surfaceSpeechText('291,27 m² habitables, une terrasse de 12,75 m².'),
    'deux cent quatre-vingt-onze virgule vingt-sept mètres carrés habitables, une terrasse de douze virgule soixante-quinze mètres carrés.');
  for(const text of ['291,27 euros, 06 12 34 56 78, DPE D, 291,27 kilomètres.',
    'Deux cent quatre-vingt-onze virgule deux sept euros.',
    '291 m², 1 291 m², 291,27 m³.', '291,27 m2abc, référence291,27 m².',
    'Une surface de deux cent quatre-vingt-onze virgule vingt-sept mètres carrés.'])
    assert.equal(surfaceSpeechText(text),text);
});
