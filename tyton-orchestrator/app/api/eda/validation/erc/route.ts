import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { runErc, generateErcReport, DEFAULT_ERC_RULES } from '@/server/eda/validation/erc';
import { EdaSpecV1Z } from '@/server/eda/specs/edaSpecV10';

const ErcRequestZ = z.object({
  eda: EdaSpecV1Z,
  rules: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.enum(['power', 'signal', 'connectivity', 'component']),
    severity: z.enum(['error', 'warning', 'info']),
    enabled: z.boolean()
  })).optional(),
  options: z.object({
    stopOnError: z.boolean().default(false),
    reportFormat: z.enum(['json', 'text']).default('json')
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ErcRequestZ.parse(body);
    const { eda, rules, options } = parsed;

    // Run ERC with provided or default rules
    const ercResult = runErc(eda, rules || DEFAULT_ERC_RULES, options);

    // Generate report if text format requested
    let report = undefined;
    if (options?.reportFormat === 'text') {
      report = generateErcReport(ercResult);
    }

    const response = {
      passed: ercResult.passed,
      violations: ercResult.violations,
      stats: ercResult.stats,
      executionTime: ercResult.executionTime,
      ...(report && { report })
    };

    // Return appropriate status code
    const statusCode = ercResult.passed ? 200 : 400;

    return NextResponse.json(response, { 
      status: statusCode,
      headers: {
        'X-ERC-Passed': ercResult.passed.toString(),
        'X-ERC-Errors': ercResult.stats.errors.toString(),
        'X-ERC-Warnings': ercResult.stats.warnings.toString(),
        'X-ERC-Execution-Time': ercResult.executionTime.toString()
      }
    });

  } catch (error) {
    console.error('ERC validation error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to run ERC', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/eda/validation/erc',
    method: 'POST', 
    description: 'Run Electrical Rules Check on EDA specification',
    parameters: {
      eda: 'EdaSpecV1 - The EDA specification to validate',
      rules: 'array - Custom ERC rules (optional, uses defaults if not provided)',
      options: {
        stopOnError: 'boolean - Stop validation on first error (default: false)',
        reportFormat: 'string - Output format: json or text (default: json)'
      }
    },
    default_rules: DEFAULT_ERC_RULES.map(rule => ({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      severity: rule.severity,
      enabled: rule.enabled
    })),
    rule_categories: {
      power: 'Power supply and distribution validation',
      signal: 'Signal integrity and connectivity checks',
      connectivity: 'Net and pin connection validation',
      component: 'Component-specific rule checks'
    },
    response: {
      passed: 'boolean - Whether all rules passed',
      violations: 'array - List of rule violations found',
      stats: {
        errors: 'number - Count of error violations',
        warnings: 'number - Count of warning violations',
        info: 'number - Count of info violations',
        rulesChecked: 'number - Number of rules evaluated',
        componentsChecked: 'number - Number of components analyzed',
        netsChecked: 'number - Number of nets analyzed'
      },
      executionTime: 'number - Validation time in milliseconds'
    }
  });
}