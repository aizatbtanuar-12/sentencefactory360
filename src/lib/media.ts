// Camera / microphone helpers.

/** Resize an image (canvas, video frame or file) to a small JPEG for fast uploads. */
export async function toJpeg(src: CanvasImageSource, w: number, h: number, maxSide = 720, mirror = false): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  if (mirror) {
    g.translate(cw, 0);
    g.scale(-1, 1);
  }
  g.drawImage(src, 0, 0, cw, ch);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make photo'))), 'image/jpeg', 0.82));
}

/** Square-crop + resize an uploaded photo file. */
export async function fileToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not a photo.'));
      i.src = url;
    });
    return await toJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  return options.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';
}

export const canRecord =
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
export const canUseCamera = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function stopStream(s: MediaStream | null | undefined) {
  s?.getTracks().forEach((t) => t.stop());
}

export function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'The camera is blocked. Ask your teacher to allow the camera, or upload a photo instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found. You can upload a photo instead.';
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it and try again.';
  return 'The camera could not start. You can upload a photo instead.';
}

export function micErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'The microphone is blocked. Ask your teacher to allow the microphone, or upload a recording.';
  if (name === 'NotFoundError') return 'No microphone was found. You can upload a recording instead.';
  return 'The microphone could not start. You can upload a recording instead.';
}

/** Read the duration of an audio blob (used for uploaded recordings). */
export function audioDuration(blob: Blob): Promise<number> {
  return new Promise((res) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (ms: number) => {
      URL.revokeObjectURL(url);
      res(ms);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration * 1000 : 0);
    a.onerror = () => done(0);
    a.src = url;
  });
}
