import SwaggerParser from "@apidevtools/swagger-parser";
import { SpecdiffError } from "./errors.js";
import type { JsonObject, LoadedSpec } from "./model.js";

const SUPPORTED = /^3\.[01](\.\d+)?(-.+)?$/;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse, validate and dereference one OpenAPI 3.0.x / 3.1.x document. */
export async function loadSpec(file: string): Promise<LoadedSpec> {
  let document: unknown;
  try {
    document = await SwaggerParser.validate(file, {
      // Stay offline and deterministic: only local files are resolved.
      resolve: { http: false },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SpecdiffError(`${file}: ${message}`);
  }
  const root: JsonObject = isObject(document) ? document : {};
  const openapi = root.openapi;
  if (typeof openapi !== "string" || !SUPPORTED.test(openapi)) {
    const found =
      typeof openapi === "string" ? `OpenAPI ${openapi}` : `Swagger ${String(root.swagger)}`;
    throw new SpecdiffError(
      `${file}: unsupported specification (found ${found}); SpecDiff supports OpenAPI 3.0.x and 3.1.x`,
    );
  }
  const info = isObject(root.info) ? root.info : {};
  return {
    info: {
      file,
      openapi,
      title: typeof info.title === "string" ? info.title : "",
      version: typeof info.version === "string" ? info.version : "",
    },
    document: root,
  };
}
