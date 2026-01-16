/**
 * Test script for debugging token merging
 * 
 * Usage:
 * 1. Paste token data from console logs
 * 2. Run this script to test different merge strategies
 * 3. See what values are needed for tokens to merge
 */

/**
 * Test token merging with different strategies
 * @param {Array} tokens - Array of tokens with {text, x, y, w, h}
 * @param {Object} options - Test options
 */
export function testTokenMerge(tokens, options = {}) {
  console.log("=".repeat(80));
  console.log("🧪 [Token Merge Test] Starting test with", tokens.length, "tokens");
  console.log("=".repeat(80));
  
  // Display all tokens
  console.log("\n📊 [Tokens] All tokens:");
  tokens.forEach((token, idx) => {
    const yCenter = token.y + (token.h || 0) / 2;
    const yBottom = token.y + (token.h || 0);
    console.log(`  Token ${idx + 1}: "${token.text?.substring(0, 20) || ""}"`, {
      x: Math.round(token.x),
      y: Math.round(token.y),
      w: Math.round(token.w || 0),
      h: Math.round(token.h || 0),
      yCenter: Math.round(yCenter),
      yBottom: Math.round(yBottom),
      right: Math.round(token.x + (token.w || 0)),
    });
  });
  
  // Calculate statistics
  const avgHeight = tokens.reduce((sum, t) => sum + (t.h || 0), 0) / tokens.length;
  const minY = Math.min(...tokens.map(t => t.y));
  const maxY = Math.max(...tokens.map(t => t.y + (t.h || 0)));
  const yRange = maxY - minY;
  const sortedByX = [...tokens].sort((a, b) => a.x - b.x);
  const isSortedByX = tokens.every((t, idx) => Math.abs(t.x - sortedByX[idx].x) < 1);
  
  console.log("\n📈 [Statistics]:");
  console.log("  Average height:", Math.round(avgHeight), "px");
  console.log("  Y range:", Math.round(yRange), "px");
  console.log("  Min Y:", Math.round(minY), "px");
  console.log("  Max Y:", Math.round(maxY), "px");
  console.log("  Sorted by X:", isSortedByX ? "✅ Yes" : "❌ No");
  
  // Calculate distances between consecutive tokens
  console.log("\n📏 [Distances] Between consecutive tokens:");
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const curr = tokens[i];
    
    const prevRight = prev.x + (prev.w || 0);
    const currLeft = curr.x;
    const distanceX = currLeft - prevRight;
    
    const prevYCenter = prev.y + (prev.h || 0) / 2;
    const currYCenter = curr.y + (curr.h || 0) / 2;
    const distanceY = Math.abs(currYCenter - prevYCenter);
    
    // Calculate overlap
    const prevTop = prev.y;
    const prevBottom = prev.y + (prev.h || 0);
    const currTop = curr.y;
    const currBottom = curr.y + (curr.h || 0);
    const overlapTop = Math.max(prevTop, currTop);
    const overlapBottom = Math.min(prevBottom, currBottom);
    const overlapHeight = Math.max(0, overlapBottom - overlapTop);
    const minHeight = Math.min(prev.h || 0, curr.h || 0);
    const overlapRatio = minHeight > 0 ? overlapHeight / minHeight : 0;
    
    const isHorizontal = currLeft > prevRight;
    
    console.log(`  ${i - 1} → ${i}: "${prev.text?.substring(0, 10)}" → "${curr.text?.substring(0, 10)}"`, {
      distanceX: Math.round(distanceX),
      distanceY: Math.round(distanceY),
      overlapRatio: (overlapRatio * 100).toFixed(0) + "%",
      overlapHeight: Math.round(overlapHeight),
      isHorizontal: isHorizontal ? "✅" : "❌",
    });
  }
  
  // Test different merge strategies
  console.log("\n🔍 [Merge Tests] Testing different strategies:");
  
  // Strategy 1: Standard (X ≤ 60px, Y ≤ height/2)
  const X_THRESHOLD_1 = 60;
  const Y_THRESHOLD_1 = avgHeight / 2;
  console.log("\n  Strategy 1: Standard (X ≤", X_THRESHOLD_1, "px, Y ≤", Math.round(Y_THRESHOLD_1), "px)");
  testStrategy(tokens, X_THRESHOLD_1, Y_THRESHOLD_1, "standard");
  
  // Strategy 2: Lenient X (X ≤ 200px, Y ≤ height/2)
  const X_THRESHOLD_2 = 200;
  const Y_THRESHOLD_2 = avgHeight / 2;
  console.log("\n  Strategy 2: Lenient X (X ≤", X_THRESHOLD_2, "px, Y ≤", Math.round(Y_THRESHOLD_2), "px)");
  testStrategy(tokens, X_THRESHOLD_2, Y_THRESHOLD_2, "lenient-x");
  
  // Strategy 3: Lenient Y (X ≤ 60px, Y ≤ height * 2)
  const X_THRESHOLD_3 = 60;
  const Y_THRESHOLD_3 = avgHeight * 2;
  console.log("\n  Strategy 3: Lenient Y (X ≤", X_THRESHOLD_3, "px, Y ≤", Math.round(Y_THRESHOLD_3), "px)");
  testStrategy(tokens, X_THRESHOLD_3, Y_THRESHOLD_3, "lenient-y");
  
  // Strategy 4: Very Lenient (X ≤ 200px, Y ≤ height * 3)
  const X_THRESHOLD_4 = 200;
  const Y_THRESHOLD_4 = avgHeight * 3;
  console.log("\n  Strategy 4: Very Lenient (X ≤", X_THRESHOLD_4, "px, Y ≤", Math.round(Y_THRESHOLD_4), "px)");
  testStrategy(tokens, X_THRESHOLD_4, Y_THRESHOLD_4, "very-lenient");
  
  // Strategy 5: Horizontal Only (X ≤ 300px, ignore Y if horizontal)
  const X_THRESHOLD_5 = 300;
  console.log("\n  Strategy 5: Horizontal Only (X ≤", X_THRESHOLD_5, "px, ignore Y if horizontal)");
  testStrategyHorizontal(tokens, X_THRESHOLD_5);
  
  // Strategy 6: Overlap Based (X ≤ 200px, overlap ≥ 10%)
  const X_THRESHOLD_6 = 200;
  const OVERLAP_THRESHOLD = 0.1;
  console.log("\n  Strategy 6: Overlap Based (X ≤", X_THRESHOLD_6, "px, overlap ≥", (OVERLAP_THRESHOLD * 100) + "%)");
  testStrategyOverlap(tokens, X_THRESHOLD_6, OVERLAP_THRESHOLD);
  
  console.log("\n" + "=".repeat(80));
  console.log("✅ [Token Merge Test] Test completed");
  console.log("=".repeat(80));
}

