// services/testLeetCode.js
import { getLeetCodeStats } from "./leetcodeService.js";

(async () => {
  try {
    const stats = await getLeetCodeStats("awasthinush2580");
    console.log("✅ Detailed Stats:", stats);
  } catch (error) {
    console.error("❌ Error running test:", error.message);
  }
})();
