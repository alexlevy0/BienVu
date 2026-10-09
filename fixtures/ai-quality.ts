import type {QualityFacts} from '../packages/contracts/src/ai-quality';
export type QualityReference={id:string;facts:QualityFacts;source:string;narration:string;expected:{key:string;status:'pass'|'fail'|'na'}[];humanOnly?:string};
const base:QualityFacts={transaction:'sale',propertyType:'house',locality:'Lyon',price:{amountCents:20000000,period:'total'},area:65,rooms:3};
export const qualityReferences:QualityReference[]=[
  ...['200 000 €','200000 euros','200 k€','0,2 M€','0,2 million euros','200\u202f000 €','200\u00a0000 euros','200 K euros'].map((price,i)=>({id:`price-equivalent-${i}`,facts:base,source:'Maison à Lyon, 200000 euros.',narration:`Maison à vendre pour ${price}.`,expected:[{key:'price',status:'pass' as const}]})),
  ...['199 000 €','20 000 euros','2000 k€','2 M€','1,2 million euros','200,01 euros','2\u202f000 €','210 K euros'].map((price,i)=>({id:`price-contradiction-${i}`,facts:base,source:'Maison à Lyon, 200000 euros.',narration:`Maison à vendre pour ${price}.`,expected:[{key:'price',status:'fail' as const}]})),
  ...[65,65.5,80,120,350].flatMap((area,i)=>[
    {id:`surface-confirmed-${i}`,facts:{...base,area},source:`Surface ${area} m².`,narration:`Découvrez ${String(area).replace('.',',')} mètres carrés.`,expected:[{key:'area',status:'pass' as const}]},
    {id:`surface-contradiction-${i}`,facts:{...base,area},source:`Surface ${area} m².`,narration:`Découvrez ${area+10} m².`,expected:[{key:'area',status:'fail' as const}]},
  ]),
  ...[1,2,3,5,7].flatMap((rooms,i)=>[
    {id:`rooms-confirmed-${i}`,facts:{...base,rooms},source:`${rooms} pièces.`,narration:`Ce bien de ${rooms} pièces dispose de deux chambres.`,expected:[{key:'rooms',status:'pass' as const}]},
    {id:`bedrooms-not-rooms-${i}`,facts:{...base,rooms},source:`${rooms} pièces.`,narration:`Ce bien dispose de ${rooms+1} chambres.`,expected:[{key:'rooms',status:'na' as const}]},
    {id:`rooms-contradiction-${i}`,facts:{...base,rooms},source:`${rooms} pièces.`,narration:`Ce bien comporte ${rooms+1} pieces.`,expected:[{key:'rooms',status:'fail' as const}]},
  ]),
  {id:'rent-monthly-price',facts:{...base,transaction:'rent',price:{amountCents:92000,period:'month'}},source:'Studio à louer 920 euros par mois.',narration:'Ce studio à louer pour 920 € par mois.',expected:[{key:'price',status:'pass'},{key:'transaction',status:'pass'}]},
  {id:'rent-presented-as-sale',facts:{...base,transaction:'rent'},source:'Location.',narration:'Cette maison est à vendre.',expected:[{key:'transaction',status:'fail'}]},
  {id:'sale-presented-as-rent',facts:base,source:'Vente.',narration:'La maison est à louer.',expected:[{key:'transaction',status:'fail'}]},
  {id:'missing-price-invented',facts:{...base,price:null},source:'Prix sur demande.',narration:'Une maison pour 200 000 €.',expected:[{key:'price',status:'fail'}]},
  {id:'missing-price-omitted',facts:{...base,price:null},source:'Prix sur demande.',narration:'Découvrez cette maison lumineuse.',expected:[{key:'price',status:'na'}]},
  {id:'missing-area-invented',facts:{...base,area:null},source:'Surface non renseignée.',narration:'Une surface de 65 m².',expected:[{key:'area',status:'fail'}]},
  {id:'missing-rooms-invented',facts:{...base,rooms:null},source:'Nombre de pièces non renseigné.',narration:'Une maison de 3 pièces.',expected:[{key:'rooms',status:'fail'}]},
  {id:'garage-extra-preserved',facts:base,source:'Un garage est proposé en supplément.',narration:'Un garage en option complète ce bien.',expected:[{key:'qualifications',status:'pass'}]},
  {id:'garage-extra-lost',facts:base,source:'Garage en supplément.',narration:'Cette maison dispose d’un garage.',expected:[{key:'qualifications',status:'fail'}]},
  {id:'garage-omitted',facts:base,source:'Garage en supplément.',narration:'Une maison lumineuse avec un jardin.',expected:[{key:'qualifications',status:'pass'}]},
  {id:'parking-extra-lost',facts:base,source:'Parking en option.',narration:'Profitez d’un parking.',expected:[{key:'qualifications',status:'fail'}]},
  {id:'no-lift-preserved',facts:base,source:'Appartement sans ascenseur.',narration:'Un appartement sans ascenseur.',expected:[{key:'qualifications',status:'pass'}]},
  {id:'no-lift-contradiction',facts:base,source:'Appartement sans ascenseur.',narration:'Cet appartement avec ascenseur est lumineux.',expected:[{key:'qualifications',status:'fail'}]},
  {id:'development-possibility',facts:base,source:'Possibilité d’aménager les combles.',narration:'Les combles sont déjà aménagés.',expected:[],humanOnly:'Une possibilité ne doit pas être affirmée comme réalisée.'},
  ...['LYON','BORDEAUX','SAINT-ÉTIENNE','SANARY-SUR-MER','AIX-EN-PROVENCE','L’ISLE-ADAM','Le Havre','LYON 6E'].map((city,i)=>({id:`speech-locality-${i}`,facts:{...base,locality:city},source:`Maison à ${city}.`,narration:`Découvrez cette maison à ${city}.`,expected:[]})),
];
