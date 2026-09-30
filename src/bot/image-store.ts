// In-memory cache for AI-generated images
export const generatedImagesStore = new Map<string, { buffer: Buffer; createdAt: number }>();

export function storeGeneratedImage(id: string, base64: string): string {
  const buffer = Buffer.from(base64, 'base64');
  generatedImagesStore.set(id, { buffer, createdAt: Date.now() });

  // Clean old images (older than 2 hours)
  if (generatedImagesStore.size > 80) {
    const cutoff = Date.now() - 7200000;
    for (const [key, val] of generatedImagesStore.entries()) {
      if (val.createdAt < cutoff) generatedImagesStore.delete(key);
    }
  }

  const base = process.env.RENDER_EXTERNAL_URL || 'https://rewards-messenger-bot-lgl7.onrender.com';
  return `${base}/api/images/${id}.jpg`;
}
