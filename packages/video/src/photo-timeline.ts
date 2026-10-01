import type {VideoManifest} from '@bienvu/contracts';

export function photoAtFrame(timeline: NonNullable<VideoManifest['photoTimeline']>, frame: number) {
  let start = 0;
  for (const [index, photo] of timeline.entries()) {
    if (frame < start + photo.durationFrames) return {photo, index, start, frame: Math.max(0, frame - start)};
    start += photo.durationFrames;
  }
  throw new Error('VIDEO_PHOTO_FRAME_OUT_OF_RANGE');
}
