## SpecDiff report

Base: `examples/bookstore/v1.yaml (Lantern Books API 1.0.0, OpenAPI 3.0.3)`  
Head: `examples/bookstore/v2.yaml (Lantern Books API 2.0.0, OpenAPI 3.0.3)`

| Severity | Changes |
| --- | ---: |
| Breaking | 24 |
| Warning | 16 |
| Safe | 15 (hidden) |
| Info | 7 |

### `POST /authors`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `REQ_CONSTRAINT_TIGHTENED` | request body application/json: pattern of "slug" changed from "^\[a-z0-9-\]+$" to "^\[a-z0-9\_-\]+$" |

### `PUT /authors/{authorId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `REQ_CONSTRAINT_TIGHTENED` | request body application/json: pattern of "slug" changed from "^\[a-z0-9-\]+$" to "^\[a-z0-9\_-\]+$" |

### `DELETE /authors/{authorId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `OP_REMOVED` | operation DELETE /authors/{authorId} removed |

### `GET /authors/{authorId}/books`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "value\[\].format" widened: added "audiobook" |
| Breaking | `RESP_PROPERTY_REMOVED` | 200 application/json: property "value\[\].subtitle" removed |

### `GET /books`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "items\[\].format" widened: added "audiobook" |
| Breaking | `RESP_PROPERTY_REMOVED` | 200 application/json: property "items\[\].subtitle" removed |

### `POST /books`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `REQ_PROPERTY_REQUIRED_ADDED` | request body application/json: property "isbn13" added as required |
| Warning | `RESP_ENUM_WIDENED` | 201 application/json: enum of "format" widened: added "audiobook" |
| Breaking | `RESP_PROPERTY_REMOVED` | 201 application/json: property "subtitle" removed |

### `GET /books/{bookId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `PARAM_REMOVED` | query parameter "include" removed |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "format" widened: added "audiobook" |
| Breaking | `RESP_PROPERTY_REMOVED` | 200 application/json: property "subtitle" removed |

### `PUT /books/{bookId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `REQ_PROPERTY_REQUIRED_ADDED` | request body application/json: property "isbn13" added as required |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "format" widened: added "audiobook" |
| Breaking | `RESP_PROPERTY_REMOVED` | 200 application/json: property "subtitle" removed |

### `PATCH /books/{bookId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `REQ_BODY_BECAME_REQUIRED` | request body is now required |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "format" widened: added "audiobook" |
| Breaking | `RESP_PROPERTY_REMOVED` | 200 application/json: property "subtitle" removed |

### `POST /books/{bookId}/reviews`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `REQ_CONSTRAINT_TIGHTENED` | request body application/json: maximum of "rating" tightened from 10 to 5 |

### `GET /customers`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `RESP_BECAME_NULLABLE` | 200 application/json: "value\[\].email" can now be null |
| Info | `UNSUPPORTED_CONSTRUCT` | 200 application/json: "oneOf" differs between versions at "value\[\].preferences.contact" (not analyzed, review manually) |

### `POST /customers`

| Severity | Rule | Change |
| --- | --- | --- |
| Info | `UNSUPPORTED_CONSTRUCT` | request body application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually) |
| Breaking | `RESP_BECAME_NULLABLE` | 201 application/json: "email" can now be null |
| Info | `UNSUPPORTED_CONSTRUCT` | 201 application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually) |

### `GET /customers/{customerId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `RESP_BECAME_NULLABLE` | 200 application/json: "email" can now be null |
| Info | `UNSUPPORTED_CONSTRUCT` | 200 application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually) |
| Warning | `RESP_STATUS_REMOVED` | response status 404 removed |

### `PUT /customers/{customerId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Info | `UNSUPPORTED_CONSTRUCT` | request body application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually) |
| Breaking | `RESP_BECAME_NULLABLE` | 200 application/json: "email" can now be null |
| Info | `UNSUPPORTED_CONSTRUCT` | 200 application/json: "oneOf" differs between versions at "preferences.contact" (not analyzed, review manually) |

### `GET /orders`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `PARAM_BECAME_REQUIRED` | query parameter "status" is now required |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "value\[\].status" widened: added "refunded" |
| Breaking | `TYPE_CHANGED` | 200 application/json: type of "value\[\].total" changed from integer to number |

### `POST /orders`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `REQ_ENUM_NARROWED` | request body application/json: enum of "paymentMethod" narrowed: removed "cheque" |
| Warning | `RESP_ENUM_WIDENED` | 201 application/json: enum of "status" widened: added "refunded" |
| Breaking | `TYPE_CHANGED` | 201 application/json: type of "total" changed from integer to number |

### `/orders/{id}/items`

| Severity | Rule | Change |
| --- | --- | --- |
| Info | `PATH_PARAM_RENAMED` | path template renamed from /orders/{orderId}/items to /orders/{id}/items (same shape, treated as the same path) |

### `GET /orders/{orderId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "status" widened: added "refunded" |
| Breaking | `TYPE_CHANGED` | 200 application/json: type of "total" changed from integer to number |

### `POST /orders/{orderId}/cancel`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `OP_DEPRECATED` | operation is now deprecated |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "status" widened: added "refunded" |
| Breaking | `TYPE_CHANGED` | 200 application/json: type of "total" changed from integer to number |

### `/publishers/{publisherId}`

| Severity | Rule | Change |
| --- | --- | --- |
| Breaking | `PATH_REMOVED` | path /publishers/{publisherId} removed |

### `GET /search`

| Severity | Rule | Change |
| --- | --- | --- |
| Warning | `RESP_ENUM_WIDENED` | 200 application/json: enum of "value\[\].format" widened: added "audiobook" |
| Breaking | `RESP_PROPERTY_REMOVED` | 200 application/json: property "value\[\].subtitle" removed |
| Breaking | `SECURITY_ADDED` | security requirement became stricter (was none, now bearerAuth) |
