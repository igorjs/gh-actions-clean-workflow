// SPDX-License-Identifier: MIT
import { fileURLToPath } from "node:url";
import { run } from "#src/main";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
