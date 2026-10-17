export async function loadPhoto(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}
function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = Math.max(1, Math.round(width));
  result.height = Math.max(1, Math.round(height));
  return result;
}
export async function transformPhoto(source, { rotation = 0, crop } = {}) {
  const image = await loadPhoto(source);
  const region = crop || { x: 0, y: 0, width: image.width, height: image.height };
  const swap = Math.abs(rotation) % 180 === 90;
  const scale = Math.min(1, 2400 / Math.max(region.width, region.height));
  const output = canvas((swap ? region.height : region.width) * scale, (swap ? region.width : region.height) * scale);
  const context = output.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width / 2, output.height / 2);
  context.scale(scale, scale);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(image, region.x, region.y, region.width, region.height, -region.width / 2, -region.height / 2, region.width, region.height);
  // Keep the retained photo within the same 3 MB storage budget as uploads.
  for (const quality of [0.94, 0.85, 0.7, 0.5]) {
    const encoded = output.toDataURL('image/jpeg', quality);
    if (encoded.length < 4 * 1024 * 1024) return encoded;
  }
  throw Error('處理後的照片過大，請先縮小原圖。');
}
export async function preparePhoto(source) {
  const image = await loadPhoto(source);
  // Enlarge small text, cap memory use on mobile, retain a color reference pass.
  const scale = Math.min(3, 2200 / Math.max(image.width, image.height));
  const output = canvas(image.width * scale + 48, image.height * scale + 48);
  const context = output.getContext('2d', { willReadFrequently: true });
  context.fillStyle = 'white';
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(image, 24, 24, output.width - 48, output.height - 48);
  const color = output.toDataURL('image/png');
  const pixels = context.getImageData(24, 24, output.width - 48, output.height - 48);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = Math.round(0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2]);
    histogram[gray]++;
  }
  const count = pixels.width * pixels.height;
  const quantile = target => { let total = 0; for (let i = 0; i < 256; i++) { total += histogram[i]; if (total >= count * target) return i; } return 255; };
  const low = quantile(0.01), high = quantile(0.99);
  const invert = quantile(0.5) < 110;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = 0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2];
    const normalized = high > low + 20 ? Math.max(0, Math.min(255, (gray - low) * 255 / (high - low))) : gray;
    const value = invert ? 255 - normalized : normalized;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
  }
  context.putImageData(pixels, 24, 24);
  return { color, enhanced: output.toDataURL('image/png') };
}
