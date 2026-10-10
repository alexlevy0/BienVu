import type {SocialPublication} from '@bienvu/contracts';

export type CalendarPublication = SocialPublication & {thumbnail?: string; formatLabel?: string};
export function socialCalendarPreview(month: Date, now = new Date()): CalendarPublication[] {
  const properties = [
    {title:'Un appartement lumineux à Paris',place:'à Paris',visual:'paris',detail:'Lumière et beaux volumes',caption:'Un nouveau regard sur ce bel appartement. Découvrez ses espaces et sa lumière en vidéo.'},
    {title:'Une maison au bord de la piscine',place:'sur la Côte d’Azur',visual:'sud',detail:'Une piscine pour les beaux jours',caption:'Un jardin, une piscine et de beaux espaces de vie. Votre prochain coup de cœur se découvre en vidéo.'},
    {title:'Un loft de caractère à Lyon',place:'à Lyon',visual:'lyon',detail:'Des volumes pleins de caractère',caption:'Volumes, matières et caractère : une visite en vidéo pour imaginer votre prochain lieu de vie.'},
    {title:'Une maison avec jardin à Bordeaux',place:'à Bordeaux',visual:'bordeaux',detail:'Un jardin au cœur de la ville',caption:'Une maison de charme et son jardin. Découvrez un cadre de vie où profiter de chaque saison.'},
  ];
  // Twenty-four examples on twenty-three dates; all dates exist in February too.
  // Every poster and video is public demo media, never an agency's private asset.
  const dates=[1,2,3,5,6,7,8,10,11,12,12,14,15,16,18,19,20,21,23,24,25,26,27,28];
  const formats=['Reel','Visite vidéo','Coup de cœur','Les détails','Inspiration','À découvrir'];
  return dates.map<CalendarPublication>((day, index) => {
    const example=properties[index%properties.length],round=Math.floor(index/properties.length);
    const at = new Date(month.getFullYear(), month.getMonth(), day, index%3===0?12:18, index%2===0?0:30).toISOString();
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12,'0')}`;
    const published = new Date(at).getTime() <= now.getTime();
    const title=round===2?`Coup de cœur ${example.place}`:round===3?example.detail:round===4?`Imaginez votre quotidien ${example.place}`:round===5?`À découvrir ${example.place}`:example.title;
    const targets=([{platform:'instagram',name:'Votre agence · Instagram'},{platform:'facebook',name:'Votre agence · Facebook'}] as const)
      .filter(target=>index%3===0||target.platform===(index%2===0?'instagram':'facebook'));
    return {id, jobId:id, title, caption:example.caption, scheduledAt:at,formatLabel:formats[round],
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris', createdAt:at, expiresAt:at,
      aspectRatio:'9:16', durationSeconds:28, videoUrl:`/videos/studio-home/${example.visual}.mp4`, thumbnail:`/images/studio-home/${example.visual}.webp`,
      targets:targets.map((target, targetIndex) => ({
        ...target, id:`00000000-0000-4000-9000-${String(index * 2 + targetIndex + 1).padStart(12,'0')}`, connectionId:null, status:published ? 'published' : 'scheduled', errorCode:null, permalink:null, publishedAt:published ? at : null,
      }))};
  });
}
