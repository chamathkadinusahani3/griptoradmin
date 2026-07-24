import { upload } from '@vercel/blob/client';

/**
 * Downscales an image via canvas before upload — same compress-then-store
 * technique already used for the branding logo (ClientDetail.tsx's
 * resizeImageToDataUrl), just producing a Blob for direct upload here
 * instead of a data URL for inline Mongo storage.
 */
function compressImageToBlob(file: File, maxDim = 1600, quality = 0.75): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))), 'image/jpeg', quality);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export interface UploadedMedia {
  url: string;
  type: 'image' | 'video';
}

/**
 * Uploads a photo or video directly from the browser to Vercel Blob (never
 * proxied through griptoradmin's own server — serverless functions have a
 * small request-body limit that videos would blow past). Images are
 * compressed client-side first; video uploads as-is, since real object
 * storage doesn't have the document-size problem that made Mongo-inline
 * video impractical.
 */
export async function uploadInspectionMedia(clientId: string, file: File): Promise<UploadedMedia> {
  const isVideo = file.type.startsWith('video/');
  const body: Blob = isVideo ? file : await compressImageToBlob(file);
  const ext = isVideo ? file.name.split('.').pop() || 'mp4' : 'jpg';
  const folder = isVideo ? 'videos' : 'photos';
  const pathname = `inspections/${clientId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const result = await upload(pathname, body, {
    access: 'public',
    handleUploadUrl: '/api/inspections/upload-token',
  });

  return { url: result.url, type: isVideo ? 'video' : 'image' };
}
