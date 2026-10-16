'use client';
import {useState} from 'react';
import {HomeIcon} from './home-icons';
import {urlImportPhotoSlots,type PreparedUrlImport} from './url-import-estimate';

export function HomeImportPreview({value,credits,busy,onPersonalize}:{value:PreparedUrlImport;credits:number;busy:boolean;onPersonalize():void}){
  const photos=value.listing?.photos??value.draft?.photos??[],photo=photos[0];
  const title=value.listing?.facts.title.value??value.draft?.data.fields.title??'Votre annonce';
  const locality=value.listing?.facts.locality.value??value.draft?.data.fields.locality;
  const [failedImage,setFailedImage]=useState<string|null>(null);
  return <section className="home-import-preview" aria-label="Votre annonce importée" aria-live="polite">
    <div className="home-import-cover">{photo&&failedImage!==photo.id?<img key={photo.id} src={`/api/imports/${encodeURIComponent(value.id)}/photos/${encodeURIComponent(photo.id)}`} alt="Première photo de votre annonce" width="120" height="120" decoding="async" onError={()=>setFailedImage(photo.id)}/>:<HomeIcon name="house" size={27}/>}</div>
    <div className="home-import-copy"><span><HomeIcon name="check" size={14}/>Annonce reconnue</span><h3>{title}</h3>{locality&&<p><HomeIcon name="pin" size={14}/>{locality}</p>}<p>{photos.length} photo{photos.length>1?'s':''} trouvée{photos.length>1?'s':''} · {urlImportPhotoSlots(value).length} sélectionnée{urlImportPhotoSlots(value).length>1?'s':''}</p>{value.status==='needs_input'&&<p>Quelques informations restent à compléter.</p>}</div>
    <div className="home-import-action"><strong>{credits} crédit{credits>1?'s':''} <small>estimé{credits>1?'s':''}</small></strong><button type="button" disabled={busy} onClick={onPersonalize}>Choisir mes photos <HomeIcon name="arrow" size={16}/></button></div>
  </section>;
}
