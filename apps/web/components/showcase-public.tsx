import { ViewTransition } from 'react';
import { RouteMotion } from './route-motion';
import { motionName } from '../lib/view-motion-name';
import Link from 'next/link';
import { propertyPrice, type ShowcasePublic, type ShowcasePublicProperty } from '@bienvu/contracts';
import { HomeWordmark, HomeIcon } from './home-icons';
import { CookiePreferencesButton } from './product-analytics';
import {
  ShowcaseContactForm,
  ShowcaseContactPanel,
  ShowcasePlayer,
  ShowcaseShare,
  ShowcaseTracking,
} from './showcase-public-client';
import { ShowcaseGalleryCard } from './showcase-gallery-card';
import { showcaseInitials } from '../lib/showcase-client';

const statusLabels = { available: 'Disponible', under_offer: 'Sous compromis', sold: 'Vendu', rented: 'Loué' };
export function ShowcasePropertyCard({ property, slug }: { property: ShowcasePublicProperty; slug: string }) {
  const {
    id,
    url,
    status,
    featured,
    cover,
    video,
    fields: { title, locality, transaction, area, rooms },
  } = property;
  return (
    <ShowcaseGalleryCard
      property={{
        id,
        url,
        status,
        featured,
        cover,
        video,
        fields: { title: title || 'Ce bien', locality, transaction, area, rooms },
        price: propertyPrice(property.fields),
      }}
      slug={slug}
    />
  );
}
function ContactLinks({ data }: { data: ShowcasePublic }) {
  return (
    <div className="showcase-contact-links">
      {data.config.phone && (
        <a data-showcase-contact href={`tel:${data.config.phone.replace(/[^+\d]/g, '')}`}>
          <HomeIcon name="call" size={18} />
          Appeler l’agence
        </a>
      )}
      {data.config.email && (
        <a data-showcase-contact href={`mailto:${data.config.email}`}>
          <HomeIcon name="mail" size={18} />
          {data.config.email}
        </a>
      )}
      {data.config.website && (
        <a data-showcase-contact href={data.config.website} target="_blank" rel="noopener noreferrer">
          Site de l’agence <HomeIcon name="external" size={16} />
        </a>
      )}
    </div>
  );
}
export function PublicShowcase({
  data,
  property,
  query = {},
  homePath,
}: {
  data: ShowcasePublic;
  property?: ShowcasePublicProperty;
  query?: Record<string, string>;
  homePath?: string;
}) {
  const c = data.config,
    home = homePath ?? (data.preview ? '/ma-vitrine/apercu?frame=1' : `/agences/${c.slug}`);
  const heroCover = data.cover ?? data.featured[0]?.cover ?? data.properties[0]?.cover;
  const isFiltered = Object.entries(query).some(([key, value]) => !['page', 'frame'].includes(key) && Boolean(value));
  const advancedFilters = Object.entries(query).some(
    ([key, value]) => !['page', 'frame', 'transaction'].includes(key) && Boolean(value),
  );
  const gallery =
    !isFiltered && data.page === 1
      ? [...new Map([...data.featured, ...data.properties].map((item) => [item.id, item])).values()]
      : data.properties;
  const location = [
    c.city,
    ...c.sectors.filter((sector) => sector.toLocaleLowerCase('fr-FR') !== c.city.toLocaleLowerCase('fr-FR')),
  ]
    .filter(Boolean)
    .join(' · ');
  function catalogueUrl(values: Record<string, string | null>) {
    const params = new URLSearchParams(query);
    if (data.preview && !homePath) params.set('frame', '1');
    for (const [key, value] of Object.entries(values))
      if (value) params.set(key, value);
      else params.delete(key);
    return `${home.split('?')[0]}${params.size ? '?' + params : ''}#catalogue`;
  }
  return (
    <RouteMotion>
      <div
        className={`showcase-public${data.preview ? ' is-preview' : ''}`}
        style={{ '--showcase-accent': c.accent } as React.CSSProperties}
      >
        <a className="showcase-skip" href="#showcase-content">
          Aller au contenu
        </a>
        <header className="showcase-public-header" style={{ viewTransitionName: 'bv-showcase-header' }}>
          <Link
            href={home}
            prefetch={false}
            transitionTypes={property ? ['bv-back'] : undefined}
            className="showcase-agency-brand"
          >
            {c.name}
          </Link>
          <nav aria-label="Navigation de l’agence">
            <Link href={home + '#catalogue'} prefetch={false} transitionTypes={property ? ['bv-back'] : undefined}>
              Nos biens
            </Link>
            <a href="#a-propos">À propos</a>
          </nav>
          <a data-showcase-contact className="showcase-primary" href="#contact">
            Contacter l’agence
          </a>
        </header>
        <main id="showcase-content" tabIndex={-1}>
          {property ? (
            <>
              <nav className="showcase-breadcrumb" aria-label="Fil d’Ariane">
                <Link href={home} prefetch={false} transitionTypes={property ? ['bv-back'] : undefined}>
                  Les biens de l’agence
                </Link>
                <span aria-hidden="true">/</span>
                <span>{property.fields.title}</span>
              </nav>
              <section className="showcase-property-detail">
                <div className="showcase-property-media">
                  <ViewTransition
                    name={motionName('showcase-photo', `${c.slug}:${property.id}`)}
                    default="none"
                    share="bv-media"
                  >
                    {property.video ? (
                      <ShowcasePlayer
                        src={property.video.url}
                        poster={property.cover?.url}
                        title={property.fields.title ?? 'ce bien'}
                        aspectRatio={property.video.aspectRatio}
                      />
                    ) : (
                      property.cover && (
                        <img
                          className="showcase-detail-photo"
                          src={property.cover.url}
                          alt={property.fields.title ?? 'Photo du bien'}
                          width={property.cover.width}
                          height={property.cover.height}
                        />
                      )
                    )}
                  </ViewTransition>
                  <div className="showcase-photo-gallery">
                    {property.photos
                      .filter((photo) => photo.id !== property.cover?.id)
                      .map((photo, index) => (
                        <a
                          key={photo.id}
                          href={photo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Ouvrir la photo ${index + 2}`}
                        >
                          <img
                            src={photo.url}
                            alt={`Vue ${index + 2} du bien`}
                            width={photo.width}
                            height={photo.height}
                            loading="lazy"
                            decoding="async"
                          />
                        </a>
                      ))}
                  </div>
                </div>
                <div className="showcase-property-information">
                  <span className="showcase-eyebrow">
                    {property.fields.transaction === 'rent' ? 'LOCATION' : 'VENTE'} · {statusLabels[property.status]}
                  </span>
                  <h1>{property.fields.title}</h1>
                  <p className="showcase-detail-locality">
                    <HomeIcon name="location" size={19} />
                    {property.fields.locality}
                  </p>
                  <strong className="showcase-detail-price">
                    {propertyPrice(property.fields) || 'Prix sur demande'}
                  </strong>
                  <div className="showcase-property-facts">
                    {property.fields.area && (
                      <span>
                        <HomeIcon name="fullscreen" size={20} />
                        {property.fields.area.toLocaleString('fr-FR')} m²
                      </span>
                    )}
                    {property.fields.rooms && (
                      <span>
                        <HomeIcon name="house" size={20} />
                        {property.fields.rooms} pièce{property.fields.rooms > 1 ? 's' : ''}
                      </span>
                    )}
                    <span>Réf. {property.reference}</span>
                  </div>
                  <p className="showcase-property-description">
                    {property.fields.description ||
                      'Contactez l’agence pour recevoir la présentation détaillée de ce bien.'}
                  </p>
                  {property.address && (
                    <p>
                      <strong>Adresse communiquée par l’agence</strong>
                      <br />
                      {property.address}
                    </p>
                  )}
                  <div className="showcase-energy">
                    <span>
                      DPE{' '}
                      <strong>
                        {property.dpe === 'not_applicable' ? 'Non applicable' : (property.dpe ?? 'Non renseigné')}
                      </strong>
                    </span>
                    <span>
                      GES{' '}
                      <strong>
                        {property.ges === 'not_applicable' ? 'Non applicable' : (property.ges ?? 'Non renseigné')}
                      </strong>
                    </span>
                  </div>
                  {property.legal ? (
                    <p className="showcase-legal">{property.legal}</p>
                  ) : (
                    <p className="showcase-caption">
                      Les mentions détaillées d’honoraires, de copropriété ou de location ne sont pas renseignées.
                      L’agence peut vous les communiquer avant une visite.
                    </p>
                  )}
                  <a className="showcase-primary" data-showcase-contact href="#contact">
                    Contacter l’agence <HomeIcon name="arrow" size={18} />
                  </a>
                  <ContactLinks data={data} />
                  <ShowcaseShare share />
                  <p className="showcase-caption">Informations présentées par {c.name}.</p>
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="showcase-panorama" aria-label={`La vitrine de ${c.name}`}>
                {heroCover ? (
                  <img
                    src={heroCover.url}
                    width={heroCover.width}
                    height={heroCover.height}
                    alt={`Couverture de ${c.name}`}
                    fetchPriority="high"
                    decoding="async"
                  />
                ) : (
                  <div className="showcase-cover-fallback">
                    <HomeIcon name="building" size={52} />
                    <span>Votre prochaine adresse commence ici.</span>
                  </div>
                )}
              </section>
              <section className="showcase-agency-identity" aria-labelledby="showcase-agency-title">
                <div className="showcase-agency-seal">
                  {data.logo ? (
                    <img
                      src={data.logo.url}
                      alt={`Logo de ${c.name}`}
                      width={data.logo.width}
                      height={data.logo.height}
                    />
                  ) : (
                    <span aria-hidden="true">{showcaseInitials(c.name)}</span>
                  )}
                </div>
                <div className="showcase-agency-intro">
                  <h1 id="showcase-agency-title">{c.name}</h1>
                  {location && (
                    <p className="showcase-agency-location">
                      <HomeIcon name="location" size={17} />
                      {location}
                    </p>
                  )}
                  <p className="showcase-agency-tagline">{c.tagline || 'Des biens à vivre, des vidéos à découvrir.'}</p>
                </div>
                <div className="showcase-identity-actions">
                  <a className="showcase-soft-button" href="#contact" data-showcase-contact>
                    Parlons de votre projet <HomeIcon name="arrow" size={18} />
                  </a>
                  {c.phone && (
                    <a
                      className="showcase-phone-button"
                      data-showcase-contact
                      href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                      aria-label={`Appeler ${c.name}`}
                    >
                      <HomeIcon name="call" size={22} />
                    </a>
                  )}
                </div>
              </section>
              <section className="showcase-catalogue" id="catalogue" aria-labelledby="showcase-catalogue-title">
                <div className="showcase-filter-bar">
                  <nav className="showcase-transaction-filters" aria-label="Type de transaction">
                    {[
                      ['', 'Tous les biens'],
                      ['sale', 'À vendre'],
                      ['rent', 'À louer'],
                    ].map(([value, label]) => (
                      <Link
                        key={label}
                        href={catalogueUrl({ transaction: value || null, page: null })}
                        prefetch={false}
                        aria-current={(query.transaction ?? '') === value ? 'page' : undefined}
                      >
                        {label}
                      </Link>
                    ))}
                  </nav>
                  <details className="showcase-filter-panel">
                    <summary>
                      <HomeIcon name="settings" size={18} />
                      <span>Filtres{advancedFilters ? ' actifs' : ''}</span>
                      <HomeIcon name="chevron" size={14} />
                    </summary>
                    <form className="showcase-filters" action={home.split('?')[0]} method="GET">
                      {data.preview && !homePath && <input type="hidden" name="frame" value="1" />}
                      <label>
                        Rechercher
                        <input name="q" defaultValue={query.q ?? ''} placeholder="Un bien, une ville…" maxLength={80} />
                      </label>
                      <label>
                        Transaction
                        <select name="transaction" defaultValue={query.transaction ?? ''}>
                          <option value="">Toutes</option>
                          <option value="sale">Vente</option>
                          <option value="rent">Location</option>
                        </select>
                      </label>
                      <label>
                        Type
                        <select name="type" defaultValue={query.type ?? ''}>
                          <option value="">Tous les biens</option>
                          <option value="apartment">Appartement</option>
                          <option value="house">Maison</option>
                          <option value="other">Autre</option>
                        </select>
                      </label>
                      <label>
                        Localisation
                        <input
                          name="locality"
                          defaultValue={query.locality ?? ''}
                          placeholder="Commune ou quartier"
                          maxLength={200}
                        />
                      </label>
                      <label>
                        Budget maximum (€)
                        <input name="budget" type="number" min={0} max={1000000000} defaultValue={query.budget ?? ''} />
                      </label>
                      <label>
                        Pièces minimum
                        <input name="rooms" type="number" min={0} max={100} defaultValue={query.rooms ?? ''} />
                      </label>
                      <button type="submit" className="showcase-primary">
                        Afficher les biens <HomeIcon name="arrow" size={17} />
                      </button>
                      {isFiltered && (
                        <Link
                          className="showcase-reset"
                          href={home + '#catalogue'}
                          prefetch={false}
                          transitionTypes={property ? ['bv-back'] : undefined}
                        >
                          Réinitialiser les filtres
                        </Link>
                      )}
                    </form>
                  </details>
                </div>
                <header className="showcase-section-heading">
                  <h2 id="showcase-catalogue-title">Trouvez votre prochain chez-vous.</h2>
                  <span>
                    {data.total} bien{data.total > 1 ? 's' : ''}
                  </span>
                </header>
                {gallery.length ? (
                  <div className="showcase-gallery">
                    {gallery.map((item) => (
                      <ShowcasePropertyCard key={item.id} property={item} slug={c.slug} />
                    ))}
                  </div>
                ) : (
                  <div className="showcase-empty">
                    <HomeIcon name="house" size={38} />
                    <h3>Aucun bien ne correspond à votre recherche.</h3>
                    <p>Essayez d’autres critères ou parlez-nous de votre projet.</p>
                    <Link
                      href={home + '#catalogue'}
                      prefetch={false}
                      transitionTypes={property ? ['bv-back'] : undefined}
                    >
                      Voir tous nos biens
                    </Link>
                    <a data-showcase-contact href="#contact">
                      Contacter l’agence <span aria-hidden="true">→</span>
                    </a>
                  </div>
                )}
                {data.pages > 1 && (
                  <nav className="showcase-pagination" aria-label="Pages du catalogue">
                    {data.page > 1 && (
                      <Link prefetch={false} href={catalogueUrl({ page: String(data.page - 1) })}>
                        ← Précédente
                      </Link>
                    )}
                    <span>
                      Page {data.page} sur {data.pages}
                    </span>
                    {data.page < data.pages && (
                      <Link prefetch={false} href={catalogueUrl({ page: String(data.page + 1) })}>
                        Voir plus de biens →
                      </Link>
                    )}
                  </nav>
                )}
              </section>
              <section className="showcase-search-invitation">
                <span className="showcase-search-symbol" aria-hidden="true">
                  <HomeIcon name="house" size={30} />
                </span>
                <div>
                  <h2>Vous n’avez pas encore trouvé ?</h2>
                  <p>Confiez-nous votre recherche.</p>
                </div>
                <a className="showcase-primary" href="#contact" data-showcase-contact>
                  Décrire mon projet <HomeIcon name="arrow" size={18} />
                </a>
              </section>
            </>
          )}
          <section
            className={`showcase-about${heroCover ? ' has-image' : ''}`}
            id="a-propos"
            aria-labelledby="showcase-about-title"
          >
            {heroCover && (
              <div className="showcase-office-image">
                <img
                  src={heroCover.url}
                  alt={`La présentation de ${c.name}`}
                  width={heroCover.width}
                  height={heroCover.height}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            )}
            <div className="showcase-about-copy">
              <h2 id="showcase-about-title">Rencontrons-nous</h2>
              <p>
                {c.description ||
                  'Notre équipe vous accompagne dans votre projet immobilier. Échangeons sur vos envies et trouvons ensemble votre prochaine adresse.'}
              </p>
              {((c.showAddress && c.address) || c.city) && (
                <address>
                  <HomeIcon name="location" size={17} />
                  {c.showAddress && c.address ? c.address : c.city}
                </address>
              )}
              <div className="showcase-agency-socials">
                {c.website && (
                  <a href={c.website} data-showcase-contact target="_blank" rel="noopener noreferrer">
                    Notre site <HomeIcon name="external" size={14} />
                  </a>
                )}
                {Object.entries(c.socials)
                  .filter(([, url]) => url)
                  .map(([name, url]) => (
                    <a key={name} href={url!} target="_blank" rel="noopener noreferrer">
                      {name[0].toUpperCase() + name.slice(1)} <HomeIcon name="external" size={13} />
                    </a>
                  ))}
              </div>
            </div>
            <div className="showcase-about-actions">
              {c.phone && (
                <a className="showcase-primary" data-showcase-contact href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}>
                  <HomeIcon name="call" size={18} />
                  Appeler
                </a>
              )}
              <a className="showcase-outline-button" data-showcase-contact href="#contact">
                <HomeIcon name="mail" size={18} />
                Envoyer un message
              </a>
              {c.email && (
                <a className="showcase-about-email" data-showcase-contact href={`mailto:${c.email}`}>
                  {c.email}
                </a>
              )}
            </div>
          </section>
          <ShowcaseContactPanel>
            <ShowcaseContactForm
              slug={c.slug}
              propertyId={property?.id}
              title={property?.fields.title ?? undefined}
              preview={data.preview}
            />
          </ShowcaseContactPanel>
          {property && data.properties.some((item) => item.id !== property.id) && (
            <section className="showcase-related">
              <h2>D’autres lieux à découvrir.</h2>
              <div className="showcase-gallery">
                {data.properties
                  .filter((item) => item.id !== property.id)
                  .slice(0, 3)
                  .map((item) => (
                    <ShowcasePropertyCard key={item.id} property={item} slug={c.slug} />
                  ))}
              </div>
            </section>
          )}
        </main>
        <footer className="showcase-public-footer">
          <Link
            className="showcase-footer-agency"
            href={home}
            prefetch={false}
            transitionTypes={property ? ['bv-back'] : undefined}
          >
            {c.name}
          </Link>
          <nav aria-label="Navigation du pied de page">
            <Link href={home + '#catalogue'} prefetch={false} transitionTypes={property ? ['bv-back'] : undefined}>
              Nos biens
            </Link>
            <a href="#a-propos">À propos</a>
          </nav>
          <span>
            Créé avec{' '}
            <Link href="/" aria-label="Découvrir BienVu">
              <HomeWordmark />
            </Link>
          </span>
          <div className="showcase-footer-legal">
            <Link href="/confidentialite#vitrines">Confidentialité</Link>
            <Link href="/conditions">Conditions</Link>
            <CookiePreferencesButton />
          </div>
        </footer>
        {property && (
          <div className="showcase-mobile-contact">
            <a data-showcase-contact className="showcase-primary" href="#contact">
              Contacter l’agence <HomeIcon name="arrow" size={18} />
            </a>
            {c.phone && (
              <a data-showcase-contact href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}>
                Appeler
              </a>
            )}
          </div>
        )}
        <ShowcaseTracking
          key={`${c.slug}:${property?.id ?? data.page}`}
          slug={c.slug}
          propertyId={property?.id}
          preview={data.preview}
        />
      </div>
    </RouteMotion>
  );
}
