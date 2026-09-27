import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Where captured screenshots live on disk. `SCREENSHOT_DIR` is read at module
 * load and resolved to an absolute path, because every later comparison is
 * against an absolute root and a relative one would depend on the process's
 * working directory -- which differs between the dev server, the production
 * bundle and `vitest`.
 */
export const SCREENSHOT_ROOT = path.resolve(
  process.env.SCREENSHOT_DIR ?? "var/screenshots",
)

/**
 * Key layout is unchanged from the InsForge bucket, so existing
 * `crawled_pages.screenshot_desktop_url` values keep their shape: the job id, a
 * slash, and a one-based page number with a fixed extension.
 *
 * `pageIndex` is zero-based on the way in because it indexes an array of crawl
 * results, and one-based on the way out because that is what the stored URLs
 * have always said.
 */
export function screenshotKey(jobId: string, pageIndex: number): string {
  return `${jobId}/${pageIndex + 1}.png`
}

/**
 * Resolves `key` under the storage root, refusing anything that escapes it.
 *
 * The check is load-bearing. `jobId` reaches this module from crawl output,
 * which is derived from a third-party page, so a value of `../../..` would
 * otherwise read and write files anywhere the process can reach. Comparing
 * against `root + path.sep` rather than `root` matters: a bare `startsWith(root)`
 * accepts a sibling directory whose name merely begins with the root's, such as
 * `var/screenshots-evil`.
 */
function absolute(key: string): string {
  const root = SCREENSHOT_ROOT
  const resolved = path.resolve(root, key)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("screenshot key escapes storage root")
  }
  return resolved
}

export async function writeScreenshot(
  jobId: string,
  pageIndex: number,
  bytes: Buffer,
): Promise<{ key: string; url: string }> {
  const key = screenshotKey(jobId, pageIndex)
  const file = absolute(key)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes)
  return { key, url: `/api/screenshot/${key}` }
}

/**
 * Rejects when the file is absent rather than answering empty bytes: an empty
 * `Buffer` decodes as a broken image with no error anywhere in the pipeline, so
 * only a rejection can reach a caller's error branch.
 */
export async function readScreenshot(
  jobId: string,
  pageIndex: number,
): Promise<Buffer> {
  return readFile(absolute(screenshotKey(jobId, pageIndex)))
}
