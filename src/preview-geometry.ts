/** The solved poster remains native-sized. Only its outer preview is scaled. */
export function previewGeometry(width: number, height: number, availableWidth: number, maxHeight: number) {
  const scale = Math.min(Math.max(1, availableWidth) / width, maxHeight / height, 1);
  return { scale, width: width * scale, height: height * scale };
}
