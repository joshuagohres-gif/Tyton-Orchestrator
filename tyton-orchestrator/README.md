# 🌌 Tyton Orchestrator

> **Hardware project design & management with AI assistance**

A sophisticated local-first web application that uses AI to help design, analyze, and manage hardware projects. The system features a beautiful starry night theme and ingests natural language descriptions of hardware projects, using specialized LLM prompts to generate comprehensive project plans including component selection, wiring diagrams, firmware code, BOMs, and sourcing information.

## Features

- **AI-Powered Analysis**: Automated project analysis using OpenAI GPT-4 (with optional Anthropic Claude support)
- **Visual Project Canvas**: Interactive node-based visualization using React Flow
- **Component Management**: Automatic component selection with trade-off analysis
- **Wiring & Pin Mapping**: Automated wiring diagram generation with voltage level checking
- **Firmware Generation**: Automatic firmware code generation for selected microcontrollers
- **BOM Generation**: Automated Bill of Materials with cost estimation
- **Supply Chain Integration**: Sourcing information with supplier links and availability
- **Safety Gate System**: Professional oversight recommendations for hazardous projects
- **Audit Logging**: Complete project history and change tracking

### 🎨 **Advanced Starry Night Theme System**
- **Gold & Black Palette**: Sophisticated #D4AF37 gold accents on deep black backgrounds  
- **Dynamic Starfield**: CSS-based animated starfield background with customizable intensity
- **Theme Switching**: Toggle between "starry" and "high-contrast" accessibility modes
- **Full Accessibility**: WCAG 2.1 AA compliant with reduced motion and high contrast support
- **Performance Optimized**: GPU-friendly animations with minimal overhead
- **Comprehensive Testing**: 55+ tests covering all theme functionality

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, TailwindCSS
- **Theme System**: CSS custom properties, class-variance-authority, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: SQLite (easily swappable to PostgreSQL)
- **AI/LLM**: OpenAI API (GPT-4), optional Anthropic Claude
- **Visualization**: React Flow for node-based canvas, custom starfield animations
- **Code Editor**: Monaco Editor for firmware editing
- **Testing**: Vitest, Playwright, Testing Library (55+ theme tests)
- **Validation**: Zod for request/response validation
- **Icons**: Lucide React

## Prerequisites

- Node.js 20+ 
- npm or pnpm
- OpenAI API key (required)
- Anthropic API key (optional)

## Installation

1. Navigate to the project directory:
```bash
cd tyton-api/tyton-orchestrator
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:
```env
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here # optional
```

4. Initialize the database:
```bash
npx prisma migrate dev
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Creating a Project

1. Click "New Project" on the homepage
2. Enter a project title and detailed description
3. Click "Create Project" to save

### Running AI Analysis

1. Open a project from the homepage
2. In the Copilot panel (left side), you'll see the project description
3. Click "Run Meta Analysis" to run the complete orchestration pipeline
4. Or run individual stages (Components, Wiring, Mechanical, Firmware, BOM, Sourcing)

### Understanding the Canvas

The canvas displays your project as interconnected nodes:
- **Blue nodes**: Electronics components with Details/Firmware/Testing tabs
- **Orange nodes**: Mechanical parts with dimensions and materials
- **Green node**: Bill of Materials with cost breakdown
- **Purple node**: Sourcing information with supplier details
- **Green edges**: Wiring connections between components
- **Gray edges**: Dependencies between modules

### Safety Gates

If the AI detects potentially hazardous aspects of your project (high voltage, lasers, etc.), it will activate a "Safety Gate" and recommend professional oversight. The project will be marked with a warning indicator.

## API Endpoints

### Projects
- `POST /api/projects` - Create a new project
- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Orchestration
- `POST /api/projects/:id/orchestrate` - Run orchestration pipeline
  - Body: `{ mode: "meta" | "stage", stage?: "components" | "wiring" | ... }`

### Canvas & Modules
- `POST /api/projects/:id/canvas` - Save canvas layout
- `GET /api/projects/:id/bom` - Get BOM with totals
- `GET /api/projects/:id/suppliers` - Get sourcing information

## Project Structure

```
tyton-orchestrator/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   └── projects/[id]/     # Project detail page
├── components/            # React components
│   ├── CopilotPanel.tsx  # AI assistant panel
│   ├── ProjectCanvas.tsx # React Flow canvas
│   └── nodes/            # Custom node components
├── lib/                   # Utilities and libraries
│   └── prompts/          # LLM prompt templates
├── server/               # Server-side code
│   ├── llm/             # LLM service implementations
│   └── orchestrator/    # Pipeline orchestration
├── prisma/              # Database schema and migrations
└── public/              # Static assets
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQLite database path | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `MODEL_OPENAI` | OpenAI model (default: gpt-4o) | No |
| `ANTHROPIC_API_KEY` | Anthropic API key | No |
| `MODEL_ANTHROPIC` | Anthropic model (default: claude-3-5-sonnet) | No |
| `ORCHESTRATION_MAX_TOKENS` | Max tokens per LLM call (default: 4000) | No |
| `RATE_LIMIT_REQ_PER_MIN` | Rate limit per IP (default: 60) | No |

## Development

### Testing

The project includes comprehensive testing with 55+ theme system tests:

```bash
# Run all tests
npm run test

# Run theme system tests
npm run test tests/theme.system.spec.ts tests/theme.integration.spec.ts

# Run E2E tests
npm run test:e2e

# Generate coverage report  
npm run test:coverage
```

### Database Management
```bash
# Create a migration
npx prisma migrate dev --name your-migration-name

# View database
npx prisma studio

# Reset database
npx prisma migrate reset
```

### Building for Production
```bash
npm run build
npm start
```

## Security Considerations

- API keys are stored server-side only
- All LLM calls are made from the server
- Basic rate limiting is implemented
- Input validation using Zod
- SQL injection protection via Prisma ORM

For production:
- Use environment-specific API keys
- Enable HTTPS
- Implement proper authentication
- Add request logging and monitoring
- Consider API key rotation

## License

MIT

## Acknowledgments

- Built with Next.js and React
- AI powered by OpenAI and Anthropic
- Visualization by React Flow
- Database ORM by Prisma
