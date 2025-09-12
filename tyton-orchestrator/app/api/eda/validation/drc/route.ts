import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { runDrc, generateDrcReport, DEFAULT_DRC_RULES } from '@/server/eda/validation/drc';
import { EdaSpecV1Z } from '@/server/eda/specs/edaSpecV10';

const DrcRequestZ = z.object({
  eda: EdaSpecV1Z,
  rules: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.enum(['spacing', 'width', 'via', 'drill', 'copper', 'mask', 'assembly']),
    severity: z.enum(['error', 'warning', 'info']),
    value: z.number().optional(),
    unit: z.enum(['mm', 'mil']).optional(),
    enabled: z.boolean()
  })).optional(),
  options: z.object({
    stopOnError: z.boolean().default(false),
    fabricationClass: z.enum(['prototype', 'production', 'high_density']).optional(),
    reportFormat: z.enum(['json', 'text']).default('json')
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = DrcRequestZ.parse(body);
    const { eda, rules, options } = parsed;

    // Run DRC with provided or default rules
    const drcResult = runDrc(eda, rules || DEFAULT_DRC_RULES, options);

    // Generate report if text format requested
    let report = undefined;
    if (options?.reportFormat === 'text') {
      report = generateDrcReport(drcResult);
    }

    const response = {
      passed: drcResult.passed,
      violations: drcResult.violations,
      stats: drcResult.stats,
      executionTime: drcResult.executionTime,
      fabricationClass: options?.fabricationClass,
      ...(report && { report })
    };

    // Return appropriate status code
    const statusCode = drcResult.passed ? 200 : 400;

    return NextResponse.json(response, { 
      status: statusCode,
      headers: {
        'X-DRC-Passed': drcResult.passed.toString(),
        'X-DRC-Errors': drcResult.stats.errors.toString(),
        'X-DRC-Warnings': drcResult.stats.warnings.toString(),
        'X-DRC-Execution-Time': drcResult.executionTime.toString(),
        'X-DRC-Fabrication-Class': options?.fabricationClass || 'standard'
      }
    });

  } catch (error) {
    console.error('DRC validation error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to run DRC', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/eda/validation/drc',
    method: 'POST',
    description: 'Run Design Rules Check on EDA specification',
    parameters: {
      eda: 'EdaSpecV1 - The EDA specification to validate',
      rules: 'array - Custom DRC rules (optional, uses defaults if not provided)',
      options: {
        stopOnError: 'boolean - Stop validation on first error (default: false)',
        fabricationClass: 'string - Fab class: prototype, production, high_density',
        reportFormat: 'string - Output format: json or text (default: json)'
      }
    },
    default_rules: DEFAULT_DRC_RULES.map(rule => ({
      id: rule.id,
      name: rule.name,
      category: rule.category,
      severity: rule.severity,
      value: rule.value,
      unit: rule.unit,
      enabled: rule.enabled
    })),
    rule_categories: {
      spacing: 'Minimum spacing between objects',
      width: 'Minimum trace and feature widths',
      via: 'Via size and spacing requirements',
      drill: 'Drill hole size constraints',
      copper: 'Copper feature requirements',
      mask: 'Solder mask constraints',
      assembly: 'Component assembly rules'
    },
    fabrication_classes: {
      prototype: 'Relaxed rules for prototyping (80% of standard)',
      production: 'Standard production rules',
      high_density: 'Tight rules for HDI boards (150% of standard)'
    },
    response: {
      passed: 'boolean - Whether all rules passed',
      violations: 'array - List of rule violations found',
      stats: {
        errors: 'number - Count of error violations',
        warnings: 'number - Count of warning violations', 
        info: 'number - Count of info violations',
        rulesChecked: 'number - Number of rules evaluated',
        objectsChecked: 'number - Number of objects analyzed',
        layersChecked: 'number - Number of layers analyzed'
      },
      executionTime: 'number - Validation time in milliseconds'
    }
  });
}