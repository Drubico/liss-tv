import { pathToFileURL } from "node:url";
import { resolve as pathResolve } from "node:path";
import { existsSync } from "node:fs";

const rootDir = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }

  if (specifier.startsWith("@/")) {
    const subpath = specifier.slice(2);
    const fullPath = pathResolve(rootDir, subpath);
    if (existsSync(fullPath + ".ts")) {
      return nextResolve(pathToFileURL(fullPath + ".ts").href, context);
    }
    if (existsSync(fullPath + ".js")) {
      return nextResolve(pathToFileURL(fullPath + ".js").href, context);
    }
    if (existsSync(fullPath)) {
      return nextResolve(pathToFileURL(fullPath).href, context);
    }
  }

  // Also handle relative imports without extensions
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (err.code === "ERR_MODULE_NOT_FOUND") {
        if (context.parentURL) {
          const parentPath = new URL(context.parentURL).pathname.replace(/^\/([A-Z]:)/, "$1");
          const target = pathResolve(parentPath, "..", specifier);
          if (existsSync(target + ".ts")) {
            return nextResolve(pathToFileURL(target + ".ts").href, context);
          }
          if (existsSync(target + ".js")) {
            return nextResolve(pathToFileURL(target + ".js").href, context);
          }
        }
      }
      throw err;
    }
  }

  return nextResolve(specifier, context);
}
