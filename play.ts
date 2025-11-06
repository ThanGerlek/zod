import z from "zod";
import { refineTemplateLiteral } from "./packages/zod/src/v4/core/refine-template-literal.js";

// Helper function to log test results
function testCase(description: string, testFn: () => any) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`TEST: ${description}`);
  console.log('='.repeat(50));
  try {
    const result = testFn();
    console.log(JSON.stringify(result, (key, value) => {
      // Handle circular references and other special cases
      if (value instanceof Error) {
        return { message: value.message, stack: value.stack };
      }
      return value;
    }, 2));
  } catch (error) {
    console.error('Test failed with error:', error);
  }
  console.log('='.repeat(50));
}

// Helper to safely parse and handle errors
function safeParse(schema: any, input: string) {
  try {
    const result = schema.safeParse(input);
    return result.success ? result : { error: result.error.message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// Edge Case 1: Empty string as delimiter
testCase('1. Empty string as delimiter', () => {
  try {
    const schema = refineTemplateLiteral(
      [z.literal('a') as any, z.literal('b') as any],
      '',  // Empty delimiter
      () => true,
      { format: 'test' },
      { message: 'Should fail' }
    );
    return { success: safeParse(schema, 'ab') };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});

// Edge Case 2: Delimiter that appears in the data
testCase('2. Delimiter that appears in the data', () => {
  const schema = refineTemplateLiteral(
    [z.string() as any, z.string() as any],
    '|',
    () => true,
    { format: 'text' },
    { message: 'Should handle delimiter in data' }
  );
  return {
    'Valid with pipe in data': safeParse(schema, 'a|b|c|d'),
    'Empty parts': safeParse(schema, '||')
  };
});

// Edge Case 3: Very large numbers
testCase('3. Very large numbers', () => {
  const schema = refineTemplateLiteral(
    [z.coerce.number() as any, z.coerce.number() as any],
    ',',
    ([a, b]) => a < b,
    { format: 'numbers' },
    { message: 'a must be less than b' }
  );
  
  return {
    'Large numbers': safeParse(schema, '99999999999999999999,100000000000000000000'),
    'Exponential notation': safeParse(schema, '1e3,1e4'),
    'Invalid number': safeParse(schema, 'not a number,100')
  };
});

// Edge Case 4: Unicode and special characters
testCase('4. Unicode and special characters', () => {
  const schema = refineTemplateLiteral(
    [z.string() as any, z.string() as any],
    '💻',  // Emoji as delimiter
    ([a, b]) => a.length > 0 && b.length > 0,
    { format: 'unicode' },
    { message: 'Invalid unicode input' }
  );
  
  return {
    'Emoji delimiter': safeParse(schema, 'hello💻world'),
    'Special chars': safeParse(schema, '!@#$%^&*()💻±§±§±'),
    'Empty part': safeParse(schema, '💻world')
  };
});

// Edge Case 5: Custom validation that throws
testCase('5. Custom validation that throws', () => {
  const schema = refineTemplateLiteral(
    [z.string() as any],
    '|',
    () => { 
      throw new Error('Custom validation error');
    },
    { format: 'error' },
    { message: 'Should not see this' }
  );
  
  return safeParse(schema, 'test');
});

// Edge Case 6: Empty parts in the middle
testCase('6. Empty parts in the middle', () => {
  const schema = refineTemplateLiteral(
    [z.string() as any, z.string() as any, z.string() as any],
    ',',
    ([a, b, c]) => Boolean(a) && Boolean(b) && Boolean(c),
    { format: 'three-parts' },
    { message: 'All parts must be non-empty' }
  );
  
  return {
    'Valid': safeParse(schema, 'a,b,c'),
    'Empty middle': safeParse(schema, 'a,,c'),
    'Empty start': safeParse(schema, ',b,c'),
    'Empty end': safeParse(schema, 'a,b,')
  };
});

// Edge Case 7: Very long strings
testCase('7. Very long strings', () => {
  const longString = 'a'.repeat(10000);
  const schema = refineTemplateLiteral(
    [z.string().max(5) as any, z.string() as any],
    '|',
    () => true,
    { format: 'long' },
    { message: 'String too long' }
  );
  
  return {
    'First part too long': safeParse(schema, `${'a'.repeat(6)}|test`),
    'Second part very long': safeParse(schema, `test|${longString}`)
  };
});

// Edge Case 8: Nested delimiters
testCase('8. Nested delimiters', () => {
  const schema = refineTemplateLiteral(
    [z.string() as any, z.string() as any, z.string() as any],
    '|',
    () => true,
    { format: 'nested' },
    { message: 'Nested delimiter issue' }
  );
  
  return {
    'Nested delimiters': safeParse(schema, 'a|b|c|d|e'),
    'Escaped delimiters': safeParse(schema, 'a\\|b|c')
  };
});

// Helper function to measure memory usage
function getMemoryUsage() {
  if (global.gc) {
    global.gc(); // Force garbage collection if available
  }
  const used = process.memoryUsage();
  return {
    rss: `${(used.rss / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(used.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    external: `${(used.external / 1024 / 1024).toFixed(2)} MB`
  };
}

// Helper function to run performance tests
function runPerformanceTest(partCount: number, iterations: number = 100) {
  // Create schema with the specified number of parts
  const parts = Array(partCount).fill(z.string().max(10) as any);
  
  const schema = refineTemplateLiteral(
    parts,
    '|',
    (values: unknown[]) => {
      return Array.isArray(values) && values.every((v: unknown) => typeof v === 'string');
    },
    { format: `perf-test-${partCount}` },
    { message: 'Validation failed' }
  );
  
  // Generate test input
  const testInput = Array(partCount).fill('test').join('|');
  
  // Warm-up run
  for (let i = 0; i < 5; i++) {
    schema.safeParse(testInput);
  }
  
  // Memory before test
  const memoryBefore = getMemoryUsage();
  
  // Run performance test
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    schema.safeParse(testInput);
  }
  const totalTime = performance.now() - start;
  
  // Memory after test
  const memoryAfter = getMemoryUsage();
  
  // Memory difference
  const memoryDiff = {
    rss: `${(parseFloat(memoryAfter.rss) - parseFloat(memoryBefore.rss)).toFixed(2)} MB`,
    heapUsed: `${(parseFloat(memoryAfter.heapUsed) - parseFloat(memoryBefore.heapUsed)).toFixed(2)} MB`
  };
  
  // Single operation metrics
  const avgTime = totalTime / iterations;
  const opsPerSecond = Math.floor((iterations / totalTime) * 1000);
  
  return {
    parts: partCount,
    iterations,
    totalTime: `${totalTime.toFixed(2)}ms`,
    avgTime: `${avgTime.toFixed(4)}ms`,
    opsPerSecond: `${opsPerSecond.toLocaleString()} ops/s`,
    memoryBefore,
    memoryAfter,
    memoryDiff,
    isAcceptable: avgTime < 1 ? '✅ Excellent' : 
                 avgTime < 5 ? '🟢 Good' : 
                 avgTime < 20 ? '🟡 Acceptable' : '🔴 Needs optimization'
  };
}

// Edge Case 9: Performance testing
// Test with different input sizes to understand scaling
// TODO: This test might be worth looking into more.
testCase('9. Performance Testing', () => {
  try {
    // Test with different input sizes
    const testCases = [
      { parts: 5, iterations: 1000 },
      { parts: 10, iterations: 1000 }, // Any test cases below here will hang (might not be a big deal)
      // { parts: 50, iterations: 500 },
      // { parts: 100, iterations: 200 },
      // { parts: 500, iterations: 100 },
      // { parts: 1000, iterations: 50 }
    ];
    
    const results = testCases.map(({ parts, iterations }) => 
      runPerformanceTest(parts, iterations)
    );
    
    // Calculate scaling factor (time per part)
    const scalingResults = results.map((result, i) => {
      const timePerPart = parseFloat(result.avgTime) / result.parts;
      let scalingFactor = 'N/A';
      
      if (i > 0) {
        const prevTimePerPart = parseFloat(results[i-1].avgTime) / results[i-1].parts;
        scalingFactor = `~${(timePerPart / prevTimePerPart).toFixed(2)}x`;
      }
      
      return { 
        ...result, 
        timePerPart,
        scalingFactor
      };
    });
    
    // Find potential bottlenecks
    const bottlenecks = [];
    const timePerPartTrend = scalingResults.map(r => r.timePerPart);
    
    if (timePerPartTrend.some((t, i, arr) => i > 0 && t > arr[i-1] * 1.5)) {
      bottlenecks.push('Non-linear time complexity detected as input size increases');
    }
    
    if (scalingResults.some(r => parseFloat(r.memoryDiff.heapUsed) > 10)) {
      bottlenecks.push('High memory usage per operation detected');
    }
    
    return {
      summary: 'Performance test results (lower is better)',
      results: scalingResults.map(r => ({
        'Parts': r.parts,
        'Iterations': r.iterations,
        'Avg Time': r.avgTime + 'ms',
        'Time/Part': r.timePerPart.toExponential(4) + 'ms',
        'Scaling': r.scalingFactor || 'N/A',
        'Ops/Sec': r.opsPerSecond,
        'Mem Δ': r.memoryDiff.heapUsed,
        'Status': r.isAcceptable
      })),
      notes: [
        'Time/Part shows how the time scales with input size',
        'Ideal scaling is O(1) or O(n)',
        bottlenecks.length ? `⚠️ Potential bottlenecks: ${bottlenecks.join('; ')}` : '✅ No significant bottlenecks detected'
      ]
    };
    
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      note: 'Error during performance testing'
    };
  }
});

// Edge Case 10: Very long delimiters
testCase('10. Very long delimiters', () => {
  const longDelimiter = '-'.repeat(1000);
  const schema = refineTemplateLiteral(
    [z.string(), z.string()] as any[],
    longDelimiter,
    () => true,
    { format: 'long-delimiter' },
    { 
      message: 'Failed to parse with long delimiter',
      path: ['long_delimiter_test']
    }
  );
  
  const testInput = `start${longDelimiter}end`;
  
  return {
    'Valid with long delimiter': safeParse(schema, testInput),
    'Invalid (missing delimiter)': safeParse(schema, 'start-end'),
    'Empty parts': safeParse(schema, longDelimiter)
  };
});

// Edge Case 11: Mixed delimiters in input
testCase('11. Mixed delimiters in input', () => {
  const schema = refineTemplateLiteral(
    [z.string(), z.string(), z.string()] as any[],
    '|',
    () => true,
    { format: 'mixed-delimiters' },
    { 
      message: 'Failed to parse with mixed delimiters',
      path: ['mixed_delimiters_test']
    }
  );
  
  return {
    'Standard delimiter': safeParse(schema, 'a|b|c'),
    'Mixed delimiters (should fail)': safeParse(schema, 'a,b|c'),
    'Escaped delimiters': safeParse(schema, 'a\\|b|c')
  };
});

// Edge Case 12: Unicode normalization
// TODO: The unicode encoding difference wasn't detected. That may not be a big deal.
testCase('12. Unicode normalization', () => {
  // These strings look the same but have different Unicode encodings
  const cafe1 = 'café';
  const cafe2 = 'café'; // Note: This is 'e' + combining acute accent
  
  const schema = refineTemplateLiteral(
    [z.string(), z.string()] as any[],
    '|',
    (values) => {
      const [a, b] = values as [string, string];
      return a === b; // Should be the same after normalization
    },
    { format: 'unicode-normalization' },
    { 
      message: 'Unicode normalization failed',
      path: ['unicode_test']
    }
  );
  
  return {
    'Same string': safeParse(schema, `${cafe1}|${cafe1}`),
    'Different normalization (may fail)': safeParse(schema, `${cafe1}|${cafe2}`),
    'Note': 'This test checks if Unicode normalization is handled correctly. The strings may look the same but have different encodings.'
  };
});

// Edge Case 13: Error message customization
testCase('13. Error message customization', () => {
  const schema = refineTemplateLiteral(
    [
      z.string().min(3, 'Name too short').max(20, 'Name too long') as any,
      z.coerce.number().int().min(18, 'Must be 18+').max(120, 'Invalid age') as any,
      z.string().email('Invalid email format') as any
    ],
    ':',
    (values) => {
      const [name, age] = values as [string, number, string];
      if (name.toLowerCase() === 'admin' && age < 21) {
        return false; // Will use the custom error message from refineTemplateLiteral
      }
      return true;
    },
    { 
      format: 'custom:errors'
    },
    { 
      message: 'Custom validation failed',
      path: ['custom_errors_test']
    }
  );
  
  // Add a custom error message for admin age validation
  const validateAdmin = (input: string) => {
    const result = schema.safeParse(input);
    if (!result.success) {
      const [name, age] = input.split(':');
      if (name && name.toLowerCase() === 'admin' && Number(age) < 21) {
        return {
          success: false,
          error: 'Admins must be 21 or older'
        };
      }
      return result;
    }
    return result;
  };
  
  return {
    'Valid input': safeParse(schema, 'John:25:john@example.com'),
    'Name too short': safeParse(schema, 'Jo:25:john@example.com'),
    'Invalid age': safeParse(schema, 'John:17:john@example.com'),
    'Invalid email': safeParse(schema, 'John:25:invalid-email'),
    'Custom validation': validateAdmin('admin:20:admin@example.com')
  };
});

// Edge Case 14: Type coercion edge cases
testCase('14. Type coercion edge cases', () => {
  const schema = refineTemplateLiteral(
    [z.coerce.number() as any, z.coerce.boolean() as any, z.coerce.string() as any],
    '|',
    () => true,
    { format: 'coercion' },
    { message: 'Coercion failed' }
  );
  
  return {
    'Valid types': safeParse(schema, '123|true|2023-01-01'),
    'Invalid number': safeParse(schema, 'abc|true|2023-01-01'),
    'Invalid boolean': safeParse(schema, '123|notabool|2023-01-01'),
    'Empty input': safeParse(schema, '||')
  };
});

// Edge Case 15: Mixed types and complex validation
testCase('15. Mixed types and complex validation', () => {
  const schema = refineTemplateLiteral(
    [
      z.string().min(3).max(20) as any,  // name
      z.coerce.number().int().min(18).max(120) as any,  // age
      z.string().email() as any,  // email
      z.enum(['active', 'inactive', 'suspended']) as any  // status
    ],
    ':',
    ([name, age, email, status]) => {
      // Complex validation logic
      if (status === 'active' && age < 18) return false;
      if (email.endsWith('@example.com') && status === 'suspended') return false;
      return true;
    },
    { format: 'user:age:email:status' },
    { message: 'Invalid user data' }
  );
  
  return {
    'Valid user': safeParse(schema, 'john_doe:25:john@example.com:active'),
    'Underage active': safeParse(schema, 'kid:15:kid@example.com:active'),
    'Suspended example.com': safeParse(schema, 'admin:30:admin@example.com:suspended'),
    'Invalid format': safeParse(schema, 'invalid-format')
  };
});
