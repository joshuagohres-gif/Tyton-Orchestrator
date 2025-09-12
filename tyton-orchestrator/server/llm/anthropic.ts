import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import pino from 'pino';
import { LLMResponse, CompletionOptions } from './openai';

const logger = pino().child({ service: 'anthropic-client' });

interface CompleteJSONArgs {
  system: string;
  user: string;
  schema?: z.ZodTypeAny;
  maxTokens?: number;
  model?: string;
}

class AnthropicService {
  private client: Anthropic;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }
    
    this.client = new Anthropic({ apiKey });
    logger.info('Anthropic service initialized');
  }

  async complete(options: CompletionOptions): Promise<LLMResponse> {
    const {
      prompt,
      model = process.env.MODEL_ANTHROPIC || 'claude-3-5-sonnet-20241022',
      maxTokens = parseInt(process.env.ORCHESTRATION_MAX_TOKENS || '4000'),
      temperature = 0.7
    } = options;

    try {
      const response = await this.client.messages.create({
        model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      
      // Parse JSON if present in response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      let json = undefined;
      
      if (jsonMatch) {
        try {
          json = JSON.parse(jsonMatch[1]);
        } catch (e) {
          logger.error({ error: e.message }, 'Failed to parse JSON from response');
        }
      }

      return {
        text: content,
        json
      };
    } catch (error: any) {
      logger.error({ error: error.message, errorCode: error.status }, 'Anthropic API error');
      throw new Error(`LLM completion failed: ${error.message}`);
    }
  }

  async completeJSON({
    system,
    user,
    schema,
    maxTokens = 2000,
    model = process.env.MODEL_ANTHROPIC || 'claude-3-5-sonnet-20241022'
  }: CompleteJSONArgs): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Create messages with system prompt
      const messages: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: user + '\n\nIMPORTANT: Respond with valid JSON only. No markdown, explanations, or additional text.'
        }
      ];
      
      logger.debug({
        model,
        maxTokens,
        messagesLength: messages.length,
        hasSchema: !!schema
      }, 'Making Anthropic JSON API call');
      
      const response = await this.client.messages.create({
        model,
        system: system + '\n\nIMPORTANT: Respond with valid JSON only. No markdown, explanations, or additional text.',
        messages,
        max_tokens: maxTokens,
        temperature: 0.1 // Low temperature for consistent JSON output
      });
      
      const duration = Date.now() - startTime;
      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
      
      if (!content) {
        throw new Error('No content received from Anthropic API');
      }
      
      logger.info({
        model,
        duration,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }, 'Anthropic JSON API call completed successfully');
      
      // Validate JSON format
      try {
        JSON.parse(content);
      } catch (parseError) {
        logger.error({ content, parseError: parseError.message }, 'Anthropic returned invalid JSON');
        throw new Error(`Anthropic returned invalid JSON: ${parseError.message}`);
      }
      
      return content;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({
        model,
        duration,
        error: error.message,
        errorCode: error.status,
        errorType: error.type
      }, 'Anthropic JSON API call failed');
      
      // Re-throw with additional context
      const enhancedError = new Error(`Anthropic API call failed: ${error.message}`);
      (enhancedError as any).status = error.status;
      (enhancedError as any).type = error.type;
      throw enhancedError;
    }
  }
}

// Singleton instance
let anthropicService: AnthropicService | null = null;

export function getAnthropicService(): AnthropicService | null {
  if (!anthropicService) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return null; // Anthropic is optional
    }
    anthropicService = new AnthropicService(apiKey);
  }
  return anthropicService;
}

export default AnthropicService;