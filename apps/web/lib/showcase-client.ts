export async function showcaseRequest<T>(url:string,init?:RequestInit):Promise<T>{const response=await fetch(url,{cache:'no-store',...init}),body=await response.json() as T&{error?:{message?:string};fields?:Record<string,string>};
  if(!response.ok)throw new Error([body.error?.message??'La demande a échoué.',...Object.values(body.fields??{})].join(' '));return body as T;}

export function showcaseInitials(name:string){const words=name.trim().split(/[\s-]+/).filter(word=>!['agence','immobilier','immobilière','de','du','la','le','les','et'].includes(word.toLocaleLowerCase('fr-FR')));return (words.length?words:name.trim().split(/\s+/)).slice(0,2).map(word=>Array.from(word)[0]??'').join('').toLocaleUpperCase('fr-FR')||'A';}
