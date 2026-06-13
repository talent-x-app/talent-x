import {
  confirmAvatar,
  createAvatarUpload,
  type AvatarUploadRequestContentType,
  type User,
} from '@talent-x/api-client';

/** Image choisie par l'utilisateur (uri locale + type MIME). */
export type PickedImage = { uri: string; mimeType: string };

/**
 * Téléverse un avatar (TLX-124) en 3 temps, comme le backend l'attend :
 *  1. demande une URL d'upload présignée (`POST /users/me/avatar`) ;
 *  2. **PUT direct** des octets de l'image vers le stockage (jamais via l'API) ;
 *  3. confirme la clé objet (`PUT /users/me/avatar`) → profil mis à jour (photoUrl présigné).
 *
 * `fetchImpl` est injectable pour la testabilité (lecture du fichier local + PUT S3).
 * Lance la réponse fautive en cas d'échec (gérée par l'appelant via toast).
 */
export async function uploadAvatar(
  picked: PickedImage,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<User> {
  const fetchFn = deps.fetchImpl ?? fetch;

  const target = await createAvatarUpload({
    contentType: picked.mimeType as AvatarUploadRequestContentType,
  });
  if (target.status !== 201) throw target;

  // Récupère les octets de l'image locale, puis les téléverse à l'URL présignée.
  const bytes = await (await fetchFn(picked.uri)).blob();
  const put = await fetchFn(target.data.uploadUrl, {
    method: 'PUT',
    body: bytes,
    headers: { 'Content-Type': picked.mimeType },
  });
  if (!put.ok) throw put;

  const confirmed = await confirmAvatar({ objectKey: target.data.objectKey });
  if (confirmed.status !== 200) throw confirmed;
  return confirmed.data;
}
