'use client';
import { useEffect, useState } from 'react';
let pending: Promise<void> | null = null;
// The main preview and style thumbnails share one font load per document.
export function useVideoFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    pending ??= Promise.all(
      [
        new FontFace('BienVu Video', "url('/fonts/inter-tight.woff2')", { weight: '100 900' }),
        new FontFace('BienVu Display', "url('/fonts/anton-regular.ttf')", { weight: '400' }),
        new FontFace('BienVu Serif', "url('/fonts/instrument-serif.woff2')", { weight: '400' }),
      ].map((face) => face.load()),
    )
      .then((faces) => {
        faces.forEach((face) => {
          document.fonts.add(face);
        });
      })
      .catch((error) => {
        pending = null;
        throw error;
      });
    void pending
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return ready;
}
