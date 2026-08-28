import { runRiskScanForAllSchools } from "@/lib/phase4-service";

async function run(){
  const results=await runRiskScanForAllSchools();
  console.info("SukuuNova risk scan completed:",JSON.stringify(results));
}

void run();
const interval=Number(process.env.RISK_SCAN_INTERVAL_MS||21600000);
setInterval(()=>{void run().catch(error=>console.error("Risk scan failed:",error));},interval);
