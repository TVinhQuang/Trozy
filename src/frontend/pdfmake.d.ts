declare module 'pdfmake/build/vfs_fonts.js' {
  const fonts: Record<string, string>;
  export default fonts;
}
declare module 'pdfmake/build/pdfmake.min.js' {
  const pdfMake: { createPdf(definition: object, layouts: undefined, fonts: undefined, vfs: Record<string, string>): { getBlob(callback: (value: Blob) => void): void } };
  export default pdfMake;
}
