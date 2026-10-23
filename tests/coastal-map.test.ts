import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillCoastalNoData } from '../packages/maps/src/coastal-raster';

const width = 192,
  height = 256;
function raster(color = [30, 65, 100, 255]) {
  return new Uint8ClampedArray(Array.from({ length: width * height }, () => color).flat());
}
function rectangle(
  data: Uint8ClampedArray,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color = [255, 255, 255, 255],
) {
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) data.set(color, (y * width + x) * 4);
}
const pixel = (data: Uint8ClampedArray, x: number, y: number) => [
  ...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
];

test('côte : comble les zones vides en escalier avec les couleurs de la mer, sans toucher aux terres ni aux toits blancs', () => {
  const data = raster();
  rectangle(data, 0, 0, 55, height, [65, 88, 48, 255]);
  rectangle(data, 140, 0, width, 100);
  rectangle(data, 165, 100, width, height);
  rectangle(data, 18, 30, 35, 48);
  rectangle(data, 100, 180, 120, 200);
  const land = pixel(data, 20, 150),
    roof = pixel(data, 25, 40),
    boat = pixel(data, 110, 190),
    sea = pixel(data, 120, 140);
  assert.equal(fillCoastalNoData(data, width, height), 52 * 100 + 27 * 156);
  assert.deepEqual(pixel(data, 185, 30), sea);
  assert.deepEqual(pixel(data, 180, 220), sea);
  assert.deepEqual(pixel(data, 20, 150), land);
  assert.deepEqual(pixel(data, 25, 40), roof);
  assert.deepEqual(pixel(data, 110, 190), boat);
});
test('zones blanches : conserve la neige, un fond entièrement vide, les bâtiments de bord et les petites taches', () => {
  const snow = raster([130, 135, 140, 255]);
  rectangle(snow, 0, 0, 120, 120);
  const saved = snow.slice();
  assert.equal(fillCoastalNoData(snow, width, height), 0);
  assert.deepEqual(snow, saved);
  const empty = raster([255, 255, 255, 255]);
  assert.equal(fillCoastalNoData(empty, width, height), 0);
  const small = raster();
  rectangle(small, 0, 20, 8, 28);
  const before = small.slice();
  assert.equal(fillCoastalNoData(small, width, height), 0);
  assert.deepEqual(small, before);
});
test('JPEG : retire le fin halo clair au bord des tuiles sans étendre la correction dans la photo', () => {
  const data = raster();
  rectangle(data, 140, 0, width, height);
  rectangle(data, 138, 0, 140, height, [204, 209, 214, 255]);
  assert.ok(fillCoastalNoData(data, width, height) > 0);
  assert.deepEqual(pixel(data, 138, 50), [30, 65, 100, 255]);
  assert.deepEqual(pixel(data, 136, 50), [30, 65, 100, 255]);
});
test('couleurs de mer : prolongement progressif et résultat déterministe, sans aléatoire ni nouvelle source', () => {
  const data = raster();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data.set([25, 50 + Math.round(y / 8), 90 + Math.round(y / 5), 255], (y * width + x) * 4);
  rectangle(data, 130, 0, width, height);
  const again = data.slice();
  assert.ok(fillCoastalNoData(data, width, height) > 0);
  fillCoastalNoData(again, width, height);
  assert.deepEqual(again, data);
  assert.ok(pixel(data, 170, 220)[2] > pixel(data, 170, 30)[2]);
  for (let y = 1; y < height; y++) assert.ok(Math.abs(pixel(data, 170, y)[2] - pixel(data, 170, y - 1)[2]) <= 2);
});
test('pas de débordement entre lignes et contrôle des dimensions avant allocation', () => {
  const data = raster();
  rectangle(data, 0, 0, 25, height);
  assert.ok(fillCoastalNoData(data, width, height) > 0);
  assert.deepEqual(pixel(data, width - 1, 20), [30, 65, 100, 255]);
  for (const [w, h] of [
    [0, 1],
    [-1, 1],
    [1.5, 2],
    [3840, 3840],
    [1, 1],
  ])
    assert.throws(() => fillCoastalNoData(new Uint8ClampedArray(0), w, h), /MAP_RASTER_DIMENSIONS/);
});
