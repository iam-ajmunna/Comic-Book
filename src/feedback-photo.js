import { config } from './config.js?v=20261014-3';
import { FeedbackError } from './feedback-api.js?v=20261014-3';

export function validatePhotoFile(file) {
  if (!file || !Number.isFinite(file.size) || !file.size || file.size > config.photoLimit)
    throw new FeedbackError('Choose a picture smaller than 5 MB.', 'photo');
}

export async function inspectPhotoFile(file) {
  validatePhotoFile(file);
  let bytes;
  try { bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer()); }
  catch { throw new FeedbackError('This picture could not be read. Choose another.', 'photo'); }
  const match = (offset, value) => value.every((byte, index) => bytes[offset + index] === byte);
  // File.type can be empty, image/pjpeg or application/octet-stream on valid
  // camera exports. Trust bounded file signatures, not extensions or labels.
  if (match(0, [255,216,255])) return 'image/jpeg';
  if (match(0, [137,80,78,71,13,10,26,10])) return 'image/png';
  if (match(0, [82,73,70,70]) && match(8, [87,69,66,80])) return 'image/webp';
  throw new FeedbackError('Choose a JPG, PNG or WebP picture. Export HEIC/HEIF photos as JPG first.', 'photo');
}

function decodePhoto(file) {
  // A native image works in Safari as well as Chrome/Firefox. Revoke the local
  // object URL on every success/error/timeout path; no original is uploaded.
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    const clean = () => { clearTimeout(timer); URL.revokeObjectURL(url); image.onload = image.onerror = null; };
    const timer = setTimeout(() => { clean(); reject(new FeedbackError('This picture took too long to open. Choose another.', 'photo')); }, 15_000);
    image.onload = () => { clean(); resolve(image); };
    image.onerror = () => { clean(); reject(new FeedbackError('This picture could not be decoded. Export a fresh JPG or PNG and try again.', 'photo')); };
    image.src = url;
  });
}

export async function preparePhoto(file) {
  const type = await inspectPhotoFile(file);
  const image = await decodePhoto(new Blob([file], { type }));
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height || width * height > 24_000_000)
    throw new FeedbackError('Choose a picture under 24 megapixels.', 'photo');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) throw new FeedbackError('This browser couldn’t prepare the picture. Remove it to post without one.', 'photo');
  const side = Math.min(width, height);
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 160, 160);
  context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, 160, 160);
  // Redrawing strips EXIF/location metadata and limits memory/network/storage.
  return canvas.toDataURL('image/jpeg', .82);
}
