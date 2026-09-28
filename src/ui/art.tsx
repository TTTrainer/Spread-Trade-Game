/**
 * Uploaded art. Every PNG in assets/art/ is bundled at build time and looked up by its file name
 * (`<category>-<id>.png`). Anything not uploaded yet falls back to a code-drawn placeholder tile,
 * so the game always looks complete and new art simply drops in.
 */

import type { CSSProperties } from 'react';
import { ART_SIZES, type ArtCategory } from '../content/art';

const FILES = import.meta.glob('../../assets/art/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const BY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [
    path
      .split('/')
      .pop()!
      .replace(/\.png$/, ''),
    url,
  ]),
);

export function artUrl(category: ArtCategory, id: string): string | null {
  return BY_KEY[`${category}-${id}`] ?? null;
}

export function uploadedArtCount(): number {
  return Object.keys(BY_KEY).length;
}

const TONES: Record<string, string> = {
  C: 'var(--rar-common)',
  U: 'var(--rar-uncommon)',
  R: 'var(--rar-rare)',
  L: 'var(--rar-legendary)',
  memo: 'var(--cyan)',
  voucher: 'var(--amber)',
  analyst: 'var(--violet)',
  tag: 'var(--magenta)',
  page: 'var(--cyan)',
  review: 'var(--magenta)',
  client: 'var(--amber)',
};

function initials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, '')
    .replace(/^(The|Playbook:)\s+/i, '')
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);
  const s = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2);
  return s.toUpperCase();
}

/**
 * An item's picture at a whole-number pixel scale. `tone` picks the placeholder color (a rarity
 * letter or a category), and `name` gives the placeholder its initials.
 */
export function ArtIcon({
  category,
  id,
  name,
  tone,
  scale = 1,
  className = '',
  style,
  onlyIfUploaded = false,
}: {
  /** Show nothing (instead of a placeholder) until the picture is uploaded. */
  onlyIfUploaded?: boolean;
  category: ArtCategory;
  id: string;
  name: string;
  tone?: string;
  scale?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const size = ART_SIZES[category];
  const w = size.w * scale;
  const h = size.h * scale;
  const url = artUrl(category, id);
  if (url)
    return (
      <img
        src={url}
        alt=""
        width={w}
        height={h}
        className={`art-icon ${className}`}
        style={{ imageRendering: 'pixelated', ...style }}
        draggable={false}
        data-art={`${category}-${id}`}
      />
    );
  if (onlyIfUploaded) return null;
  const color = TONES[tone ?? category] ?? 'var(--line-bright)';
  return (
    <span
      className={`art-icon art-placeholder ${className}`}
      style={{
        width: w,
        height: h,
        ['--art-tone' as string]: color,
        fontSize: Math.round(Math.min(w, h) * 0.38),
        ...style,
      }}
      aria-hidden="true"
      data-art-missing={`${category}-${id}`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * An uploaded card back as a background (the code-drawn pattern stays when there is none). The art
 * is a tall strip, so it repeats sideways at full height instead of stretching.
 */
export function cardBackImage(value: string): CSSProperties {
  const url = artUrl('cardback', value);
  return url
    ? {
        backgroundImage: `url(${url})`,
        backgroundSize: 'auto 100%',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'center',
        imageRendering: 'pixelated',
      }
    : {};
}
