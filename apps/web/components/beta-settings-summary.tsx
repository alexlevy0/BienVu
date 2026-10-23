import type { VideoAspectRatio, VideoDuration } from '@bienvu/contracts';
import { HomeIcon } from './home-icons';

/** A readout of the same state used by the creation controls and request. */
export function BetaSettingsSummary({
  aspectRatio,
  durationSeconds,
  voiceEnabled,
  subtitlesEnabled,
  animations,
  avatar,
}: {
  aspectRatio: VideoAspectRatio;
  durationSeconds: VideoDuration;
  voiceEnabled: boolean;
  subtitlesEnabled: boolean;
  animations: number;
  avatar: boolean;
}) {
  const items = [
    {
      id: 'format',
      icon: aspectRatio === '16:9' ? 'landscape' : 'phone',
      text: aspectRatio === '16:9' ? 'Horizontal 16:9' : 'Vertical 9:16',
    },
    { id: 'duration', icon: 'clock', text: `${durationSeconds} s` },
    { id: 'voice', icon: 'microphone', text: voiceEnabled ? 'Voix off' : 'Sans voix off', muted: !voiceEnabled },
    {
      id: 'subtitles',
      icon: 'subtitles',
      text: voiceEnabled && subtitlesEnabled ? 'Sous-titres' : 'Sans sous-titres',
      muted: !voiceEnabled || !subtitlesEnabled,
    },
    ...(animations
      ? [
          {
            id: 'animations',
            icon: 'sparkle' as const,
            text: `${animations} photo${animations > 1 ? 's' : ''} animée${animations > 1 ? 's' : ''}`,
          },
        ]
      : []),
    ...(avatar ? [{ id: 'avatar', icon: 'user' as const, text: 'Avatar IA' }] : []),
  ] as const;
  return (
    <span className="beta-settings-overview">
      <span className="beta-settings-label">Votre vidéo</span>
      <span id="home-settings-summary" className="beta-settings-summary" aria-live="polite" aria-atomic="true">
        {items.map((item) => (
          <span className="beta-setting-pill" data-muted={'muted' in item && item.muted} key={item.id}>
            <HomeIcon name={item.icon} size={14} />
            <span key={item.text}>{item.text}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
