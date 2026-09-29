export const VIDEO_SAFE = {left: 88, right: 160, top: 190, bottom: 320, width: 832};
export function contrastInk(color: string) {
  const rgb = color.match(/[a-f\d]{2}/gi)?.map(h => parseInt(h, 16) / 255) ?? [0,0,0];
  const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 > .179 ? '#101d18' : '#ffffff';
}
// Mesure conservatrice en unités de largeur : pas de texte tronqué. Les très
// longues phrases sont affichées en groupes successifs, sans alignement mot à mot.
export function subtitleGroups(text: string, limit = 100): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  const groups: string[] = [];
  for (const sentence of sentences) {
    let current = '';
    for (const word of sentence.trim().split(/\s+/)) {
      if (current && (current + ' ' + word).length > limit) {groups.push(current); current = '';}
      current += (current ? ' ' : '') + word;
    }
    if (current) groups.push(current);
  }
  return groups.length ? groups : [text];
}
const fitted=new Map<string,number>();
export function fitFont(text: string, width: number, height: number, maximum: number, minimum = 24) {
  const ready=typeof document!=='undefined'&&Array.from(document.fonts).some(f=>f.family==='BienVu Video'&&f.status==='loaded');
  const key=JSON.stringify([text,width,height,maximum,minimum]);
  if(ready&&fitted.has(key))return fitted.get(key)!;
  const context=ready?document.createElement('canvas').getContext('2d'):null;
  for (let size = maximum; size >= minimum; size--) {
    if(context)context.font=`650 ${size}px "BienVu Video"`;
    const measure=(s:string)=>context?context.measureText(s).width:s.length*size*.7;
    const rows=text.split('\n').reduce((sum,paragraph)=>{
      let line='',count=1;
      for(const word of paragraph.split(' ')) {
        const next=line?line+' '+word:word;
        if(measure(next)<=width){line=next;continue;}
        if(line){count++;line='';}
        for(const char of word){if(line&&measure(line+char)>width){count++;line='';}line+=char;}
      }
      return sum+count;
    },0);
    if (rows * size * 1.3 <= height) {if(ready)fitted.set(key,size);return size;}
  }
  return minimum;
}
