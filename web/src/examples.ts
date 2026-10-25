import ordersBefore from "./samples/orders-before.yaml?raw";
import ordersAfter from "./samples/orders-after.yaml?raw";
import bookstoreV1 from "../../examples/bookstore/v1.yaml?raw";
import bookstoreV2 from "../../examples/bookstore/v2.yaml?raw";
import nullableBase from "../../test/fixtures/_none--nullable-3.0-to-3.1/base.yaml?raw";
import nullableHead from "../../test/fixtures/_none--nullable-3.0-to-3.1/head.yaml?raw";

export interface Example {
  id: string;
  title: string;
  description: string;
  before: string;
  after: string;
}

export const EXAMPLES: readonly Example[] = [
  {
    id: "orders",
    title: "Orders API: a small breaking release",
    description:
      "A required query parameter, a new required request field, a tighter limit, a removed response status and field, and a few safe additions.",
    before: ordersBefore,
    after: ordersAfter,
  },
  {
    id: "bookstore",
    title: "Bookstore API: 33 operations, every severity",
    description: "The synthetic example shipped in examples/bookstore, with 60+ changes.",
    before: bookstoreV1,
    after: bookstoreV2,
  },
  {
    id: "nullable",
    title: "OpenAPI 3.0 to 3.1: no API change",
    description:
      "`nullable: true` becomes `type: [T, null]`. The spellings differ but the contract does not, so SpecDiff reports nothing.",
    before: nullableBase,
    after: nullableHead,
  },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0] as Example;
