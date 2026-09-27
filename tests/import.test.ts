import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractJsonLd} from '../packages/importers/src/extract';
import {ImportFailure} from '../packages/contracts/src/index';
import {extractAgency} from '../packages/importers/src/espaces-atypiques';
const url='https://agency.example/listing/fixture';
function fixture(){return {'@type':'RealEstateListing',mainEntity:{'@type':'Apartment',name:'Appartement synthétique',address:{addressLocality:'Ville de recette'},floorSize:{value:62,unitCode:'MTK'},image:['/a.png','/b.png','/c.png'],offers:{price:300000,priceCurrency:'EUR',businessFunction:'http://purl.org/goodrelations/v1#Sell'}}};}
test('faits sourcés et unités explicites sur fixture',()=>{
  const result=extractJsonLd([fixture()],url);assert.equal(result.priceCents?.value,30000000);assert.equal(result.areaM2?.value,62);assert.equal(result.locality.status,'verified');assert.equal(result.photoUrls.length,3);
});
test('biens voisins et plusieurs annonces ne sont pas mélangés',()=>{
  assert.throws(()=>extractJsonLd([fixture(),fixture()],url),(e:unknown)=>e instanceof ImportFailure&&e.code==='CONFLICTING_FACTS');
  const value=fixture();value.mainEntity.image=['/a.png','/a.png','/a.png'];
  assert.throws(()=>extractJsonLd([value],url),(e:unknown)=>e instanceof ImportFailure&&e.code==='INSUFFICIENT_PHOTOS');
});
test('prix contradictoires bloquent le résultat',()=>{
  const value={...fixture(),offers:{price:250000,priceCurrency:'EUR'}};
  assert.throws(()=>extractJsonLd([value],url),(e:unknown)=>e instanceof ImportFailure&&e.code==='CONFLICTING_FACTS');
});
test('loyer jamais présenté comme prix de vente',()=>{
  const value=fixture();value.mainEntity.offers.businessFunction='http://purl.org/goodrelations/v1#LeaseOut';
  const result=extractJsonLd([value],url);assert.equal(result.transaction,'rent');assert.equal(result.priceCents,null);
});
test('prix et surface non vérifiables sont omis, pas remplacés par zéro',()=>{
  const value=fixture();value.mainEntity.offers.businessFunction='';value.mainEntity.floorSize.unitCode='SQF';
  const result=extractJsonLd([value],url);assert.equal(result.priceCents,null);assert.equal(result.areaM2,null);
});
test('page agence seule ou identité incomplète ne compte pas comme annonce',()=>{
  assert.throws(()=>extractJsonLd([{'@type':'RealEstateAgent'}],url));
  const value=fixture();value.mainEntity.address.addressLocality='';assert.throws(()=>extractJsonLd([value],url));
});
test('adaptateur agence : galerie limitée à la référence, contradiction bloquante',()=>{
  const source='https://www.espaces-atypiques.com/ventes/test-123/';
  const data={title:'Maison synthétique',canonical:source,data:[{reference:'123',status:'envente',type_de_bien:'Maison',ville:'Ville de recette',prix_vente:'240000'}],gallery:['a','b','c'].map(x=>`https://www.espaces-atypiques.com/wp-content/uploads/agency/123/${x}.jpg`),summary:'Ville de recette 240 000 €'};
  assert.equal(extractAgency(data,source).priceCents?.value,24000000);
  assert.equal(extractAgency(data,source).areaM2,null);
  assert.throws(()=>extractAgency({...data,summary:'250 000 €'},source),/contradictoires/);
  assert.throws(()=>extractAgency({...data,gallery:data.gallery.map(p=>p.replace('/123/','/999/'))},source),/insuffisante/);
  assert.throws(()=>extractAgency({...data,canonical:'https://www.espaces-atypiques.com/ventes/other-999/'},source),/canonique/);
});
