import { execSync } from "node:child_process";

const args = process.argv.slice(2).join(" ");
const cmd = `docker exec -it pilotlog-read-api sh -lc 'cd /app && PILOTLOG_HOME=/app/data node bin/pilotlog.mjs add ${args}'`;

execSync(cmd, { stdio: "inherit" });
