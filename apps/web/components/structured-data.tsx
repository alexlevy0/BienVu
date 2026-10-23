import { schemaJson } from '../lib/seo';
export function StructuredData({ data }: { data: unknown }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: schemaJson escapes HTML delimiters before embedding JSON-LD; no raw user HTML is inserted.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson(data) }} />;
}
