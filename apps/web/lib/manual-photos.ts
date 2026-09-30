import {MANUAL_PHOTO_LIMITS} from '@bienvu/contracts';

// Browser validation shared by the composer and the manual form. Server checks
// remain authoritative when files are uploaded.
export async function inspectManualPhotos(files:readonly File[],existingSizes:readonly number[]=[]){
  const failure=existingSizes.length+files.length>MANUAL_PHOTO_LIMITS.maximum?'Choisissez 12 photos maximum.'
    :files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type))?'Utilisez des photos JPEG, PNG ou WebP.'
    :files.some(f=>!f.size||f.size>MANUAL_PHOTO_LIMITS.fileBytes)?'Chaque photo doit peser moins de 10 Mo.'
    :[...existingSizes,...files.map(f=>f.size)].reduce((sum,size)=>sum+size,0)>MANUAL_PHOTO_LIMITS.totalBytes
      ?'Les photos dépassent 50 Mo au total.':'';
  if(failure)return {accepted:[] as File[],issues:[failure]};
  const accepted:File[]=[],issues:string[]=[];
  for(const file of files){
    try{const bitmap=await createImageBitmap(file),{width,height}=bitmap;bitmap.close();
      if(width<640||height<360||width*height>16_000_000)
        issues.push(`${file.name} : 640 × 360 pixels minimum, 16 millions de pixels maximum.`);
      else accepted.push(file);
    }catch{issues.push(`${file.name} : cette image ne peut pas être lue.`);}
  }
  return {accepted,issues};
}
