import OpenAI from 'openai';
import { z } from 'zod';
import pino from 'pino';

const logger = pino().child({ service: 'openai-client' });

export interface LLMResponse {
  text: string;
  json?: any;
}

export interface CompletionOptions {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface CompleteJSONArgs {
  system: string;
  user: string;
  schema?: z.ZodTypeAny;
  maxTokens?: number;
  model?: string;
}

class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    this.client = new OpenAI({ apiKey });
    logger.info('OpenAI service initialized');
  }

  async complete(options: CompletionOptions): Promise<LLMResponse> {
    const {
      prompt,
      model = process.env.MODEL_OPENAI || 'gpt-4o-mini',
      maxTokens = parseInt(process.env.ORCHESTRATION_MAX_TOKENS || '4000'),
      temperature = 0.7
    } = options;

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful hardware engineering assistant. Always provide clear, structured responses.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature,
      });

      const content = response.choices[0]?.message?.content || '';
      
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
      logger.error({ error: error.message, errorCode: error.code }, 'OpenAI API error');
      throw new Error(`LLM completion failed: ${error.message}`);
    }
  }

  async completeJSON({
    system,
    user,
    schema,
    maxTokens = 2000,
    model = "gpt-4o-mini"
  }: CompleteJSONArgs): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Create messages
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: system + "\n\nIMPORTANT: Respond with valid JSON only. No markdown, explanations, or additional text."
        },
        {
          role: "user", 
          content: user
        }
      ];
      
      // Prepare request options
      const requestOptions: OpenAI.Chat.ChatCompletionCreateParams = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.1, // Low temperature for consistent JSON output
        response_format: { type: "json_object" }
      };
      
      logger.debug({
        model,
        maxTokens,
        messagesLength: messages.length,
        hasSchema: !!schema
      }, 'Making OpenAI JSON API call');
      
      const response = await this.client.chat.completions.create(requestOptions);
      
      const duration = Date.now() - startTime;
      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content received from OpenAI API');
      }
      
      logger.info({
        model,
        duration,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens
      }, 'OpenAI JSON API call completed successfully');
      
      // Validate JSON format
      try {
        JSON.parse(content);
      } catch (parseError) {
        logger.error({ content, parseError: parseError.message }, 'OpenAI returned invalid JSON');
        throw new Error(`OpenAI returned invalid JSON: ${parseError.message}`);
      }
      
      return content;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({
        model,
        duration,
        error: error.message,
        errorCode: error.code,
        errorType: error.type
      }, 'OpenAI JSON API call failed');
      
      // Re-throw with additional context
      const enhancedError = new Error(`OpenAI API call failed: ${error.message}`);
      (enhancedError as any).status = error.status || error.code;
      (enhancedError as any).type = error.type;
      throw enhancedError;
    }
  }

  // Parse markdown sections from response
  parseMarkdownSections(text: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const sectionRegex = /^#{1,3}\s+(.+)$/gm;
    const matches = Array.from(text.matchAll(sectionRegex));
    
    for (let i = 0; i < matches.length; i++) {
      const sectionTitle = matches[i][1];
      const startIndex = matches[i].index! + matches[i][0].length;
      const endIndex = matches[i + 1]?.index || text.length;
      sections[sectionTitle] = text.substring(startIndex, endIndex).trim();
    }
    
    return sections;
  }

  // Extract specific data structures from response
  extractStructuredData(text: string): {
    tables?: any[];
    lists?: string[][];
    codeBlocks?: { language: string; code: string }[];
  } {
    const result: any = {};
    
    // Extract tables (simple markdown tables)
    const tableRegex = /\|(.+)\|\n\|[-\s|]+\|\n((?:\|.+\|\n?)+)/g;
    const tables = Array.from(text.matchAll(tableRegex));
    if (tables.length > 0) {
      result.tables = tables.map(match => {
        const headers = match[1].split('|').map(h => h.trim()).filter(h => h);
        const rows = match[2].trim().split('\n').map(row => 
          row.split('|').map(cell => cell.trim()).filter(cell => cell)
        );
        return { headers, rows };
      });
    }
    
    // Extract lists
    const listRegex = /^[\s]*[-*]\s+(.+)$/gm;
    const listItems = Array.from(text.matchAll(listRegex));
    if (listItems.length > 0) {
      result.lists = [listItems.map(match => match[1])];
    }
    
    // Extract code blocks
    const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks = Array.from(text.matchAll(codeRegex));
    if (codeBlocks.length > 0) {
      result.codeBlocks = codeBlocks.map(match => ({
        language: match[1] || 'text',
        code: match[2].trim()
      }));
    }
    
    return result;
  }
}

// Singleton instance
let openAIService: OpenAIService | null = null;

export function getOpenAIService(): OpenAIService {
  if (!openAIService) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openAIService = new OpenAIService(apiKey);
  }
  return openAIService;
}

export function getOpenAIClient(): OpenAIService {
  return getOpenAIService();
}

export default OpenAIService;