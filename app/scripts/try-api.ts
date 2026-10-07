import { createHttpClient } from "@mit-sdg/sync-engine-http/client";
import type { TeamsweeperWireHttp } from "../generated/wire.ts";

const client = createHttpClient<TeamsweeperWireHttp>({
  baseUrl: "http://127.0.0.1:3000/api",
});

const created = await client.rooms.create({ name: "Alice" });
console.log("Create room:", created);

if ("error" in created) {
  throw new Error(`Room creation failed: ${created.error}`);
}

console.log(
  "Bob joins:",
  await client.rooms.join({
    code: created.code,
    name: "Bob",
  }),
);

console.log(
  "Empty creator name:",
  await client.rooms.create({ name: "" }),
);

console.log(
  "Invalid room code:",
  await client.rooms.join({
    code: "INVALID",
    name: "Charlie",
  }),
);

console.log(
  "Empty joining name:",
  await client.rooms.join({
    code: created.code,
    name: "",
  }),
);