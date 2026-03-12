import { execSync } from "node:child_process";

const args = process.argv.slice(2).join(" ");
const cmd = `docker exec -it pilotlog-api sh -lc 'cd /app && PILOTLOG_HOME=/data node pilotlog-cli/dist/cli/pilotlog/src/cli/undeployed-local.js add ${args}'`;

execSync(cmd, { stdio: "inherit" });
