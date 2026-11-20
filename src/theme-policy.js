/**
 * Dvolada visual policy: official orange is identical on every device.
 * Per-device custom accent is allowed only in Vite's local internal preview.
 */
export const DVOLADA_ORANGE = '#f26732';
export const DVOLADA_DARK_CHROME = '#111b2a';

export function isDarkTheme(theme, {prefersDark = false, hour = 12} = {}) {
  if (theme === 'dark') return true;
  if (theme === 'system') return Boolean(prefersDark);
  if (theme === 'hour') return hour >= 18 || hour < 6;
  return false;
}

export function applyDvoladaTheme({
  root, themeColorMeta, theme = 'light', previewAccent,
  internalPreview = false, prefersDark = false, hour = 12
}) {
  const dark = isDarkTheme(theme, {prefersDark, hour});
  const accent = internalPreview && /^#[0-9a-f]{6}$/i.test(previewAccent || '')
    ? previewAccent : DVOLADA_ORANGE;
  root.style.setProperty('--accent', accent);
  root.dataset.theme = dark ? 'dark' : 'light';
  // Native form controls, scrollbars and browser UI follow the selected mode,
  // not a manufacturer's default or the OS's automatic dark setting.
  root.style.colorScheme = dark ? 'dark' : 'light';
  themeColorMeta?.setAttribute('content', dark ? DVOLADA_DARK_CHROME : DVOLADA_ORANGE);
  return dark ? 'dark' : 'light';
}
