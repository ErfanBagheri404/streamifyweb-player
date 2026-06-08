import fs from "node:fs";
import path from "node:path";

const publicDirectory = path.join(process.cwd(), "public");
const fontsDirectory = path.join(publicDirectory, "fonts");

function listFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }

    return [fullPath];
  });
}

function toPublicHref(filePath: string): string {
  return `/${path.relative(publicDirectory, filePath).replace(/\\/g, "/")}`;
}

function getFontMimeType(filePath: string): string {
  if (filePath.endsWith(".woff")) {
    return "font/woff";
  }

  if (filePath.endsWith(".ttf")) {
    return "font/ttf";
  }

  if (filePath.endsWith(".eot")) {
    return "application/vnd.ms-fontobject";
  }

  return "font/ttf";
}

const iconAssets = fs
  .readdirSync(publicDirectory, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith(".svg") || entry.name === "favicon.ico")
  )
  .map((entry) => ({
    href: `/${entry.name}`,
    type: entry.name.endsWith(".svg") ? "image/svg+xml" : "image/x-icon",
  }));

const fontHrefs = listFiles(fontsDirectory)
  .filter((filePath) => /\.(woff|ttf|eot)$/i.test(filePath))
  .map((filePath) => ({
    href: toPublicHref(filePath),
    type: getFontMimeType(filePath),
  }));

export default function Head() {
  return (
    <>
      {iconAssets.map(({ href, type }) => (
        <link
          key={href}
          rel="preload"
          href={href}
          as="image"
          type={type}
        />
      ))}
      {fontHrefs.map(({ href, type }) => (
        <link
          key={href}
          rel="preload"
          href={href}
          as="font"
          type={type}
          crossOrigin="anonymous"
        />
      ))}
    </>
  );
}
