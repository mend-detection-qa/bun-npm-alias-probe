// Probe stub — not meant to be executed.
// Exists solely to satisfy the project-creator output spec and
// give Mend's scanner a TypeScript entry-point to anchor detection.
//
// This probe exercises the npm: alias protocol:
//   my-lodash  → npm:lodash@^4.17.0  (resolves to lodash@4.17.21)
//   old-lodash → npm:lodash@3.10.1   (exact older version)
//   hono       → ^4.12.0             (control — plain registry dep)

import { Hono } from "hono";

// my-lodash is installed under the alias name in node_modules/my-lodash/
// even though the underlying package is named "lodash"
import _ from "my-lodash";

// old-lodash is a separate entry at node_modules/old-lodash/
// despite resolving to the same upstream package name "lodash"
import _old from "old-lodash";

const app = new Hono();

app.get("/", (c) => {
  const chunk = _.chunk([1, 2, 3, 4], 2);
  return c.json({ chunk });
});

export default app;