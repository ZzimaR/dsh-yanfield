import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "site-dist")
const port = Number(process.env.PORT) || 4173
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
}

class BadRequest extends Error {}

// Returns an absolute file path inside root, or null when nothing is there. Throws BadRequest for bad URLs.
async function resolve(rawUrl) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(rawUrl, "http://localhost").pathname)
  } catch (error) {
    if (error instanceof URIError || error instanceof TypeError) throw new BadRequest("Malformed URL")
    throw error
  }
  if (pathname.includes("\0")) throw new BadRequest("Malformed URL")
  let file = path.resolve(root, `.${pathname}`)
  if (file !== root && !file.startsWith(root + path.sep)) throw new BadRequest("Path outside the site")
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html")
    return (await stat(file)).isFile() ? file : null
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
    throw error
  }
}

function send(res, status, file) {
  res.writeHead(status, { "content-type": types[path.extname(file)] || "application/octet-stream" })
  createReadStream(file).on("error", () => res.destroy()).pipe(res)
}

http
  .createServer(async (req, res) => {
    try {
      const file = await resolve(req.url || "/")
      if (file) send(res, 200, file)
      else send(res, 404, path.join(root, "404.html"))
    } catch (error) {
      if (error instanceof BadRequest) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
        res.end(error.message)
      } else {
        console.error(error)
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
        res.end("Internal error. Did you run npm run build:site?")
      }
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`Previewing site-dist at http://127.0.0.1:${port}/`))
