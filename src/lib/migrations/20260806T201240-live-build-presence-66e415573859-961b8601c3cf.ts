import { schema as s } from "jazz-tools";

export default s.defineMigration({
  createTables: {
    "liveBuildPresence": true,
  },
  fromHash: "66e415573859",
  toHash: "961b8601c3cf",
  from: {},
  to: {
  "liveBuildPresence": s.table({
    "build_id": s.ref("liveBuilds"),
    "generation": s.int(),
    "user_id": s.string(),
    "session_id": s.string(),
    "mode": s.enum("edit", "view"),
    "target": s.string().optional(),
    "visible": s.boolean(),
    "lastSeenAt": s.timestamp(),
  })
},
});
