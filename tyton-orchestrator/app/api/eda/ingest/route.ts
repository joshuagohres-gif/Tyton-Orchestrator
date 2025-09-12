import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { ingestSchematicFromText, getIngestStats } from '@/server/eda/ingest/fromText';

const IngestRequestZ = z.object({
  text: z.string().min(1, 'Text input is required'),
  options: z.object({
    allowTableMerge: z.boolean().default(true),
    requireValidation: z.boolean().default(true),
    preferVersion: z.enum(['1.0', '1.1', '1.2']).optional()
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = IngestRequestZ.parse(body);
    const { text, options } = parsed;

    // Ingest schematic from text
    const result = ingestSchematicFromText(text);
    
    // Get ingestion statistics
    const stats = getIngestStats(result);

    // Return error if ingestion failed and validation is required
    if (options?.requireValidation && (result.source === 'failed' || result.errors.length > 0)) {
      return NextResponse.json({
        error: 'Ingestion failed or produced errors',
        result,
        stats
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      spec: result.spec,
      source: result.source,
      warnings: result.warnings,
      errors: result.errors,
      stats,
      rawJson: result.rawJson
    });

  } catch (error) {
    console.error('Ingestion error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to ingest specification', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/eda/ingest',
    method: 'POST',
    description: 'Ingest and parse schematic specification from text input',
    parameters: {
      text: 'string - Input text containing schematic description or JSON',
      options: {
        allowTableMerge: 'boolean - Allow pin table merging (default: true)',
        requireValidation: 'boolean - Require valid spec output (default: true)', 
        preferVersion: 'string - Preferred spec version: 1.0, 1.1, 1.2'
      }
    },
    input_formats: {
      json: 'Direct JSON schematic specification',
      mixed_text: 'Text with embedded JSON code blocks',
      pin_tables: 'Component lists with pin connection tables',
      natural_language: 'Circuit descriptions in plain English'
    },
    response: {
      success: 'boolean - Whether ingestion succeeded',
      spec: 'object - Parsed EDA specification (if successful)',
      source: 'string - Source format: json, table_merge, failed',
      warnings: 'array - Non-fatal issues found',
      errors: 'array - Critical errors encountered',
      stats: {
        confidence: 'number - Confidence in parsing (0-1)',
        completeness: 'number - Specification completeness (0-1)',
        issues: 'number - Total issues found'
      }
    }
  });
}