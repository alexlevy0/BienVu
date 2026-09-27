'use client';
import {useState, type FormEvent} from 'react';
import {ListingUrl} from '@bienvu/contracts';
import {Icon} from './icon';
export function GenerationForm() {
  const [url, setUrl] = useState('');
  const [feedback, setFeedback] = useState<{valid: boolean; message: string} | null>(null);
  function validate(event: FormEvent) {
    event.preventDefault();
    const result = ListingUrl.safeParse(url);
    setFeedback(result.success ? {valid: true, message: 'Le format du lien est valide. L’annonce n’a pas été consultée : la création de vidéo n’est pas encore disponible.'}
      : {valid: false, message: result.error.issues[0]?.code === 'custom' ? result.error.issues[0].message : 'Saisissez un lien d’annonce HTTPS valide.'});
  }
  return <form className="generation-form" onSubmit={validate} noValidate><label htmlFor="listing-url">Le lien de votre annonce</label><div className={`url-field ${feedback && !feedback.valid ? 'invalid' : ''}`}><Icon name="link"/><input id="listing-url" name="url" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://votre-agence.fr/annonce/…" value={url} onChange={event => {setUrl(event.target.value); setFeedback(null);}} aria-invalid={feedback?.valid === false} aria-describedby="url-help url-feedback"/><button className="validate-link" type="submit">Vérifier le lien <Icon name="arrow" size={16}/></button></div><p id="url-help" className="field-help">Une annonce publiée sur le site de votre agence, que vous êtes autorisé à utiliser.</p><p id="url-feedback" role="status" aria-live="polite" className={`form-feedback ${feedback?.valid ? 'valid' : 'error'}`}>{feedback?.message}</p><div className="generation-action"><button className="button primary" type="button" disabled aria-describedby="generation-disabled"><Icon name="spark" size={18}/>Générer ma vidéo<Icon name="arrow" size={18}/></button><span id="generation-disabled">En cours de développement.<br/> Aucune vidéo ne sera créée.</span></div></form>;
}
