export type JsonObject = Record<string, unknown>;

/** A dereferenced schema object. It may contain cycles (recursive schemas). */
export type Schema = JsonObject;

export const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface SpecInfo {
  file: string;
  openapi: string;
  title: string;
  version: string;
}

export interface LoadedSpec {
  info: SpecInfo;
  /** Fully dereferenced document. */
  document: JsonObject;
}

/** One entry of a `content` map. `key` is the media type exactly as written in the document. */
export interface ContentEntry {
  key: string;
  schema: Schema | undefined;
}

export interface NormalizedParameter {
  /** Identity across versions: `(in, name)`, or the template position for path parameters. */
  key: string;
  name: string;
  in: string;
  required: boolean;
  schema: Schema | undefined;
  /** Effective `style` / `explode` rendered as text, for comparison and messages. */
  serialization: string;
}

export interface NormalizedBody {
  required: boolean;
  content: Map<string, ContentEntry>;
}

export interface NormalizedResponse {
  /** The status key as written in the document. */
  key: string;
  content: Map<string, ContentEntry>;
}

/** One alternative of a security requirement: every listed scheme must be satisfied. */
export type SecurityAlternative = ReadonlyMap<string, readonly string[]>;

export interface NormalizedOperation {
  method: HttpMethod;
  deprecated: boolean;
  parameters: Map<string, NormalizedParameter>;
  requestBody: NormalizedBody | undefined;
  /** Keyed by normalized status (`200`, `2XX`, `default`). */
  responses: Map<string, NormalizedResponse>;
  /** Effective requirement: any one alternative suffices. Empty list means no security. */
  security: SecurityAlternative[];
}

export interface NormalizedPath {
  /** Template shape, e.g. `/users/{}`. */
  key: string;
  /** The template as written, e.g. `/users/{id}`. */
  template: string;
  /** Path parameter names in template order. */
  paramNames: string[];
  operations: Map<HttpMethod, NormalizedOperation>;
}

export interface NormalizedSpec {
  info: SpecInfo;
  paths: Map<string, NormalizedPath>;
}
