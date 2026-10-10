import { config } from './config.js?v=20261010-7';
import { FeedbackError } from './feedback-api.js?v=20261010-7';

export function validatePhotoFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new FeedbackError('Choose a JPG, PNG or WebP picture.', 'photo');
  if (!file.size || file.size > config.photoLimit)
    throw new FeedbackError('Choose a picture smaller than 5 MB.', 'photo');
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
    image.onerror = () => { clean(); reject(new FeedbackError('This picture could not be opened. Choose another.', 'photo')); };
    image.src = url;
  });
}

export async function preparePhoto(file) {
  validatePhotoFile(file);
  const image = await decodePhoto(file);
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
