import type {SocialPublication} from '@bienvu/contracts';

export type CalendarPublication = SocialPublication & {thumbnail?: string};
export function socialCalendarPreview(month: Date, now = new Date()): CalendarPublication[] {
  const examples = [
    {day:3, title:'Un appartement lumineux à Paris', visual:'paris', caption:'Un nouveau regard sur ce bel appartement. Découvrez ses espaces et sa lumière en vidéo.'},
    {day:12, title:'Une maison au bord de la piscine', visual:'sud', caption:'Un jardin, une piscine et de beaux espaces de vie. Votre prochain coup de cœur se découvre en vidéo.'},
    {day:23, title:'Un loft de caractère à Lyon', visual:'lyon', caption:'Volumes, matières et caractère : une visite en vidéo pour imaginer votre prochain lieu de vie.'},
  ];
  return examples.map<CalendarPublication>((example, index) => {
    const at = new Date(month.getFullYear(), month.getMonth(), example.day, 18, 30).toISOString();
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12,'0')}`;
    const published = new Date(at).getTime() <= now.getTime();
    return {id, jobId:id, title:example.title, caption:example.caption, scheduledAt:at,
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris', createdAt:at, expiresAt:at,
      aspectRatio:'9:16', durationSeconds:28, videoUrl:`/videos/studio-home/${example.visual}.mp4`, thumbnail:`/images/studio-home/${example.visual}.webp`,
      targets:([{platform:'instagram', name:'Votre agence · Instagram'}, {platform:'facebook', name:'Votre agence · Facebook'}] as const).map((target, targetIndex) => ({
        ...target, id:`00000000-0000-4000-9000-${String(index * 2 + targetIndex + 1).padStart(12,'0')}`, connectionId:null, status:published ? 'published' : 'scheduled', errorCode:null, permalink:null, publishedAt:published ? at : null,
      }))};
  });
}
