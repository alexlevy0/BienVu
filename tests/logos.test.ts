import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeLogo} from '../apps/web/lib/logo';
import {RequestFailure} from '../apps/web/lib/http';

const source = () => sharp({create: {width: 80, height: 40, channels: 4, background: {r: 33, g: 79, b: 67, alpha: 0.5}}});
test('logos synthétiques : vrais PNG/JPEG décodés, réencodés, sans métadonnées', async () => {
  for (const mime of ['image/png', 'image/jpeg']) {
    const bytes = await (mime === 'image/png' ? source().png() : source().jpeg()).withMetadata().toBuffer();
    const output = await normalizeLogo(bytes, mime);
    const metadata = await sharp(output.bytes).metadata();
    assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 80); assert.equal(metadata.height, 40);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined); assert.equal(metadata.xmp, undefined);
    assert.match(output.hash, /^[0-9a-f]{64}$/);
    const raw = await sharp(output.bytes).raw().toBuffer();
    if (mime === 'image/png') assert.ok(raw[3] >= 127 && raw[3] <= 128);
  }
});
test('PNG à palette et entrelacé conservés après normalisation', async () => {
  for (const options of [{palette: true}, {progressive: true}]) {
    const output = await normalizeLogo(await source().png(options).toBuffer(), 'image/png');
    const raw = await sharp(output.bytes).raw().toBuffer();
    assert.ok(raw[3] >= 127 && raw[3] <= 128);
  }
});
test('logos malveillants/corrompus : SVG, HTML déguisé, mauvais MIME, troncature, CRC, bombe de dimensions', async () => {
  const valid = await source().png().toBuffer();
  const corrupt = Buffer.from(valid); corrupt[corrupt.length - 1] ^= 255;
  const huge = Buffer.from(valid); huge.writeUInt32BE(100_000, 16);
  const cases: [Uint8Array, string][] = [
    [Buffer.from('<svg onload="alert(1)"></svg>'), 'image/svg+xml'], [Buffer.from('<html><script>alert(1)</script></html>'), 'image/png'],
    [valid, 'image/jpeg'], [valid.subarray(0, 40), 'image/png'], [corrupt, 'image/png'], [huge, 'image/png'],
    [await sharp({create: {width: 2048, height: 16, channels: 3, background: 'white'}}).jpeg().toBuffer(), 'image/jpeg'],
    [Buffer.concat([valid, Buffer.from('<script>evil</script>')]), 'image/png'],
  ];
  for (const [bytes, mime] of cases) await assert.rejects(normalizeLogo(bytes, mime), e => e instanceof RequestFailure && e.code === 'INVALID_LOGO');
  await assert.rejects(normalizeLogo(new Uint8Array(2 * 1024 * 1024 + 1), 'image/png'), e => e instanceof RequestFailure && e.code === 'FILE_TOO_LARGE');
});
