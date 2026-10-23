import { homeHeroDepth } from './home-hero-depth-assets';
import type { HomeMediaView } from './home-media-view';
// An admin can replace the homepage film at any time. Never put this presenter
// over a different narration: the ordinary player remains the default fallback.
export function hasHeroDepth(movie: Pick<HomeMediaView, 'sha256'>) {
  return movie.sha256 === homeHeroDepth.sourceSha256;
}
export function heroAvatarFormat(userAgent: string) {
  return /AppleWebKit/.test(userAgent) && !/(Chrome|Chromium|Edg|OPR|Firefox)\//.test(userAgent)
    ? 'avatarHevc'
    : 'avatarWebm';
}
export const heroDepthUrl = (id: string) => '/api/homepage/hero-depth/' + id;
export const emptyHeroImage = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
