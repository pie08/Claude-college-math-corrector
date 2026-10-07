/**
 * Color tokens for light and dark mode.
 *
 * `error` is the red used for mistake highlights. `unclear` (amber) marks
 * steps the tutor couldn't read. Neither is ever used as the only signal:
 * every mark also carries an icon and a text label.
 */
export type Palette = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  error: string;
  errorSoft: string;
  unclear: string;
  unclearSoft: string;
  success: string;
  /** Backdrop behind images being cropped or reviewed. */
  canvas: string;
  /** Dims the area outside the crop frame. */
  scrim: string;
};

export const lightPalette: Palette = {
  background: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F4',
  text: '#12141A',
  textMuted: '#5A6070',
  border: '#DFE2E8',
  primary: '#3651D4',
  onPrimary: '#FFFFFF',
  error: '#D92D20',
  errorSoft: 'rgba(217, 45, 32, 0.14)',
  unclear: '#B54708',
  unclearSoft: 'rgba(181, 71, 8, 0.12)',
  success: '#067647',
  canvas: '#0B0C0F',
  scrim: 'rgba(0, 0, 0, 0.55)',
};

export const darkPalette: Palette = {
  background: '#0E0F13',
  surface: '#17191F',
  surfaceAlt: '#20232B',
  text: '#F1F2F5',
  textMuted: '#A3A9B6',
  border: '#2B2F38',
  primary: '#6F86F7',
  onPrimary: '#0B0C0F',
  error: '#F97066',
  errorSoft: 'rgba(249, 112, 102, 0.18)',
  unclear: '#FDB022',
  unclearSoft: 'rgba(253, 176, 34, 0.16)',
  success: '#47CD89',
  canvas: '#000000',
  scrim: 'rgba(0, 0, 0, 0.6)',
};
