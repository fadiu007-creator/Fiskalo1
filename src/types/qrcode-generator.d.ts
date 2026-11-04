declare module "qrcode-generator" {
  type QRCode = {
    addData(data: string, mode?: "Numeric" | "Alphanumeric" | "Byte" | "Kanji"): void;
    make(): void;
    getModuleCount(): number;
    createSvgTag(cellSize?: number, margin?: number, alt?: string): string;
  };
  function qrcode(typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QRCode;
  export default qrcode;
}
