import * as crypto from 'crypto';

/**
 * Returns a random hex number with the given length.
 * @param length Length of the resulting number.
 * @see {@link https://stackoverflow.com/a/69358886/11454797}
 */
export const randomHexNumber = (length: number): string => crypto.randomBytes(length).toString('hex');

/**
 * Returns a random ethereum address. All Ethereum addresses have a length of 40 hexadecimal characters and begin with "0x".
 * Ethereum smart contract addresses also follow this format, making them visually indistinguishable from wallet addresses.
 * @see {@link https://www.abra.com/blog/crypto-address-formats/}
 * @see {@link https://ethereum.stackexchange.com/a/21186}
 */
export const randomEthereumAddress = (): string => '0x' + randomHexNumber(40);

/**
 * Generates and returns a random UUIDv4.
 * @see {@link https://www.uuidgenerator.net/}
 */
export const randomUUIDv4 = (): string => crypto.randomUUID();
