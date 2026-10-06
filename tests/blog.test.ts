import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blogArticles, blogArticleDates, blogArticlePath, blogArticleSchema, blogDateLabel, blogImagePath, blogUpdatedAt, blogWordCount, blogReadingMinutes, findBlogArticle} from '../apps/web/lib/blog-content';
import {blogTopics} from '../apps/web/lib/blog-navigation';
import {blogCategories, blogPublishedAt, blogSecondBatchPublishedAt} from '../apps/web/lib/blog/types';
import {publicSeoPaths, seoPage} from '../apps/web/lib/seo-paths';
import {seoMetadata, schemaJson} from '../apps/web/lib/seo';

test('Blog : vingt articles complets, liens valides, sommaires et références cohérentes', () => {
  assert.equal(blogArticles.length, 20);
  assert.deepEqual(blogTopics.map(article => article.slug), blogArticles.map(article => article.slug));
  const titles = new Set(), keywords = new Set();
  const linkable = new Set([...publicSeoPaths, '/publications', '/conditions', '/agence', '/projets', '/biens']);
  for (const article of blogArticles) {
    assert.match(article.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!titles.has(article.heading), 'Chaque intention a son titre'); titles.add(article.heading);
    assert.ok(!keywords.has(article.keyword), 'Les sujets restent distincts'); keywords.add(article.keyword);
    assert.ok(blogWordCount(article) >= 650, article.slug + ' texte intégral');
    assert.ok(blogCategories.some(category => category.id === article.category));
    const ids = new Set<string>();
    for (const section of article.sections) {
      assert.match(section.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(!ids.has(section.id), article.slug + ' ancre unique'); ids.add(section.id);
      if (section.table) for (const row of section.table.rows) assert.equal(row.length, section.table.columns.length, 'Tableau accessible et complet');
      for (const source of section.sources ?? []) {
        const url = new URL(source.url); assert.equal(url.protocol, 'https:');
        assert.ok(['creativecommons.org', 'www.facebook.com', 'www.economie.gouv.fr', 'www.service-public.gouv.fr', 'www.w3.org', 'support.google.com'].includes(url.hostname));
      }
    }
    for (const slug of article.related) {assert.ok(findBlogArticle(slug), slug + ' article lié'); assert.notEqual(slug, article.slug);}
    for (const link of article.links) assert.ok(linkable.has(link.path), link.path + ' destination connue');
  }
  assert.equal(findBlogArticle('article-inexistant'), undefined);
});

test('Blog : pages indexables, métadonnées article, auteur réel et schémas sûrs', () => {
  assert.equal(seoPage('/blog'), '/blog');
  assert.ok(Date.parse(blogPublishedAt) <= Date.now(), 'La date publiée ne doit pas être future');
  for (const article of blogArticles) {
    const path = blogArticlePath(article), metadata = seoMetadata({title: article.title, description: article.description, path, image: blogImagePath(article), type: 'article'});
    assert.equal(seoPage(path), path); assert.equal(metadata.alternates?.canonical, path);
    assert.ok(metadata.openGraph && 'type' in metadata.openGraph);
    assert.equal(metadata.openGraph.type, 'article');
    const schema = JSON.parse(schemaJson(blogArticleSchema(article)));
    assert.equal(schema['@type'], 'BlogPosting'); assert.equal(schema.headline, article.heading);
    assert.equal(schema.mainEntityOfPage['@id'], 'https://bienvu.online' + path);
    assert.equal(schema.author.name, 'BienVu'); assert.equal(schema.datePublished, blogArticleDates(article).publishedAt);
    assert.equal(schema.dateModified, blogArticleDates(article).modifiedAt);
    assert.ok(Date.parse(schema.datePublished) <= Date.now());
    assert.equal(schema.wordCount, blogWordCount(article)); assert.ok(blogReadingMinutes(article) >= 3);
    assert.equal(schema.image.length, 1); assert.ok(schema.image[0].endsWith(blogImagePath(article)));
    assert.equal(schema.aggregateRating, undefined); assert.equal(schema.review, undefined);
  }
  const unsafe = {...blogArticles[0]!, heading: '</script><script>alert(1)</script>'};
  const safe = schemaJson(blogArticleSchema(unsafe)); assert.doesNotMatch(safe, /<\/script>/); assert.equal(JSON.parse(safe).headline, unsafe.heading);
});

test('Blog : les ajouts ne modifient pas les dates de publication des articles existants', () => {
  assert.equal(blogArticles.filter(article => blogArticleDates(article).publishedAt === blogPublishedAt).length, 10);
  assert.equal(blogArticles.filter(article => blogArticleDates(article).publishedAt === blogSecondBatchPublishedAt).length, 10);
  assert.equal(blogUpdatedAt(), blogSecondBatchPublishedAt);
  const updated = {...blogArticles[0]!, modifiedAt: blogSecondBatchPublishedAt};
  assert.deepEqual(blogArticleDates(updated), {publishedAt: blogPublishedAt, modifiedAt: blogSecondBatchPublishedAt});
  assert.equal(blogDateLabel(blogPublishedAt), '5 octobre 2026');
});
