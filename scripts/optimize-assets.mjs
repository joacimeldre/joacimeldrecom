#!/usr/bin/env node
import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { optimize as optimizeSvg } from "svgo";

const cwd = process.cwd();
const DEFAULT_INCLUDE_DIRS = ["public", "src/content/images"];
const DEFAULT_REFERENCE_DIRS = ["src"];
const RASTER_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".gif",
]);
const CONVERTIBLE_TO_WEBP = new Set([".jpg", ".jpeg", ".png", ".gif", ".avif"]);
const SVG_EXTENSION = ".svg";
const WEBP_EXTENSION = ".webp";
const MIN_SAVINGS_BYTES = 1024;
const TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".astro",
  ".ts",
  ".js",
  ".css",
  ".json",
]);
const PUBLIC_CRITICAL_BASENAMES = new Set([
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "ogdefault.png",
]);

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function parseArgs(args) {
  const options = {
    dryRun: false,
    quality: 82,
    include: [...DEFAULT_INCLUDE_DIRS],
    referenceDirs: [...DEFAULT_REFERENCE_DIRS],
    convertTo: null,
    keepOriginal: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--quality") {
      const qualityRaw = args[i + 1];
      const quality = Number.parseInt(qualityRaw ?? "", 10);
      if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
        throw new Error("--quality must be an integer between 1 and 100");
      }
      options.quality = quality;
      i += 1;
      continue;
    }

    if (arg === "--include") {
      const includeRaw = args[i + 1];
      if (!includeRaw) {
        throw new Error("--include requires a directory path");
      }
      options.include = includeRaw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (options.include.length === 0) {
        throw new Error("--include must include at least one path");
      }
      i += 1;
      continue;
    }

    if (arg === "--references") {
      const refsRaw = args[i + 1];
      if (!refsRaw) {
        throw new Error("--references requires at least one path");
      }
      options.referenceDirs = refsRaw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (options.referenceDirs.length === 0) {
        throw new Error("--references must include at least one path");
      }
      i += 1;
      continue;
    }

    if (arg === "--convert-to") {
      const format = (args[i + 1] || "").toLowerCase();
      if (format !== "webp") {
        throw new Error("--convert-to currently supports only 'webp'");
      }
      options.convertTo = format;
      i += 1;
      continue;
    }

    if (arg === "--keep-original") {
      options.keepOriginal = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function replaceAllLiteral(source, needle, replacement) {
  if (!needle || needle === replacement) {
    return source;
  }
  return source.split(needle).join(replacement);
}

function isCriticalPublicAsset(filePath) {
  const relative = toPosixPath(path.relative(cwd, filePath));
  if (!relative.startsWith("public/")) {
    return false;
  }
  return PUBLIC_CRITICAL_BASENAMES.has(path.basename(relative));
}

function isP8Asset(filePath) {
  return /\.p8\./i.test(path.basename(filePath));
}

async function walkFiles(startPath) {
  const absoluteStartPath = path.resolve(cwd, startPath);
  const files = [];

  let entries;
  try {
    entries = await fs.readdir(absoluteStartPath, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return files;
    }
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(absoluteStartPath, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await walkFiles(path.join(startPath, entry.name));
      files.push(...nestedFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

async function optimizeRaster(buffer, extension, quality) {
  const image =
    extension === ".webp"
      ? sharp(buffer, { animated: true, pages: -1 }).rotate().withMetadata()
      : sharp(buffer, { animated: false }).rotate().withMetadata();

  if (extension === ".jpg" || extension === ".jpeg") {
    return image
      .jpeg({
        quality,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();
  }

  if (extension === ".png") {
    return image
      .png({
        quality,
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
      })
      .toBuffer();
  }

  if (extension === ".webp") {
    return image
      .webp({
        quality,
        effort: 6,
      })
      .toBuffer();
  }

  return image
    .avif({
      quality,
      effort: 6,
    })
    .toBuffer();
}

async function encodeWebp(buffer, quality, extension) {
  const source =
    extension === ".gif"
      ? sharp(buffer, { animated: true, pages: -1 })
      : sharp(buffer, { animated: false });

  return source
    .rotate()
    .withMetadata()
    .webp({
      quality,
      effort: 6,
    })
    .toBuffer();
}

async function convertFileToWebp(filePath, options) {
  const originalBuffer = await fs.readFile(filePath);
  const originalSize = originalBuffer.byteLength;
  const targetPath = filePath.replace(/\.[^.]+$/, WEBP_EXTENSION);

  if (targetPath === filePath) {
    return {
      status: "kept",
      originalSize,
      optimizedSize: originalSize,
      savedBytes: 0,
    };
  }

  let convertedBuffer;
  try {
    convertedBuffer = await encodeWebp(
      originalBuffer,
      options.quality,
      path.extname(filePath).toLowerCase(),
    );
  } catch {
    return { status: "skipped", reason: "webp-conversion-failed" };
  }

  const optimizedSize = convertedBuffer.byteLength;
  const savedBytes = originalSize - optimizedSize;

  if (savedBytes < MIN_SAVINGS_BYTES) {
    return { status: "kept", originalSize, optimizedSize, savedBytes };
  }

  if (!options.dryRun) {
    await fs.writeFile(targetPath, convertedBuffer);
    if (!options.keepOriginal) {
      await fs.unlink(filePath);
    }
  }

  return {
    status: options.dryRun ? "dry-run-convert" : "converted",
    originalSize,
    optimizedSize,
    savedBytes,
    targetPath,
  };
}

async function optimizeFile(filePath, options) {
  const extension = path.extname(filePath).toLowerCase();

  if (!RASTER_EXTENSIONS.has(extension) && extension !== SVG_EXTENSION) {
    return { status: "skipped", reason: "unsupported" };
  }

  const originalBuffer = await fs.readFile(filePath);
  const originalSize = originalBuffer.byteLength;

  let optimizedBuffer;
  if (extension === SVG_EXTENSION) {
    const optimized = optimizeSvg(originalBuffer.toString("utf8"), {
      path: filePath,
      multipass: true,
    });

    if (!optimized.data) {
      return { status: "skipped", reason: "svgo-failed" };
    }

    optimizedBuffer = Buffer.from(optimized.data, "utf8");
  } else {
    try {
      optimizedBuffer = await optimizeRaster(
        originalBuffer,
        extension,
        options.quality,
      );
    } catch {
      return { status: "skipped", reason: "sharp-failed" };
    }
  }

  const optimizedSize = optimizedBuffer.byteLength;
  const savedBytes = originalSize - optimizedSize;

  if (savedBytes < MIN_SAVINGS_BYTES) {
    return { status: "kept", originalSize, optimizedSize, savedBytes };
  }

  if (!options.dryRun) {
    await fs.writeFile(filePath, optimizedBuffer);
  }

  return {
    status: options.dryRun ? "dry-run" : "optimized",
    originalSize,
    optimizedSize,
    savedBytes,
  };
}

async function getReferenceFiles(referenceDirs) {
  let files = [];
  for (const referenceDir of referenceDirs) {
    const absolutePath = path.resolve(cwd, referenceDir);
    const stats = await fs
      .stat(absolutePath)
      .catch((error) =>
        error && error.code === "ENOENT" ? null : Promise.reject(error),
      );

    if (!stats) {
      continue;
    }

    if (stats.isFile()) {
      files.push(absolutePath);
      continue;
    }

    const discovered = await walkFiles(referenceDir);
    files.push(...discovered);
  }

  files = Array.from(new Set(files));
  return files.filter((filePath) =>
    TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
  );
}

async function rewriteReferences(conversions, options) {
  if (conversions.length === 0) {
    return { filesUpdated: 0, referenceUpdates: 0 };
  }

  const textFiles = await getReferenceFiles(options.referenceDirs);
  let filesUpdated = 0;
  let referenceUpdates = 0;

  for (const textFile of textFiles) {
    const originalContent = await fs.readFile(textFile, "utf8");
    let updatedContent = originalContent;
    const textDir = path.dirname(textFile);

    for (const conversion of conversions) {
      const oldRelFromFile = toPosixPath(
        path.relative(textDir, conversion.oldPath),
      );
      const newRelFromFile = toPosixPath(
        path.relative(textDir, conversion.newPath),
      );

      const beforeRelative = updatedContent;
      updatedContent = replaceAllLiteral(
        updatedContent,
        oldRelFromFile,
        newRelFromFile,
      );
      if (oldRelFromFile.startsWith("./")) {
        updatedContent = replaceAllLiteral(
          updatedContent,
          oldRelFromFile.slice(2),
          newRelFromFile.startsWith("./")
            ? newRelFromFile.slice(2)
            : newRelFromFile,
        );
      }
      if (updatedContent !== beforeRelative) {
        referenceUpdates += 1;
      }

      const oldRelativeToRepo = toPosixPath(
        path.relative(cwd, conversion.oldPath),
      );
      const newRelativeToRepo = toPosixPath(
        path.relative(cwd, conversion.newPath),
      );
      if (oldRelativeToRepo.startsWith("public/")) {
        const oldPublicUrl = `/${oldRelativeToRepo.slice("public/".length)}`;
        const newPublicUrl = `/${newRelativeToRepo.slice("public/".length)}`;
        const beforePublic = updatedContent;
        updatedContent = replaceAllLiteral(
          updatedContent,
          oldPublicUrl,
          newPublicUrl,
        );
        if (updatedContent !== beforePublic) {
          referenceUpdates += 1;
        }
      }
    }

    if (updatedContent !== originalContent) {
      filesUpdated += 1;
      if (!options.dryRun) {
        await fs.writeFile(textFile, updatedContent);
      }
      const relative = toPosixPath(path.relative(cwd, textFile));
      console.log(
        `${options.dryRun ? "DRY-RUN REWRITE" : "REWROTE"} ${relative}`,
      );
    }
  }

  return { filesUpdated, referenceUpdates };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let files = [];
  for (const includeDir of options.include) {
    const discovered = await walkFiles(includeDir);
    files.push(...discovered);
  }

  files = Array.from(new Set(files));

  const summary = {
    scanned: 0,
    optimized: 0,
    converted: 0,
    dryRun: 0,
    dryRunConvert: 0,
    kept: 0,
    skipped: 0,
    bytesSaved: 0,
    filesRewritten: 0,
    referencesUpdated: 0,
  };

  const conversions = [];

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();
    if (!RASTER_EXTENSIONS.has(extension) && extension !== SVG_EXTENSION) {
      continue;
    }

    summary.scanned += 1;

    // In conversion mode, keep existing WebP files as-is to avoid unnecessary re-encoding.
    if (options.convertTo === "webp" && extension === WEBP_EXTENSION) {
      summary.kept += 1;
      continue;
    }

    if (
      options.convertTo === "webp" &&
      CONVERTIBLE_TO_WEBP.has(extension) &&
      !isCriticalPublicAsset(filePath) &&
      !isP8Asset(filePath)
    ) {
      const converted = await convertFileToWebp(filePath, options);
      const relativePath = toPosixPath(path.relative(cwd, filePath));

      if (
        converted.status === "converted" ||
        converted.status === "dry-run-convert"
      ) {
        const isDryRunConversion = converted.status === "dry-run-convert";
        summary[isDryRunConversion ? "dryRunConvert" : "converted"] += 1;
        summary.bytesSaved += converted.savedBytes;
        const before = formatBytes(converted.originalSize);
        const after = formatBytes(converted.optimizedSize);
        const saved = formatBytes(converted.savedBytes);
        const targetRelative = toPosixPath(
          path.relative(cwd, converted.targetPath),
        );
        console.log(
          `${isDryRunConversion ? "DRY-RUN CONVERT" : "CONVERTED"} ${relativePath} -> ${targetRelative} (${before} -> ${after}, saved ${saved})`,
        );
        conversions.push({ oldPath: filePath, newPath: converted.targetPath });
        continue;
      }

      if (converted.status === "kept") {
        summary.kept += 1;
        continue;
      }

      summary.skipped += 1;
      console.log(`SKIPPED ${relativePath} (${converted.reason})`);
      continue;
    }

    const result = await optimizeFile(filePath, options);
    const relativePath = toPosixPath(path.relative(cwd, filePath));

    if (result.status === "optimized" || result.status === "dry-run") {
      summary[result.status === "optimized" ? "optimized" : "dryRun"] += 1;
      summary.bytesSaved += result.savedBytes;
      const before = formatBytes(result.originalSize);
      const after = formatBytes(result.optimizedSize);
      const saved = formatBytes(result.savedBytes);
      console.log(
        `${result.status.toUpperCase()} ${relativePath} (${before} -> ${after}, saved ${saved})`,
      );
      continue;
    }

    if (result.status === "kept") {
      summary.kept += 1;
      continue;
    }

    summary.skipped += 1;
    console.log(`SKIPPED ${relativePath} (${result.reason})`);
  }

  if (conversions.length > 0) {
    const rewriteSummary = await rewriteReferences(conversions, options);
    summary.filesRewritten = rewriteSummary.filesUpdated;
    summary.referencesUpdated = rewriteSummary.referenceUpdates;
  }

  console.log("\nOptimization summary");
  console.log(`Scanned: ${summary.scanned}`);
  console.log(`Optimized: ${summary.optimized}`);
  console.log(`Converted to WebP: ${summary.converted}`);
  console.log(`Dry run candidates: ${summary.dryRun}`);
  console.log(`Dry run conversion candidates: ${summary.dryRunConvert}`);
  console.log(`Kept as-is: ${summary.kept}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Text files rewritten: ${summary.filesRewritten}`);
  console.log(`Reference update groups: ${summary.referencesUpdated}`);
  console.log(`Total saved: ${formatBytes(summary.bytesSaved)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
