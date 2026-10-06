import * as ImagePicker from 'expo-image-picker';
import { Platform, TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * The three ways to get a page into the app:
 *  1. Native document scanner (VisionKit on iOS, ML Kit on Android): finds
 *     page edges, corrects perspective and cleans up contrast for us.
 *  2. Plain system camera: fallback when the scanner isn't available.
 *  3. Photo library: for pages photographed earlier.
 */
export type CaptureOutcome =
  | { kind: 'captured'; uri: string }
  | { kind: 'cancelled' }
  | { kind: 'permission-denied'; permission: 'camera' }
  | { kind: 'unavailable'; message: string };

type Scanner = typeof import('react-native-document-scanner-plugin').default;

let scannerPromise: Promise<Scanner | null> | null = null;

/**
 * Loads the scanner lazily. The package looks up its native module as soon
 * as it's evaluated and throws if the binary doesn't include it (Expo Go,
 * web). Metro reports that as a fatal error even inside a dynamic import, so
 * check that the native module is registered before touching the package.
 */
function loadScanner(): Promise<Scanner | null> {
  if (Platform.OS === 'web' || TurboModuleRegistry.get<TurboModule>('DocumentScanner') == null) {
    return Promise.resolve(null);
  }
  scannerPromise ??= import('react-native-document-scanner-plugin')
    .then((module) => module.default)
    .catch((error: unknown) => {
      if (__DEV__) console.warn('Document scanner unavailable, using the camera instead.', error);
      return null;
    });
  return scannerPromise;
}

/** Scans one page with the native document scanner, falling back to the camera. */
export async function scanPage(): Promise<CaptureOutcome> {
  const scanner = await loadScanner();
  if (!scanner) return takePhoto();

  // On Android, expo-image-picker declares the CAMERA permission in the
  // manifest, and once it's declared the scanner's camera needs it granted.
  if (Platform.OS === 'android') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: 'permission-denied', permission: 'camera' };
  }

  try {
    const result = await scanner.scanDocument({ croppedImageQuality: 100, maxNumDocuments: 1 });
    const uri = result.scannedImages?.[0];
    if (result.status === 'cancel' || !uri) return { kind: 'cancelled' };
    return { kind: 'captured', uri: toFileUri(uri) };
  } catch (error) {
    // e.g. iOS Simulator (no camera) or an Android device without the
    // Google Play services scanner. The plain camera may still work.
    if (__DEV__) console.warn('Document scan failed, falling back to the camera.', error);
    return takePhoto();
  }
}

/** Takes a photo with the system camera, without edge detection. */
export async function takePhoto(): Promise<CaptureOutcome> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { kind: 'permission-denied', permission: 'camera' };

  try {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 1 });
    if (result.canceled || !result.assets[0]) return { kind: 'cancelled' };
    return { kind: 'captured', uri: result.assets[0].uri };
  } catch {
    return { kind: 'unavailable', message: "This device's camera isn't available. Try choosing a photo instead." };
  }
}

/** Picks an existing photo. The system picker needs no library permission. */
export async function pickFromLibrary(): Promise<CaptureOutcome> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1, selectionLimit: 1 });
    if (result.canceled || !result.assets[0]) return { kind: 'cancelled' };
    return { kind: 'captured', uri: result.assets[0].uri };
  } catch {
    return { kind: 'unavailable', message: "Couldn't open your photo library. Please try again." };
  }
}

/** The scanner returns bare file paths on some platforms; image APIs want `file://` URIs. */
export function toFileUri(path: string): string {
  return path.startsWith('/') ? `file://${path}` : path;
}
