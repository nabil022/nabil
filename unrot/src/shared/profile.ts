// Avatars: an emoji on a coloured disc. Colours are mid-tone so they sit on
// both the light and the dark theme.

export const AVATARS: readonly string[] = [
  '🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐨', '🐵', '🦖', '🐧', '🐝',
  '🐢', '🦋', '🐳', '🦁', '🐰', '🦜', '🐺', '🐹',
];

export const AVATAR_COLORS: readonly string[] = [
  '#F2668B', '#F28C38', '#E3B505', '#3FB47A', '#25A4B4', '#4F7CF0', '#8C62E8', '#C25BC4',
];

export const GROUP_EMOJIS: readonly string[] = [
  '🧠', '🔥', '🌱', '🏆', '⚡', '🌙', '📵', '🎯', '🦾', '🐢', '🚀', '🍀',
];

export function avatarColor(i: number): string {
  return AVATAR_COLORS[((i % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length]!;
}
