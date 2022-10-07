import crypto from 'crypto';

/**
 * Creates an SHA-256 hash from the given data.
 * @param data Data to hash.
 * @see {@link https://en.wikipedia.org/wiki/SHA-2 SHA-2}
 */
export const sha256 = (data: string | crypto.BinaryLike) => crypto
  .createHash('sha256')
  .update(data)
  .digest('hex');

/**
 * Creates an SHA-256 hash from the given data and prepends the prefix "0x" to allow an EVM to properly
 * work with this value.
 * @param data Data to hash.
 * @see {@link https://en.wikipedia.org/wiki/SHA-2 SHA-2}
 */
export const ethereumSha256 = (data: string | crypto.BinaryLike) => '0x' + sha256(data);
