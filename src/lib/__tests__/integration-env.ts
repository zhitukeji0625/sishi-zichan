import { join } from "path";
import { tmpdir } from "os";

/** Written by vitest globalSetup: "1" if DB connect OK, "0" otherwise */
export const integrationDbFlagPath = join(tmpdir(), "sishi-zichan-vitest-db.txt");
