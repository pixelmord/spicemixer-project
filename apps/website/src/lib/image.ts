export interface ImagePart {
  type: "image";
  image: Uint8Array;
  mediaType: string;
}

export function toImagePart(bytes: Uint8Array, mediaType: string): ImagePart {
  return { type: "image", image: bytes, mediaType };
}
