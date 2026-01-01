export const isUuid = (s: any) =>
  typeof s === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const byteToHex: string[] = [];
for (let i = 0; i < 256; ++i) byteToHex.push((i + 0x100).toString(16).slice(1));

const bytesToUuid = (buf: Uint8Array) => {
  return (
    byteToHex[buf[0]] +
    byteToHex[buf[1]] +
    byteToHex[buf[2]] +
    byteToHex[buf[3]] +
    '-' +
    byteToHex[buf[4]] +
    byteToHex[buf[5]] +
    '-' +
    byteToHex[buf[6]] +
    byteToHex[buf[7]] +
    '-' +
    byteToHex[buf[8]] +
    byteToHex[buf[9]] +
    '-' +
    byteToHex[buf[10]] +
    byteToHex[buf[11]] +
    byteToHex[buf[12]] +
    byteToHex[buf[13]] +
    byteToHex[buf[14]] +
    byteToHex[buf[15]]
  );
};

export const uuidv4 = (): string => {
  const rnds = new Uint8Array(16);

  const g: any = globalThis as any;
  if (g?.crypto?.getRandomValues) {
    g.crypto.getRandomValues(rnds);
  } else {
    try {
      // Node/Jest fallback

      const { randomFillSync } = require('crypto');
      randomFillSync(rnds);
    } catch (_e) {
      // Very last resort (should not happen in RN/Node)
      for (let i = 0; i < rnds.length; i++) rnds[i] = Math.floor(Math.random() * 256);
    }
  }

  // Per RFC4122 v4
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  return bytesToUuid(rnds);
};