function testStrategy(tokens, xThreshold, yThreshold, strategyName) {
  let mergedCount = 0;
  let groups = [];
  let currentGroup = null;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (!currentGroup) {
      currentGroup = [token];
    } else {
      const lastToken = currentGroup[currentGroup.length - 1];
      const lastRight = lastToken.x + (lastToken.w || 0);
      const tokenLeft = token.x;
      const distanceX = tokenLeft - lastRight;
      
      const lastYCenter = lastToken.y + (lastToken.h || 0) / 2;
      const tokenYCenter = token.y + (token.h || 0) / 2;
      const distanceY = Math.abs(tokenYCenter - lastYCenter);
      
      if (distanceX <= xThreshold && distanceY <= yThreshold) {
        currentGroup.push(token);
        mergedCount++;
      } else {
        groups.push(currentGroup);
        currentGroup = [token];
      }
    }
  }
  
  if (currentGroup) {
    groups.push(currentGroup);
  }
  
  const result = groups.map(g => g.map(t => t.text).join(" ")).join("\n");
  console.log(`    Result: ${groups.length} groups, ${mergedCount} merges`);
  console.log(`    Groups:`, groups.map((g, idx) => `[${idx + 1}] "${g.map(t => t.text).join(" ")}"`).join(", "));
}

function testStrategyHorizontal(tokens, xThreshold) {
  let mergedCount = 0;
  let groups = [];
  let currentGroup = null;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (!currentGroup) {
      currentGroup = [token];
    } else {
      const lastToken = currentGroup[currentGroup.length - 1];
      const lastRight = lastToken.x + (lastToken.w || 0);
      const tokenLeft = token.x;
      const distanceX = tokenLeft - lastRight;
      
      const isHorizontal = tokenLeft > lastRight;
      
      if (distanceX <= xThreshold && isHorizontal) {
        currentGroup.push(token);
        mergedCount++;
      } else {
        groups.push(currentGroup);
        currentGroup = [token];
      }
    }
  }
  
  if (currentGroup) {
    groups.push(currentGroup);
  }
  
  console.log(`    Result: ${groups.length} groups, ${mergedCount} merges`);
  console.log(`    Groups:`, groups.map((g, idx) => `[${idx + 1}] "${g.map(t => t.text).join(" ")}"`).join(", "));
}

function testStrategyOverlap(tokens, xThreshold, overlapThreshold) {
  let mergedCount = 0;
  let groups = [];
  let currentGroup = null;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (!currentGroup) {
      currentGroup = [token];
    } else {
      const lastToken = currentGroup[currentGroup.length - 1];
      const lastRight = lastToken.x + (lastToken.w || 0);
      const tokenLeft = token.x;
      const distanceX = tokenLeft - lastRight;
      
      // Calculate overlap
      const lastTop = lastToken.y;
      const lastBottom = lastToken.y + (lastToken.h || 0);
      const tokenTop = token.y;
      const tokenBottom = token.y + (token.h || 0);
      const overlapTop = Math.max(lastTop, tokenTop);
      const overlapBottom = Math.min(lastBottom, tokenBottom);
      const overlapHeight = Math.max(0, overlapBottom - overlapTop);
      const minHeight = Math.min(lastToken.h || 0, token.h || 0);
      const overlapRatio = minHeight > 0 ? overlapHeight / minHeight : 0;
      
      const isHorizontal = tokenLeft > lastRight;
      
      if (distanceX <= xThreshold && isHorizontal && overlapRatio >= overlapThreshold) {
        currentGroup.push(token);
        mergedCount++;
      } else {
        groups.push(currentGroup);
        currentGroup = [token];
      }
    }
  }
  
  if (currentGroup) {
    groups.push(currentGroup);
  }
  
  console.log(`    Result: ${groups.length} groups, ${mergedCount} merges`);
  console.log(`    Groups:`, groups.map((g, idx) => `[${idx + 1}] "${g.map(t => t.text).join(" ")}"`).join(", "));
}

// Export for use in browser console
if (typeof window !== "undefined") {
  window.testTokenMerge = testTokenMerge;
}
