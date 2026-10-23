'use client';
import { useState, type ImgHTMLAttributes } from 'react';
import { photoPreviewUrl } from '../lib/photo-preview-url';

export function PhotoPreviewImage({
  src,
  alt,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string }) {
  const [failed, setFailed] = useState<string | null>(null),
    preview = photoPreviewUrl(src);
  const current = failed === src ? src : preview;
  return (
    <img
      {...props}
      alt={alt}
      src={current}
      decoding="async"
      onError={(event) => {
        if (event.currentTarget.getAttribute('src') !== current) return;
        if (current !== src) setFailed(src);
        else onError?.(event);
      }}
    />
  );
}
