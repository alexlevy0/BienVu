'use client';
import type { PhotoAnimationSelection } from '../lib/photo-animation-choice';
import { HomeIcon } from './home-icons';

export function PhotoAnimationToggle({
  enabled,
  selection,
  disabled,
  requiresLogin,
  onChange,
}: {
  enabled: boolean;
  selection: PhotoAnimationSelection;
  disabled: boolean;
  requiresLogin: boolean;
  onChange(enabled: boolean): void;
}) {
  const partial = selection.selected > 0 && selection.selected < selection.total;
  const hint = requiresLogin
    ? 'Connexion requise'
    : `${partial ? `${selection.selected}/${selection.total} photos · ` : ''}+1 crédit par photo`;
  return (
    <button
      type="button"
      className="home-animation-pill home-setting-toggle"
      aria-label="Animations IA"
      aria-pressed={partial ? 'mixed' : enabled}
      title={
        requiresLogin
          ? 'Connectez-vous pour animer vos photos avec l’IA'
          : partial
            ? 'Activer les animations IA sur toutes les photos sélectionnées'
            : enabled
              ? 'Utiliser les mouvements classiques'
              : 'Animer toutes les photos sélectionnées avec l’IA'
      }
      disabled={disabled || requiresLogin}
      onClick={() => onChange(partial || !enabled)}
    >
      <span className="home-option-label">
        Animations IA
        <small>
          {requiresLogin && <HomeIcon name="lock" size={10} />}
          <span>{hint}</span>
        </small>
      </span>
      <span className="home-toggle-track" aria-hidden="true" />
    </button>
  );
}
