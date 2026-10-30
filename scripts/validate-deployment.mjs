// Validate configuration without logging values or connecting to the database.
import { deploymentProblems } from "./deployment-config.mjs";
const problems = deploymentProblems(process.env);
if (problems.length) {
  console.error(`Deployment configuration rejected:\n${problems.map(problem => `- ${problem}`).join("\n")}`);
  process.exitCode = 1;
} else console.log("Deployment configuration validated. Database connectivity and sign-in still require the deployed auth check.");
