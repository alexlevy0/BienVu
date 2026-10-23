'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ShowcaseContact } from '@bienvu/contracts';
import { storedAnalyticsConsent } from '../lib/product-analytics';
import { TurnstileCheck } from './turnstile-check';
import { HomeIcon } from './home-icons';

export function ShowcaseContactPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === '#contact' && panel.current) panel.current.open = true;
    };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link) return;
      const url = new URL(link.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.hash === '#contact' &&
        panel.current
      )
        panel.current.open = true;
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    document.addEventListener('click', click);
    return () => {
      window.removeEventListener('hashchange', reveal);
      document.removeEventListener('click', click);
    };
  }, []);
  return (
    <details ref={panel} className="showcase-contact-panel">
      <summary>
        <span>
          <HomeIcon name="mail" size={20} />
          Écrivez à notre équipe
        </span>
        <HomeIcon name="plus" size={19} />
      </summary>
      {children}
    </details>
  );
}

export function ShowcaseShare({ href, share = false }: { href?: string; share?: boolean }) {
  const [message, setMessage] = useState('');
  return (
    <span className="showcase-share">
      <button
        type="button"
        onClick={async () => {
          const url = href ? new URL(href, window.location.origin).href : window.location.href;
          try {
            const native = share && typeof navigator.share === 'function';
            if (native) await navigator.share({ url });
            else await navigator.clipboard.writeText(url);
            setMessage(native ? '' : 'Lien copié.');
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
            setMessage('Copiez l’adresse depuis la barre de votre navigateur.');
          }
        }}
      >
        {share ? 'Partager le bien' : 'Copier le lien'}
      </button>
      <small role="status">{message}</small>
    </span>
  );
}
export function ShowcaseTracking({
  slug,
  propertyId = null,
  preview = false,
}: {
  slug: string;
  propertyId?: string | null;
  preview?: boolean;
}) {
  const intent = useRef(crypto.randomUUID()),
    sent = useRef(false);
  useEffect(() => {
    if (preview) return;
    const send = (event: 'agency_view' | 'property_view' | 'contact_click', key: string) => {
      if (!storedAnalyticsConsent()?.analytics) return;
      void fetch(`/api/vitrines/${slug}/events`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, propertyId, intent: key, consent: true }),
      }).catch(() => {});
    };
    const view = () => {
      if (!sent.current && storedAnalyticsConsent()?.analytics) {
        sent.current = true;
        send(propertyId ? 'property_view' : 'agency_view', intent.current);
      }
    };
    const clicks = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-showcase-contact]'))
        send('contact_click', crypto.randomUUID());
    };
    view();
    window.addEventListener('bienvu:consent-changed', view);
    window.addEventListener('storage', view);
    document.addEventListener('click', clicks);
    return () => {
      window.removeEventListener('bienvu:consent-changed', view);
      window.removeEventListener('storage', view);
      document.removeEventListener('click', clicks);
    };
  }, [slug, propertyId, preview]);
  return null;
}
export function ShowcasePlayer({
  src,
  poster,
  title,
  aspectRatio,
}: {
  src: string;
  poster?: string;
  title: string;
  aspectRatio: '9:16' | '16:9';
}) {
  return (
    <video
      className={`showcase-player${aspectRatio === '9:16' ? ' is-vertical' : ''}`}
      data-showcase-player
      src={src}
      poster={poster}
      controls
      playsInline
      preload="none"
      aria-label={`Vidéo de ${title}`}
      onPlay={(e) => {
        for (const video of document.querySelectorAll<HTMLVideoElement>('video[data-showcase-player]'))
          if (video !== e.currentTarget) video.pause();
      }}
    />
  );
}
export function ShowcaseContactForm({
  slug,
  propertyId = null,
  title,
  preview = false,
}: {
  slug: string;
  propertyId?: string | null;
  title?: string;
  preview?: boolean;
}) {
  const [config, setConfig] = useState<{ enabled: boolean; siteKey: string | null } | null>(null),
    [token, setToken] = useState(''),
    [challenge, setChallenge] = useState(false),
    [version, setVersion] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [received, setReceived] = useState(false);
  const root = useRef<HTMLFormElement>(null),
    intent = useRef<{ key: string; hash: string } | null>(null),
    lock = useRef(false);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController(),
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          observer.disconnect();
          void fetch(`/api/vitrines/${slug}/contact`, { cache: 'no-store', signal: controller.signal })
            .then(async (r) => {
              if (!r.ok) throw 0;
              const value = (await r.json()) as { enabled: boolean; siteKey: string | null };
              if (!controller.signal.aborted) setConfig(value);
            })
            .catch(() => {
              if (!controller.signal.aborted)
                setError(
                  'Le formulaire est momentanément indisponible. Utilisez les coordonnées de l’agence ci-dessus.',
                );
            });
        },
        { rootMargin: '200px' },
      );
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [slug, preview]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || preview || received) return;
    const values = new FormData(event.currentTarget),
      data = {
        name: String(values.get('name') ?? ''),
        email: String(values.get('email') ?? ''),
        phone: String(values.get('phone') ?? ''),
        message: String(values.get('message') ?? ''),
        website: String(values.get('website') ?? ''),
        propertyId,
        turnstileToken: token,
      };
    if (!ShowcaseContact.safeParse(data).success) {
      setError('Vérifiez votre nom, votre e-mail et votre message (10 caractères minimum).');
      return;
    }
    if (!config?.enabled) {
      setError('Le formulaire est momentanément indisponible. Vous pouvez contacter l’agence par téléphone ou e-mail.');
      return;
    }
    const hash = JSON.stringify({ ...data, turnstileToken: '' });
    if ((!intent.current || intent.current.hash !== hash) && !token) {
      setChallenge(true);
      setError('Validez la vérification ci-dessous, puis envoyez votre demande.');
      return;
    }
    if (intent.current?.hash !== hash) intent.current = { key: crypto.randomUUID(), hash };
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/vitrines/${slug}/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': intent.current!.key },
          body: JSON.stringify(data),
        }),
        body = (await response.json()) as { received?: boolean; error?: { code?: string; message?: string } };
      if (!response.ok) {
        if (body.error?.code === 'BOT_VERIFICATION_FAILED') {
          setChallenge(true);
          setToken('');
          setVersion((v) => v + 1);
        }
        throw new Error(body.error?.message ?? 'La demande n’a pas été enregistrée. Réessayez.');
      }
      if (body.received !== true) throw new Error('Réponse inattendue. Réessayez avec le même formulaire.');
      setReceived(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'L’envoi a été interrompu. Votre saisie est conservée : réessayez.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      ref={root}
      id="contact"
      className="showcase-contact-form ph-no-capture"
      data-analytics-sensitive
      onSubmit={submit}
    >
      <div>
        <span className="showcase-eyebrow">FAISONS CONNAISSANCE</span>
        <h2>{title ? 'Ce bien vous intéresse ?' : 'Parlons de votre projet.'}</h2>
        <p>
          {title
            ? `Votre demande concerne « ${title} ».`
            : 'Une question ou une recherche à partager ? Écrivez directement à l’agence.'}
        </p>
        <p className="showcase-caption">
          Vos coordonnées servent à traiter cette demande. Elles ne vous inscrivent pas à des communications
          commerciales. <Link href="/confidentialite#vitrines">Utilisation des données</Link>
        </p>
      </div>
      {received ? (
        <div className="showcase-receipt" role="status">
          <h3>Votre demande a bien été enregistrée.</h3>
          <p>L’agence peut maintenant la consulter. Une demande de visite reste à confirmer par l’agence.</p>
        </div>
      ) : (
        <fieldset disabled={busy || preview}>
          <legend className="sr-only">Votre demande</legend>
          <div className="showcase-form-grid">
            <label>
              Votre nom
              <input name="name" autoComplete="name" className="ph-mask" required minLength={2} maxLength={100} />
            </label>
            <label>
              Votre e-mail
              <input name="email" type="email" autoComplete="email" className="ph-mask" required maxLength={254} />
            </label>
          </div>
          <label>
            Téléphone <small>(facultatif)</small>
            <input name="phone" type="tel" autoComplete="tel" className="ph-mask" maxLength={25} />
          </label>
          <label>
            Votre message
            <textarea name="message" className="ph-mask" required minLength={10} maxLength={3000} rows={4} />
          </label>
          <label className="showcase-honeypot" aria-hidden="true">
            Votre site
            <input name="website" tabIndex={-1} autoComplete="off" maxLength={200} />
          </label>
          {challenge && config?.siteKey && (
            <TurnstileCheck
              siteKey={config.siteKey}
              action="showcase_contact"
              version={version}
              onToken={setToken}
              onError={setError}
            />
          )}
          {error && (
            <p role="alert" className="showcase-error">
              {error}
            </p>
          )}
          <button className="showcase-primary" type="submit">
            {busy ? 'Enregistrement…' : preview ? 'Formulaire désactivé dans l’aperçu' : 'Envoyer ma demande'}{' '}
            <span aria-hidden="true">→</span>
          </button>
        </fieldset>
      )}
    </form>
  );
}
export function ShowcasePreviewFrame({ id }: { id?: string }) {
  const [mobile, setMobile] = useState(false);
  return (
    <section className="showcase-preview-page">
      <header>
        <Link href="/ma-vitrine">← Ma vitrine</Link>
        <div role="group" aria-label="Format de prévisualisation">
          <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>
            Ordinateur
          </button>
          <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>
            Mobile
          </button>
        </div>
        <span>Aperçu privé · Version enregistrée du brouillon</span>
      </header>
      <iframe
        title="Prévisualisation privée de ma vitrine"
        className={mobile ? 'is-mobile' : ''}
        src={`/ma-vitrine/apercu?frame=1${id ? '&bien=' + encodeURIComponent(id) : ''}`}
      />
    </section>
  );
}
