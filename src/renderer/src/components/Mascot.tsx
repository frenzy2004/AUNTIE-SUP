import React from 'react';

// AUNTIE herself — the SEA auntie who knows the real price and smells a scam.
// idle while watching, happy on a clean TRUST, alert when she smells an AVOID.
// Assets live in src/renderer/public/mascot/ and are served at /mascot/*.mp4.

export type MascotMood = 'idle' | 'happy' | 'alert';

interface Props {
  mood: MascotMood;
  size?: number;
}

export function Mascot({ mood, size = 64 }: Props) {
  return (
    <video
      key={mood}
      src={`/mascot/${mood}.mp4`}
      poster={`/mascot/${mood}.png`}
      autoPlay
      loop
      muted
      playsInline
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }}
      aria-label={`AUNTIE is ${mood}`}
    />
  );
}
