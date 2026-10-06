export const blogPublishedAt = '2026-10-05T20:04:00Z';
export const blogSecondBatchPublishedAt = '2026-10-05T20:25:02Z';
export const blogCategories = [
  {id: 'strategie', label: 'Stratégie'},
  {id: 'video', label: 'Création vidéo'},
  {id: 'reseaux', label: 'Réseaux sociaux'},
  {id: 'redaction', label: 'Rédaction'},
  {id: 'budget', label: 'Budget'},
] as const;
export type BlogCategory = typeof blogCategories[number]['id'];
export type BlogLink = {path: string; label: string};
export type BlogSection = {
  id: string; title: string; paragraphs: string[];
  list?: {ordered?: boolean; items: string[]};
  table?: {caption: string; columns: string[]; rows: string[][]};
  examples?: {title: string; text: string; note?: string}[];
  sources?: {url: string; label: string}[];
};
export type BlogArticle = {
  publishedAt?: string; modifiedAt?: string;
  slug: string; title: string; heading: string; description: string; excerpt: string;
  category: BlogCategory; keyword: string; image: 'paris' | 'lyon' | 'sud' | 'bordeaux'; imageAlt: string;
  intro: string[]; takeaways: string[]; sections: BlogSection[];
  faqs: {question: string; answer: string}[]; related: string[]; links: BlogLink[];
};
