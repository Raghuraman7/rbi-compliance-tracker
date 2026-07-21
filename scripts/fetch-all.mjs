// Master Fetch Runner for Kreon RegPulse
// Runs all RBI and SEBI regulatory update scrapers in sequence.

import { checkRbiNotifications } from "./fetch-rbi-notifications.mjs";
import { checkSebiCirculars } from "./fetch-sebi-circulars.mjs";
import { checkRbiMasterDirections } from "./fetch-master-directions.mjs";
import { checkSebiRegulations } from "./fetch-sebi-regulations.mjs";

async function main() {
  console.log("==================================================================");
  console.log("🚀 Starting Full Regulatory Update Refresh (RBI & SEBI)...");
  console.log("==================================================================");

  try {
    await checkRbiNotifications();
  } catch (err) {
    console.error("❌ RBI Notifications check error:", err.message);
  }

  try {
    await checkSebiCirculars();
  } catch (err) {
    console.error("❌ SEBI Circulars check error:", err.message);
  }

  try {
    await checkRbiMasterDirections();
  } catch (err) {
    console.error("❌ RBI Master Directions check error:", err.message);
  }

  try {
    await checkSebiRegulations();
  } catch (err) {
    console.error("❌ SEBI Regulations check error:", err.message);
  }

  console.log("==================================================================");
  console.log("✅ Full Regulatory Update Refresh Completed.");
  console.log("==================================================================");
}

main().catch(err => {
  console.error("Fatal error running master fetch:", err);
  process.exit(1);
});
