import { httpWire } from "@mit-sdg/sync-engine-http/tooling";

import { assembleApplication } from "./src/assembly.ts";
import { policy } from "./src/http.ts";

export default {
  assemble: assembleApplication,
  title: "Teamsweeper",
  wireName: "TeamsweeperWire",
  design: {
    version: 1,
    documents: [
      new URL("./design/types.md", import.meta.url),
      new URL("./design/compositions/Rooms.md", import.meta.url),
      new URL("./design/compositions/Game.md", import.meta.url),
      new URL("./design/compositions/Annotations.md", import.meta.url),
      new URL("./design/compositions/Rankings.md", import.meta.url),
    ],
  },
  projections: [
    httpWire({ policy, name: "TeamsweeperWireHttp" }),
  ],
};