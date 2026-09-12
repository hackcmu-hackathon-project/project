/**
 * Picking an image, in the shape the upload endpoint wants.
 *
 * Returns null when the person cancels or refuses the permission — a cancelled
 * picker is not an error worth surfacing.
 */
import * as ImagePicker from 'expo-image-picker';

export type PickedPhoto = { uri: string; name: string; type: string };

export async function pickPhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const type = asset.mimeType ?? 'image/jpeg';
  const name = asset.fileName ?? `photo.${type.split('/')[1] ?? 'jpg'}`;
  return { uri: asset.uri, name, type };
}

/** Multi-select without cropping; keep the browser picker in the click gesture. */
export async function pickPhotos(limit = 10): Promise<PickedPhoto[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true,
    selectionLimit: limit, quality: 0.85,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map(asset => ({
    uri: asset.uri, name: asset.fileName ?? 'memory.jpg', type: asset.mimeType ?? 'image/jpeg',
  }));
}
