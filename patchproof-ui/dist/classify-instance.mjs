// A union type limits callers to these three exact strings.
// Like a NestJS service's return type, this describes the result at compile time.
                                                              

// Evidence collected by a successful check of one running instance.
                             
                                                                          
                  
                                                                               
                      
  

                              
                                                                         
                     
                                                         
                               
  

/**
 * Classify the supplied instances and decide whether deployment is confirmed.
 * This is a pure function: it calculates a result without making network calls,
 * sending notifications, modifying the input, or scheduling another check.
 * A NestJS service could call it after collecting reports from instances.
 *
 * The caller must supply the full set of expected instances. This function
 * cannot discover a server that was left out of the list.
 */
export function classifyDeployment(
  approvedRelease        ,
  instances                  ,
  nowMs        ,
  maxAgeMs        ,
)   
                                                                           
                                                              
                     
                         
  {
  // map creates a new array with one result for every supplied instance.
  // The parentheses around ({ ... }) let the arrow function return an object.
  // Reusing classifyInstance keeps the freshness rules in one place.
  
  let mismatchCount        ;
  const results = instances.map((instance) => ({
    instanceId: instance.instanceId,
    status: classifyInstance(approvedRelease, instance.report, nowMs, maxAgeMs),
  }));
  

  return {
    instances: results,
    // && means BOTH conditions must hold: at least one instance exists,
    // and every result is Match. Any Mismatch or Unknown prevents confirmation.
    // JavaScript's every() returns true for an empty array, so the length guard
    // is essential: no instances means no evidence of a successful deployment.
    confirmed: results.length > 0 && results.every((instance) => instance.status === 'Match'),
    totalInstances: results.length
  };
}

/**
 * Compare one instance with the team's approved release.
 * nowMs is the current time; maxAgeMs is how long a report remains fresh.
 * Passing time as an argument lets tests use fixed values instead of waiting.
 * Both time inputs and checkedAtMs use milliseconds.
 */
export function classifyInstance(
  approvedRelease        ,
  report                      ,
  nowMs        ,
  maxAgeMs        ,
)                 {
  // Return early when evidence or configuration cannot support a decision.
  // trim() detects empty or whitespace-only identifiers; it does not change
  // the release strings used in the final comparison.
  // Number.isFinite rejects NaN and Infinity. A negative age limit is invalid.
  // || means OR. It also short-circuits: if report is null, !report is true,
  // so JavaScript never tries to read report.release or report.checkedAtMs.
  // TypeScript types help callers during development; these checks cover the
  // missing/invalid values listed here, not arbitrary unvalidated network JSON.
  // Match the dashboard contract: whole, nonnegative Unix milliseconds within
  // the JavaScript Date range. Invalid source time can never prove a match.
  if (
    !approvedRelease.trim() ||
    !report ||
    !report.release.trim() ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs < 0 ||
    !Number.isSafeInteger(report.checkedAtMs) ||
    report.checkedAtMs < 0 ||
    report.checkedAtMs > 8640000000000000
  ) {
    return 'Unknown';
  }

  // Example: now 1000 minus check time 950 gives a report age of 50 ms.
  const ageMs = nowMs - report.checkedAtMs;
  // A negative age means the check is dated in the future: treat it as Unknown.
  // >= makes a report stale exactly at the limit, as well as beyond it.
  // With maxAgeMs = 0, no report qualifies as fresh.
  if (ageMs < 0 || ageMs >= maxAgeMs) {
    return 'Unknown';
  }

  // Only fresh evidence reaches this comparison. === requires an exact match:
  // a newer release, or '1.4.0' instead of 'v1.4.0', is also a Mismatch.
  // The ternary operator means: condition ? resultIfTrue : resultIfFalse.
  return report.release === approvedRelease ? 'Match' : 'Mismatch';
}
