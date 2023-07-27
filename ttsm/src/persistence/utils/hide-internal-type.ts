export function hideInternalType(promise: Promise<unknown>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  return promise.then(() => {});
}