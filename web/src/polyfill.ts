// @apidevtools/swagger-parser checks `Buffer.isBuffer` while parsing, even for in-memory objects.
// Browsers have no Buffer global, so provide the standard userland implementation.
import { Buffer } from "buffer";

const scope = globalThis as { Buffer?: typeof Buffer };
scope.Buffer ??= Buffer;
