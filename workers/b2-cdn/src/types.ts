export type Visibility = 'public' | 'private';

export interface NormalizedRequestPath {
  visibility: Visibility;
  normalizedPath: string;
  bucketKey: string;
}
