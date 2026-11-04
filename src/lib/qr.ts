import QRCode from 'qrcode';

export function shareUrl(token: string): string {
  const base = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || window.location.origin).replace(/\/+$/, '');
  return `${base}/listen/${token}`;
}

export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#1f3b63', light: '#ffffff' } });
}
