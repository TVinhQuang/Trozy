import { useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { api } from './api';
import { useApp } from './context';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function BusinessPdfLink({ href, children, ...props }: Props) {
  const { bootstrap, notify } = useApp();
  const [busy, setBusy] = useState(false);
  async function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!bootstrap.capabilities?.browserPdf || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const preview = props.target === '_blank' ? window.open('about:blank', '_blank') : null;
    if (preview) preview.opener = null;
    try {
      const url = new URL(href, location.origin);
      url.searchParams.set('definition', '1');
      const [documentData, { default: pdfMake }, { default: fonts }] = await Promise.all([
        api<{definition: object, filename: string}>(url.pathname.slice(4) + url.search),
        import('pdfmake/build/pdfmake.min.js'), import('pdfmake/build/vfs_fonts.js'),
      ]);
      const pdf = pdfMake.createPdf(documentData.definition, undefined, undefined, fonts);
      const blob = await new Promise<Blob>(resolve => pdf.getBlob(resolve));
      const objectUrl = URL.createObjectURL(blob);
      if (preview && !preview.closed) preview.location.replace(objectUrl);
      else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = documentData.filename;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      preview?.close();
      notify((error as Error).message, 'error');
    } finally { setBusy(false); }
  }
  return <a {...props} href={href} onClick={open} aria-busy={busy}>{busy ? 'Đang tạo PDF…' : children}</a>;
}
