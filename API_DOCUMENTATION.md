# Tyton API Documentation

**Version:** 0.2.0-alpha  
**Generated:** 2025-11-05  
**Status:** Alpha Release

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Backend API Endpoints](#backend-api-endpoints)
  - [Authentication Routes](#authentication-routes)
  - [Data Management](#data-management)
  - [Creation Engine API](#creation-engine-api)
  - [Communities](#communities)
  - [Discussions](#discussions)
  - [Journal Papers](#journal-papers)
- [Service Modules](#service-modules)
  - [Spec Service](#spec-service)
  - [Decompose Service](#decompose-service)
  - [Sourcing Service](#sourcing-service)
  - [Compatibility Service](#compatibility-service)
  - [Wiring Service](#wiring-service)
  - [Firmware Service](#firmware-service)
  - [CAD Service](#cad-service)
  - [Simulation Service](#simulation-service)
  - [Documentation Service](#documentation-service)
- [Frontend Utilities](#frontend-utilities)
  - [TytonAuth Class](#tytonauth-class)
  - [ErrorBoundary Class](#errorboundary-class)
- [Tyton Orchestrator API](#tyton-orchestrator-api)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Overview

The Tyton API provides a comprehensive platform for research collaboration, project management, and automated hardware design. The system consists of three main components:

1. **Backend REST API** - Node.js + Express.js server handling authentication, data management, and creation engine operations
2. **Service Modules** - Specialized services for hardware design automation (CAD, firmware, wiring, etc.)
3. **Tyton Orchestrator** - Next.js application with advanced EDA and orchestration capabilities

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Frontend Client                       │
│          (HTML/CSS/JS + React Components)                 │
└───────────────────┬──────────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
┌────────▼──────────┐  ┌──────▼────────────────┐
│   Backend API     │  │  Tyton Orchestrator   │
│  (Express/Node)   │  │     (Next.js)         │
├───────────────────┤  ├───────────────────────┤
│ • Auth            │  │ • EDA Tools           │
│ • Data Management │  │ • Real-time Updates   │
│ • Creation Engine │  │ • Schematic Rendering │
│ • File Upload     │  │ • Layout Generation   │
└───────────────────┘  └───────────────────────┘
         │                     │
         └──────────┬──────────┘
                    │
         ┌──────────▼──────────┐
         │   Service Modules   │
         ├─────────────────────┤
         │ • Spec Parser       │
         │ • Decomposition     │
         │ • Sourcing          │
         │ • Compatibility     │
         │ • Wiring            │
         │ • Firmware          │
         │ • CAD/STL           │
         │ • Simulation        │
         │ • Documentation     │
         └─────────────────────┘
```

---

## Getting Started

### Prerequisites

- Node.js 16+ installed
- Environment variables configured (see `.env.example`)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the server
npm start
```

### Base URL

```
Development: http://localhost:3000
Production: https://your-domain.com
```

### Content Type

All API requests should use:
```
Content-Type: application/json
```

---

## Authentication

The Tyton API supports multiple authentication methods:

1. **Local Authentication** (Email/Password)
2. **Google OAuth 2.0**
3. **JWT Token** (Bearer authentication)
4. **Session-based** (Cookie authentication)

### Authentication Flow

```
Client                    Server
  │                         │
  ├──► POST /auth/register  │
  │                         │
  │    ◄─── JWT Token ──────┤
  │                         │
  ├──► Subsequent Requests  │
  │    (with Bearer token)  │
  │                         │
  │    ◄─── Protected Data ─┤
```

---

## Backend API Endpoints

### Authentication Routes

#### Register User

Create a new user account with email and password.

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe",
  "handle": "@johndoe"
}
```

**Response:** `201 Created`
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "user_abc123xyz",
    "email": "user@example.com",
    "name": "John Doe",
    "handle": "@johndoe",
    "bio": "",
    "photo": "",
    "createdAt": 1699200000000,
    "emailVerified": false,
    "profileComplete": false
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "requiresProfileSetup": true
}
```

**Validation Rules:**
- Email: Must be valid email format
- Password: Minimum 6 characters, not in common passwords list
- Name: 1-100 characters, letters/spaces/hyphens only
- Handle: 2-30 characters, alphanumeric/underscore/dash only

**Error Responses:**
```json
// 400 Bad Request - Validation Failed
{
  "error": "Validation failed",
  "details": ["Password must be at least 6 characters"]
}

// 409 Conflict - User Exists
{
  "error": "An account already exists with this email address",
  "code": "EMAIL_EXISTS"
}
```

---

#### Login

Authenticate with email and password.

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:** `200 OK`
```json
{
  "message": "Login successful",
  "user": {
    "id": "user_abc123xyz",
    "email": "user@example.com",
    "name": "John Doe",
    "handle": "@johndoe",
    "profileComplete": true
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response:**
```json
// 401 Unauthorized
{
  "error": "Invalid email or password"
}
```

---

#### Google OAuth

Initiate Google OAuth authentication.

**Endpoint:** `GET /auth/google`

**Response:** Redirects to Google OAuth consent screen

**Callback:** `GET /auth/google/callback`

After successful authentication, redirects to:
- `/profile-setup.html?token=...` (if profile incomplete)
- `/?auth=success` (if profile complete)

---

#### Logout

End the current session.

**Endpoint:** `POST /auth/logout`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "message": "Logout successful"
}
```

---

#### Get Current User

Retrieve authenticated user information.

**Endpoint:** `GET /auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": "user_abc123xyz",
    "email": "user@example.com",
    "name": "John Doe",
    "handle": "@johndoe",
    "bio": "Researcher interested in quantum computing",
    "photo": "/uploads/photo-123.jpg",
    "profileComplete": true
  }
}
```

**Error Response:**
```json
// 401 Unauthorized
{
  "error": "Not authenticated"
}
```

---

#### Complete Profile

Complete user profile setup (required after registration).

**Endpoint:** `POST /auth/complete-profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "handle": "@johndoe",
  "researchArea": "Quantum Computing",
  "institution": "MIT",
  "academicLevel": "PhD Candidate",
  "bio": "Researching quantum algorithms",
  "location": "Cambridge, MA"
}
```

**Response:** `200 OK`
```json
{
  "message": "Profile completed successfully",
  "user": {
    "id": "user_abc123xyz",
    "email": "user@example.com",
    "name": "John Doe",
    "handle": "@johndoe",
    "researchArea": "Quantum Computing",
    "institution": "MIT",
    "academicLevel": "PhD Candidate",
    "bio": "Researching quantum algorithms",
    "location": "Cambridge, MA",
    "profileComplete": true
  }
}
```

---

### Data Management

#### Get All Data

Retrieve projects, equipment, and user-specific data.

**Endpoint:** `GET /api/data`

**Headers:**
```
Authorization: Bearer <token> (optional)
```

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": "item_xyz789",
      "type": "project",
      "title": "Quantum Entanglement Array",
      "description": "Revolutionary quantum communication system...",
      "tags": "quantum,communications,photonics",
      "owner": "@quantum_alice",
      "ownerId": "user_abc123",
      "location": "MIT Quantum Lab",
      "likes": 142,
      "likedBy": ["user_def456", "user_ghi789"],
      "createdAt": 1699100000000
    }
  ],
  "followers": {
    "item_xyz789": true
  },
  "profile": {
    "name": "John Doe",
    "handle": "@johndoe",
    "bio": "...",
    "photo": "/uploads/photo.jpg"
  },
  "currentUser": {
    "id": "user_abc123xyz",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "communities": []
}
```

---

#### Create Item

Create a new project or equipment listing.

**Endpoint:** `POST /api/items`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "project",
  "title": "Smart Environmental Monitor",
  "description": "IoT device for monitoring temperature, humidity, and air quality",
  "tags": "iot,sensors,environment",
  "location": "Stanford Research Lab"
}
```

**Response:** `201 Created`
```json
{
  "id": "item_new123",
  "type": "project",
  "title": "Smart Environmental Monitor",
  "description": "IoT device for monitoring...",
  "tags": "iot,sensors,environment",
  "owner": "@johndoe",
  "ownerId": "user_abc123xyz",
  "location": "Stanford Research Lab",
  "likes": 0,
  "likedBy": [],
  "createdAt": 1699200500000
}
```

**Validation Rules:**
- Title: 1-200 characters, required
- Description: 0-2000 characters
- Tags: Max 10 tags, each max 30 characters
- Type: Must be "project" or "equipment"

---

#### Like/Unlike Item

Toggle like status for a project or equipment.

**Endpoint:** `PUT /api/items/:id/like`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "likes": 143,
  "liked": true
}
```

---

#### Follow/Unfollow Item

Toggle follow status for updates on a project.

**Endpoint:** `PUT /api/items/:id/follow`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "following": true
}
```

---

#### Book Equipment

Reserve equipment for a specific time slot.

**Endpoint:** `POST /api/equipment/:id/book`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "date": "2025-08-20",
  "slot": "09:00-11:00"
}
```

**Response:** `201 Created`
```json
{
  "date": "2025-08-20",
  "slot": "09:00-11:00",
  "by": "@johndoe",
  "userId": "user_abc123xyz",
  "createdAt": 1699200600000
}
```

**Error Responses:**
```json
// 409 Conflict - Slot Already Booked
{
  "error": "Time slot is already booked"
}

// 404 Not Found
{
  "error": "Equipment not found"
}
```

---

#### Search

Search for projects and equipment.

**Endpoint:** `GET /api/search`

**Query Parameters:**
- `q` - Search query string
- `type` - Filter by type ("project" or "equipment")
- `tags` - Comma-separated tags to filter by

**Example:**
```
GET /api/search?q=quantum&type=project&tags=physics,research
```

**Response:** `200 OK`
```json
{
  "query": "quantum",
  "type": "project",
  "tags": "physics,research",
  "count": 5,
  "results": [
    {
      "id": "item_xyz789",
      "type": "project",
      "title": "Quantum Entanglement Array",
      "description": "...",
      "tags": "quantum,physics,research",
      "owner": "@quantum_alice",
      "likes": 142,
      "createdAt": 1699100000000
    }
  ]
}
```

---

#### Update Profile

Update user profile information.

**Endpoint:** `PUT /api/profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "John Q. Doe",
  "handle": "@johndoe",
  "bio": "Updated bio with new research interests",
  "photo": "/uploads/new-photo.jpg"
}
```

**Response:** `200 OK`
```json
{
  "id": "user_abc123xyz",
  "email": "user@example.com",
  "name": "John Q. Doe",
  "handle": "@johndoe",
  "bio": "Updated bio with new research interests",
  "photo": "/uploads/new-photo.jpg"
}
```

---

#### File Upload

Upload files (images) for profiles or projects.

**Endpoint:** `POST /api/upload`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file` - Image file (JPEG, PNG, GIF, WebP)

**Constraints:**
- Max file size: 5MB
- Allowed types: image/jpeg, image/png, image/gif, image/webp
- Rate limit: 5 uploads per hour per user

**Response:** `200 OK`
```json
{
  "message": "File uploaded successfully",
  "url": "/uploads/file-1699200700000-123456789.jpg",
  "filename": "file-1699200700000-123456789.jpg",
  "size": 245760,
  "mimetype": "image/jpeg"
}
```

**Error Responses:**
```json
// 413 Payload Too Large
{
  "error": "File too large. Maximum size is 5MB."
}

// 400 Bad Request - Invalid File Type
{
  "error": "Invalid file type. Only image/jpeg, image/png, image/gif, image/webp are allowed!"
}

// 429 Too Many Requests
{
  "error": "Upload rate limit exceeded. Please wait before uploading again."
}
```

---

### Creation Engine API

The Creation Engine automates hardware design from specifications to deliverables.

#### Create Project

Initialize a new Creation Engine project.

**Endpoint:** `POST /api/ce/projects`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "summary": "Build a temperature monitoring system with WiFi connectivity and OLED display",
  "templateId": "sensor_monitor"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "projectId": "ce_proj_abc123xyz"
  },
  "message": "Creation Engine project created successfully"
}
```

**Safety Validation:**

The API rejects hazardous projects containing keywords like:
- weapon, explosive, bomb, gun
- high voltage, mains, 110v, 220v, 240v
- hazardous chemical

**Error Response:**
```json
// 400 Bad Request - Hazardous Project
{
  "success": false,
  "error": "Project contains potentially hazardous elements",
  "alternatives": "Consider low-voltage alternatives, simulation-based projects..."
}
```

---

#### Run Pipeline

Execute the Creation Engine pipeline for a project.

**Endpoint:** `POST /api/ce/projects/:id/run`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "runId": "ce_run_xyz789",
    "status": "queued"
  },
  "message": "Pipeline execution queued"
}
```

**Pipeline Stages:**

The pipeline executes the following stages sequentially:

1. **parseSpec** - Parse and normalize project specification
2. **decompose** - Break down into subsystems
3. **sourceParts** - Find and source components
4. **compatCheck** - Verify component compatibility
5. **firmware** - Generate firmware scaffold
6. **wiring** - Create wiring diagram
7. **cad** - Generate 3D enclosure
8. **simulate** - Run circuit simulation
9. **docs** - Generate documentation
10. **collate** - Package all deliverables

---

#### Get Project

Retrieve project details, artifacts, and tasks.

**Endpoint:** `GET /api/ce/projects/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "project": {
      "id": "ce_proj_abc123",
      "userId": "user_abc123xyz",
      "title": "Temperature monitoring system...",
      "summary": "Build a temperature monitoring system...",
      "status": "completed",
      "spec": {
        "purpose": "Monitor temperature and environmental conditions",
        "features": ["sensor monitoring", "wireless connectivity"],
        "constraints": {
          "voltage": "3.3-5V",
          "power": "<1W",
          "size": "compact"
        }
      },
      "createdAt": 1699200000000,
      "updatedAt": 1699201000000
    },
    "tasks": [],
    "artifacts": [
      {
        "id": "artifact_123",
        "type": "firmware",
        "url": "/exports/ce_proj_abc123/firmware.zip"
      }
    ],
    "runs": [
      {
        "id": "ce_run_xyz789",
        "status": "completed"
      }
    ]
  }
}
```

---

#### Get BOM (Bill of Materials)

Retrieve the component list for a project.

**Endpoint:** `GET /api/ce/projects/:id/bom`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "bom_item_1",
      "projectId": "ce_proj_abc123",
      "componentId": "comp_bme280",
      "qty": 1,
      "notes": "Temperature/humidity sensor",
      "component": {
        "id": "comp_bme280",
        "sku": "BME280",
        "title": "BME280 Environmental Sensor",
        "specs": {
          "type": "environmental",
          "voltage": 3.3,
          "interface": "i2c",
          "measures": ["temperature", "humidity", "pressure"]
        },
        "price": 4.95,
        "currency": "USD",
        "source": "DigiKey",
        "stock": 1500
      }
    }
  ]
}
```

---

#### Export Project

Generate a downloadable package of all project files.

**Endpoint:** `POST /api/ce/export/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "zipUrl": "/exports/ce_proj_abc123/project-export.zip"
  },
  "message": "Export package ready for download"
}
```

---

### Communities

#### List Communities

Get all communities with optional filtering.

**Endpoint:** `GET /api/communities`

**Query Parameters:**
- `q` - Search query
- `type` - Filter by type (university, professional, research, hobby, nonprofit)
- `location` - Filter by location (north-america, europe, asia, global)

**Response:** `200 OK`
```json
{
  "count": 15,
  "communities": [
    {
      "id": "community_abc123",
      "name": "MIT Quantum Computing Research",
      "description": "Collaborative research group...",
      "type": "university",
      "location": "north-america",
      "tags": "quantum,computing,research,physics",
      "avatar": "⚛️",
      "memberCount": 156,
      "members": ["user_abc123", "user_def456"],
      "createdBy": "@quantum_lead",
      "createdById": "user_xyz789",
      "createdAt": 1699000000000,
      "public": true
    }
  ]
}
```

---

#### Create Community

Create a new research community.

**Endpoint:** `POST /api/communities`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Stanford AI Ethics Forum",
  "description": "Interdisciplinary community discussing AI ethics",
  "type": "university",
  "location": "north-america",
  "tags": "ai,ethics,philosophy",
  "avatar": "🤖"
}
```

**Response:** `201 Created`
```json
{
  "id": "community_new123",
  "name": "Stanford AI Ethics Forum",
  "description": "Interdisciplinary community discussing AI ethics",
  "type": "university",
  "location": "north-america",
  "tags": "ai,ethics,philosophy",
  "avatar": "🤖",
  "createdBy": "@johndoe",
  "createdById": "user_abc123xyz",
  "memberCount": 1,
  "members": ["user_abc123xyz"],
  "createdAt": 1699200800000,
  "public": true
}
```

---

#### Join/Leave Community

Toggle membership in a community.

**Endpoint:** `PUT /api/communities/:id/join`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "joined": true,
  "memberCount": 157
}
```

---

### Discussions

#### List Discussions

Get all discussion threads.

**Endpoint:** `GET /api/discussions`

**Response:** `200 OK`
```json
[
  {
    "id": "discussion_abc123",
    "title": "Best practices for quantum error correction",
    "content": "What are the current best practices...",
    "tags": "quantum,error-correction",
    "owner": "@quantum_alice",
    "ownerId": "user_abc123",
    "likes": 45,
    "likedBy": ["user_def456"],
    "views": 320,
    "replies": 12,
    "createdAt": 1699200000000
  }
]
```

---

#### Create Discussion

Start a new discussion thread.

**Endpoint:** `POST /api/discussions`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "title": "Questions about PCB layout for RF circuits",
  "content": "I'm designing a PCB for an RF application and have questions about trace impedance...",
  "tags": "pcb,rf,hardware"
}
```

**Response:** `201 Created`
```json
{
  "message": "Discussion created successfully",
  "discussion": {
    "id": "discussion_new123",
    "title": "Questions about PCB layout for RF circuits",
    "content": "I'm designing a PCB...",
    "tags": "pcb,rf,hardware",
    "owner": "@johndoe",
    "ownerId": "user_abc123xyz",
    "likes": 0,
    "likedBy": [],
    "views": 0,
    "createdAt": 1699201000000
  }
}
```

---

#### Get Discussion

Retrieve a specific discussion with details.

**Endpoint:** `GET /api/discussions/:id`

**Response:** `200 OK`
```json
{
  "id": "discussion_abc123",
  "title": "Best practices for quantum error correction",
  "content": "What are the current best practices...",
  "tags": "quantum,error-correction",
  "owner": "@quantum_alice",
  "ownerId": "user_abc123",
  "likes": 45,
  "likedBy": ["user_def456"],
  "views": 321,
  "replies": 12,
  "createdAt": 1699200000000
}
```

---

#### Like Discussion

Toggle like on a discussion.

**Endpoint:** `PUT /api/discussions/:id/like`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "likes": 46,
  "liked": true
}
```

---

#### Get Replies

Retrieve threaded replies for a discussion.

**Endpoint:** `GET /api/discussions/:id/replies`

**Response:** `200 OK`
```json
[
  {
    "id": "reply_abc123",
    "content": "Great question! For quantum error correction...",
    "owner": "@quantum_expert",
    "ownerId": "user_xyz789",
    "likes": 12,
    "likedBy": [],
    "createdAt": 1699201000000,
    "parentId": null,
    "children": [
      {
        "id": "reply_def456",
        "content": "That's a good point about surface codes...",
        "owner": "@quantum_alice",
        "ownerId": "user_abc123",
        "likes": 5,
        "likedBy": [],
        "createdAt": 1699202000000,
        "parentId": "reply_abc123",
        "children": []
      }
    ]
  }
]
```

---

#### Post Reply

Add a reply to a discussion.

**Endpoint:** `POST /api/discussions/:id/replies`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "content": "I've found that using surface codes provides the best balance...",
  "parentId": "reply_abc123"
}
```

**Response:** `201 Created`
```json
{
  "message": "Reply posted successfully",
  "reply": {
    "id": "reply_new123",
    "content": "I've found that using surface codes...",
    "owner": "@johndoe",
    "ownerId": "user_abc123xyz",
    "likes": 0,
    "likedBy": [],
    "createdAt": 1699203000000,
    "parentId": "reply_abc123"
  }
}
```

---

### Journal Papers

#### List Papers

Get all journal papers with filtering.

**Endpoint:** `GET /api/journal`

**Query Parameters:**
- `category` - Filter by category
- `status` - Filter by status (draft, submitted, peer-review, published, rejected)
- `search` - Search in title, abstract, authors, keywords

**Response:** `200 OK`
```json
[
  {
    "id": "paper_abc123",
    "title": "Novel Approach to Quantum Error Correction",
    "abstract": "We present a novel approach...",
    "authors": ["Dr. Alice Quantum", "Dr. Bob Photon"],
    "category": "Quantum Computing",
    "status": "published",
    "keywords": ["quantum", "error-correction", "topological"],
    "fileUrl": "https://arxiv.org/pdf/...",
    "submittedBy": "@quantum_alice",
    "submittedById": "user_abc123",
    "likes": 89,
    "likedBy": [],
    "downloads": 456,
    "views": 1234,
    "createdAt": 1699000000000,
    "updatedAt": 1699100000000
  }
]
```

---

#### Submit Paper

Submit a new journal paper.

**Endpoint:** `POST /api/journal`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "title": "Machine Learning for Quantum State Tomography",
  "abstract": "This paper explores the application of machine learning techniques...",
  "authors": ["John Doe", "Jane Smith"],
  "category": "Quantum Computing",
  "status": "submitted",
  "keywords": ["machine-learning", "quantum", "tomography"],
  "fileUrl": "https://arxiv.org/pdf/example.pdf"
}
```

**Response:** `201 Created`
```json
{
  "message": "Paper submitted successfully",
  "paper": {
    "id": "paper_new123",
    "title": "Machine Learning for Quantum State Tomography",
    "abstract": "This paper explores...",
    "authors": ["John Doe", "Jane Smith"],
    "category": "Quantum Computing",
    "status": "submitted",
    "keywords": ["machine-learning", "quantum", "tomography"],
    "fileUrl": "https://arxiv.org/pdf/example.pdf",
    "submittedBy": "@johndoe",
    "submittedById": "user_abc123xyz",
    "likes": 0,
    "likedBy": [],
    "downloads": 0,
    "views": 0,
    "createdAt": 1699201500000,
    "updatedAt": 1699201500000
  }
}
```

---

#### Like Paper

Toggle like on a journal paper.

**Endpoint:** `PUT /api/journal/:id/like`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "likes": 90,
  "liked": true
}
```

---

## Service Modules

The service modules power the Creation Engine and provide specialized hardware design automation capabilities.

### Spec Service

Parses and normalizes project specifications from natural language or templates.

**Module:** `services/spec.js`

#### Methods

##### `normalizeInput(input)`

Parse and normalize project specification.

**Parameters:**
```javascript
{
  summary: "Build a temperature sensor with WiFi",
  templateId: "sensor_monitor" // optional
}
```

**Returns:**
```javascript
{
  purpose: "Monitor temperature and environmental conditions",
  features: ["sensor monitoring", "wireless connectivity"],
  constraints: {
    voltage: "3.3-5V",
    power: "<1W",
    size: "compact"
  },
  components: ["environmental_sensor", "microcontroller", "wireless"],
  interfaces: ["i2c", "wifi"]
}
```

**Available Templates:**
- `led_blinker` - Basic LED blinking circuit
- `sensor_monitor` - Environmental sensor monitoring system
- `motor_controller` - DC motor control system

**Example:**
```javascript
const specService = require('./services/spec');

const spec = await specService.normalizeInput({
  summary: "Create a WiFi-enabled temperature monitor with OLED display"
});

console.log(spec);
// {
//   purpose: "Monitor temperature and environmental conditions",
//   features: ["sensor monitoring", "wireless connectivity", "visual display"],
//   ...
// }
```

---

### Decompose Service

Breaks down projects into logical subsystems.

**Module:** `services/decompose.js`

#### Methods

##### `decomposeProject(spec)`

Analyze specification and identify required subsystems.

**Parameters:**
```javascript
{
  purpose: "Monitor temperature...",
  features: ["sensor monitoring", "wireless connectivity"],
  constraints: { voltage: "3.3V", power: "<1W" },
  components: ["environmental_sensor", "microcontroller"]
}
```

**Returns:**
```javascript
[
  {
    id: "subsystem_1234_power",
    name: "Power Supply",
    type: "power",
    purpose: "Provide stable power distribution",
    requiredComponents: ["voltage_regulator"],
    interfaces: ["power_rails"],
    constraints: {
      voltage: "3.3V",
      current: "<200mA",
      efficiency: ">80%"
    },
    priority: 1
  },
  {
    id: "subsystem_1235_control",
    name: "Control Unit",
    type: "control",
    purpose: "Execute main program logic",
    requiredComponents: ["microcontroller"],
    interfaces: ["digital_io", "analog_in"],
    constraints: {
      voltage: "3.3V",
      current: "<50mA",
      frequency: ">1MHz"
    },
    priority: 2
  }
]
```

**Subsystem Types:**
- **power** - Power supply and voltage regulation
- **control** - Microcontroller and main logic
- **sensing** - Sensors and data acquisition
- **communication** - Wireless/wired communication
- **output** - Displays, LEDs, actuators
- **interface** - User input, connectors

---

### Sourcing Service

Finds and matches components from the component cache.

**Module:** `services/sourcing.js`

#### Methods

##### `findComponents(subsystems, componentCache)`

Source components for all subsystems.

**Parameters:**
```javascript
subsystems: [...],  // Array of subsystems
componentCache: [...]  // Available components
```

**Returns:**
```javascript
[
  {
    subsystem: "Control Unit",
    subsystemId: "subsystem_1235_control",
    component: {
      id: "comp_esp32",
      sku: "ESP32-WROOM-32",
      title: "ESP32 WiFi/Bluetooth Module",
      specs: {
        type: "mcu",
        voltage: 3.3,
        freq: 240,
        gpio: 34,
        wifi: true,
        bluetooth: true
      },
      price: 4.50,
      currency: "USD",
      source: "DigiKey",
      stock: 5000
    },
    quantity: 1,
    purpose: "microcontroller for Control Unit",
    score: 15.5,
    alternates: [
      {
        componentId: "comp_esp32_c3",
        score: 14.2,
        reason: "mcu component, 3.3V rated, wifi, good availability"
      }
    ],
    constraints: {
      voltage: "3.3V",
      temperature: "-40°C to 85°C",
      package: "SMD preferred"
    }
  }
]
```

**Scoring Algorithm:**

Components are scored based on:
1. **Type Match** (+10 points) - Component type matches requirement
2. **Spec Factors** - Voltage, current, interface compatibility
3. **Availability** (+2 points) - In stock
4. **Cost** (+1 point if <$1, -1 if >$10)

---

### Compatibility Service

Checks system-wide component compatibility.

**Module:** `services/compat.js`

#### Methods

##### `checkCompatibility(components, spec)`

Analyze compatibility across voltage, interface, power, physical, and assembly domains.

**Returns:**
```javascript
{
  overall: "compatible",  // "compatible", "marginal", "incompatible"
  score: 85,
  warnings: [
    "High pin utilization: 28/34 GPIO pins used",
    "I2C bus requires pull-up resistors (4.7kΩ typical)"
  ],
  errors: [],
  checks: {
    voltage: {
      score: 100,
      warnings: [],
      errors: []
    },
    interface: {
      score: 85,
      warnings: ["High pin utilization: 28/34 GPIO pins used"],
      errors: []
    },
    power: {
      score: 90,
      warnings: [],
      errors: []
    },
    physical: {
      score: 100,
      warnings: [],
      errors: []
    },
    assembly: {
      score: 95,
      warnings: ["Advanced soldering skills recommended"],
      errors: []
    }
  }
}
```

**Compatibility Checks:**

1. **Voltage Compatibility**
   - System voltage vs component ratings
   - Mixed voltage warnings
   - Maximum input voltage checks

2. **Interface Compatibility**
   - I2C address conflicts
   - SPI chip select requirements
   - Pin count availability
   - Pull-up resistor requirements

3. **Power Compatibility**
   - Total power consumption vs budget
   - Regulator capacity vs load
   - Current headroom

4. **Physical Compatibility**
   - Package types (SMD, THT, BGA)
   - Size constraints
   - Mixed assembly warnings

5. **Assembly Compatibility**
   - Skill level requirements
   - Required tools (reflow, hot air)
   - Assembly method consistency

---

### Wiring Service

Generates wiring diagrams and netlists.

**Module:** `services/wiring.js`

#### Methods

##### `generateWiring(components, spec)`

Create visual wiring diagram and connection netlist.

**Returns:**
```javascript
{
  devices: [
    {
      id: "comp_esp32",
      name: "ESP32 WiFi/Bluetooth Module",
      type: "mcu",
      refdes: "U1",
      pins: [
        { name: "VCC", x: 10, y: 0, type: "power", net: "VCC" },
        { name: "GND", x: 50, y: 0, type: "power", net: "GND" },
        { name: "SDA", x: 60, y: 10, type: "io", net: "I2C_SDA" },
        { name: "SCL", x: 60, y: 20, type: "io", net: "I2C_SCL" }
      ],
      interfaces: [
        { type: "i2c", pins: ["SDA", "SCL"] }
      ],
      power: {
        voltage: 3.3,
        current: 0.05
      }
    }
  ],
  nets: [
    {
      id: "net_VCC",
      name: "VCC",
      connections: [
        { device: "U1", deviceId: "comp_esp32", pin: "VCC", x: 10, y: 0 },
        { device: "U2", deviceId: "comp_bme280", pin: "VCC", x: 5, y: 0 }
      ],
      type: "power",
      color: "#FF0000"
    }
  ],
  svg: "<svg width='800' height='600'>...</svg>",
  layout: {
    width: 800,
    height: 600,
    devices: [
      { id: "comp_esp32", refdes: "U1", x: 200, y: 150, width: 60, height: 40 }
    ]
  },
  metadata: {
    components: 3,
    nets: 8,
    complexity: "moderate",
    estimatedWires: 15
  }
}
```

**Standard Wire Colors:**
- VCC: Red (#FF0000)
- GND: Black (#000000)
- SDA: Blue (#0000FF)
- SCL: Purple (#800080)
- MOSI: Green (#00FF00)
- MISO: Yellow (#FFFF00)
- SCK: Orange (#FFA500)

---

### Firmware Service

Generates firmware scaffolding for microcontrollers.

**Module:** `services/firmware.js`

#### Methods

##### `generateScaffold(spec, components)`

Create complete firmware project with main code, config, and libraries.

**Returns:**
```javascript
{
  platform: "esp32",  // "esp32", "arduino", "rp2040"
  framework: "arduino",
  language: "cpp",
  files: [
    {
      name: "main.cpp",
      content: "/* Generated Firmware */\n#include <Wire.h>...",
      type: "source"
    },
    {
      name: "config.h",
      content: "#ifndef CONFIG_H\n#define CONFIG_H...",
      type: "header"
    },
    {
      name: "libraries.txt",
      content: "Required Arduino Libraries:\n- Wire...",
      type: "documentation"
    },
    {
      name: "platformio.ini",
      content: "[env:esp32]\nplatform = espressif32...",
      type: "config"
    },
    {
      name: "README.md",
      content: "# Temperature Monitor Firmware\n...",
      type: "documentation"
    }
  ],
  mainCode: "/* Full main.cpp content */",
  metadata: {
    sensors: 1,
    displays: 1,
    interfaces: 2,
    complexity: "moderate"
  }
}
```

**Generated File Structure:**
```
firmware/
├── main.cpp          # Main firmware code
├── config.h          # Configuration constants
├── libraries.txt     # Required libraries
├── platformio.ini    # PlatformIO configuration
└── README.md         # Setup instructions
```

**Supported Platforms:**
- **ESP32** - WiFi/Bluetooth capable
- **Arduino** - ATmega-based boards
- **RP2040** - Raspberry Pi Pico

**Auto-detected Libraries:**
- BME280 → Adafruit BME280 Library
- SCD41 → Sensirion I2C Scd4x
- MPU6050 → MPU6050 by Electronic Cats
- SSD1306 → Adafruit SSD1306

---

### CAD Service

Generates 3D enclosures in STL format.

**Module:** `services/cad.js`

#### Methods

##### `generateEnclosure(spec)`

Create parametric enclosure design based on specifications.

**Returns:**
```javascript
{
  dimensions: {
    width: 100,
    height: 70,
    depth: 30,
    wallThickness: 2.0
  },
  volume: 15.2,  // cm³
  weight: "18.9",  // grams
  material: "pla",
  stlContent: "solid enclosure\nfacet normal 0.000000 0.000000 -1.000000...",
  features: [
    {
      name: "Snap-fit assembly",
      description: "Two-part enclosure with integrated clips"
    },
    {
      name: "Mounting posts",
      description: "Internal posts for PCB mounting"
    },
    {
      name: "Ventilation slots",
      description: "Small slots for airflow to sensors"
    }
  ],
  printSettings: {
    material: "PLA",
    hotendTemp: "200-220°C",
    bedTemp: "60°C",
    layerHeight: "0.2mm",
    infill: "20%",
    speed: "50mm/s",
    support: "Auto-generated where needed",
    adhesion: "Brim recommended"
  },
  metadata: {
    triangles: 48,
    complexity: "moderate",
    printTime: "2h 30m",
    filamentLength: "12.5m"
  }
}
```

**Material Properties:**
- **PLA** - Easy to print, 60°C max temp
- **ABS** - Strong, 80°C max temp, requires enclosure
- **PETG** - Weather resistant, 70°C max temp
- **Nylon** - Flexible, 120°C max temp

**Size Templates:**
- **small** - 60×40×20mm
- **compact** - 80×60×25mm
- **portable** - 100×70×30mm
- **large** - 120×90×40mm

---

### Simulation Service

Runs circuit simulation and validation tests.

**Module:** `services/sim.js`

#### Methods

##### `runSimulation(components, spec)`

Execute comprehensive circuit simulation with multiple test suites.

**Returns:**
```javascript
{
  status: "passed",  // "passed", "warning", "failed"
  netlist: {
    title: "Generated Circuit Netlist",
    nodes: Map { ... },
    elements: [
      {
        name: "ESP32-WROOM-32",
        refdes: "U1",
        type: "mcu",
        nodes: 8,
        model: "MCU160",
        parameters: { V: 3.3, freq: 160 }
      }
    ],
    supplies: [...]
  },
  tests: [
    {
      name: "Power Supply Analysis",
      status: "pass",
      tests: [
        {
          name: "Voltage Regulation",
          status: "pass",
          value: "3.30V",
          expected: "3.30V ± 3%",
          warnings: []
        },
        {
          name: "Current Capacity",
          status: "pass",
          value: "0.24A",
          expected: "<0.30A",
          warnings: []
        }
      ],
      duration: "0.5s",
      warnings: []
    }
  ],
  waveforms: [
    {
      name: "VCC Supply",
      type: "voltage",
      data: {
        points: [[0, 3.3], [0.01, 3.305], ...],
        description: "DC with ripple"
      },
      units: "V",
      timebase: "1ms/div"
    }
  ],
  recommendations: [
    {
      priority: "medium",
      category: "power",
      issue: "Voltage regulation tolerance",
      solution: "Add output capacitance for improved regulation"
    }
  ],
  metadata: {
    totalTests: 12,
    passedTests: 11,
    duration: "1.5s",
    complexity: "moderate"
  }
}
```

**Test Suites:**

1. **Power Supply Analysis**
   - Voltage regulation
   - Current capacity
   - Ripple analysis
   - Efficiency

2. **Signal Integrity**
   - Logic levels
   - Rise/fall times
   - Noise margins
   - Propagation delay

3. **Thermal Analysis**
   - Component temperatures
   - Heat dissipation
   - Thermal cycling

4. **Functional Verification**
   - Interface communication
   - Sensor readings
   - Actuator control

---

### Documentation Service

Generates comprehensive project documentation.

**Module:** `services/docs.js`

#### Methods

##### `generateDocs(context)`

Create multi-section documentation with assembly guides, testing procedures, and troubleshooting.

**Parameters:**
```javascript
{
  project: { ... },
  spec: { ... },
  components: [ ... ],
  compatibility: { ... },
  artifacts: [ ... ]
}
```

**Returns:**
```javascript
{
  type: "assembly",  // "quick_start", "user", "technical", "assembly"
  content: "# Temperature Monitor\n\n**Document Type:** Assembly Guide...",
  sections: [
    {
      name: "Overview",
      wordCount: 150
    },
    {
      name: "Bill of Materials",
      wordCount: 320
    },
    {
      name: "Hardware Components",
      wordCount: 450
    }
  ],
  wordCount: 2500,
  readingTime: "13 min",
  metadata: {
    generated: "2025-11-05T12:00:00.000Z",
    version: "1.0.0",
    format: "markdown",
    sections: 6,
    complexity: "moderate"
  }
}
```

**Document Types:**

1. **Quick Start Guide** - For simple projects (<5 components)
   - What You Need
   - 5-Minute Setup
   - First Test

2. **User Manual** - For projects with displays/interfaces
   - Overview
   - Hardware Components
   - Operation Guide
   - Troubleshooting

3. **Technical Reference** - For complex projects (>15 components)
   - Overview
   - Technical Specifications
   - Hardware Components
   - Wiring Diagram
   - Firmware and Software
   - Testing and Verification
   - Troubleshooting
   - Additional Resources

4. **Assembly Guide** - Default for most projects
   - Overview
   - Bill of Materials
   - Hardware Components
   - Assembly Instructions
   - Testing and Verification
   - Additional Resources

---

## Frontend Utilities

### TytonAuth Class

Client-side authentication management.

**File:** `public/auth-utils.js`

#### Methods

##### `getAuthHeaders()`

Get authentication headers for API requests.

**Returns:**
```javascript
{
  Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Example:**
```javascript
const headers = tytonAuth.getAuthHeaders();

fetch('/api/data', {
  headers: {
    ...headers,
    'Content-Type': 'application/json'
  }
});
```

---

##### `authFetch(url, options)`

Make authenticated API request with automatic retry.

**Parameters:**
- `url` - API endpoint
- `options` - Fetch options

**Returns:** Promise<Response>

**Features:**
- Automatic token refresh on 401
- Retry failed requests
- Graceful error handling

**Example:**
```javascript
try {
  const response = await tytonAuth.authFetch('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      type: 'project',
      title: 'My Project',
      description: '...'
    })
  });
  
  const data = await response.json();
  console.log('Created:', data);
} catch (error) {
  console.error('Request failed:', error);
}
```

---

##### `refreshAuth()`

Check and refresh authentication status.

**Returns:** Promise<boolean>

**Example:**
```javascript
const isAuthenticated = await tytonAuth.refreshAuth();

if (isAuthenticated) {
  console.log('User:', tytonAuth.currentUser);
} else {
  console.log('Not authenticated');
}
```

---

##### `setToken(token)`

Store authentication token.

**Parameters:**
- `token` - JWT token string

**Example:**
```javascript
// After login
tytonAuth.setToken(response.token);

// Clear token on logout
tytonAuth.setToken(null);
```

---

##### `clearAuth()`

Clear all authentication state.

**Example:**
```javascript
// Logout user
tytonAuth.clearAuth();
window.location.href = '/';
```

---

##### `isAuthenticated()`

Check if user is currently authenticated.

**Returns:** boolean

**Example:**
```javascript
if (tytonAuth.isAuthenticated()) {
  // Show authenticated UI
} else {
  // Show login form
}
```

---

##### `getCurrentUser()`

Get current user or load from server.

**Returns:** Promise<User|null>

**Example:**
```javascript
const user = await tytonAuth.getCurrentUser();

if (user) {
  document.getElementById('username').textContent = user.name;
} else {
  // Redirect to login
}
```

---

##### `handleUrlToken()`

Extract and store token from URL parameter.

**Example:**
```javascript
// After OAuth redirect or profile setup
tytonAuth.handleUrlToken();
// URL: /profile-setup.html?token=abc123
// Stores token and cleans URL
```

---

##### `requireAuth(message)`

Redirect to login if not authenticated.

**Parameters:**
- `message` - Optional error message

**Returns:** boolean - true if authenticated

**Example:**
```javascript
// Protect page that requires authentication
if (!tytonAuth.requireAuth('Please log in to view this page')) {
  // User not authenticated, will redirect
  return;
}

// User is authenticated, continue
loadPageContent();
```

---

### ErrorBoundary Class

Global error handling and graceful degradation.

**File:** `public/error-handling.js`

#### Methods

##### `handleError(errorInfo, context)`

Log and display error to user.

**Parameters:**
```javascript
{
  type: "network_failure",  // Error type
  message: "Failed to fetch data",
  url: "/api/data",
  ...additionalInfo
}
```

**Example:**
```javascript
try {
  const response = await fetch('/api/data');
  if (!response.ok) throw new Error('Failed to fetch');
} catch (error) {
  errorBoundary.handleError({
    type: 'network_failure',
    message: error.message,
    url: '/api/data'
  });
}
```

---

##### `withErrorHandling(fn, fallback, context)`

Wrap async function with automatic error handling.

**Parameters:**
- `fn` - Async function to execute
- `fallback` - Fallback value on error
- `context` - Additional error context

**Returns:** Promise<result|fallback>

**Example:**
```javascript
const data = await errorBoundary.withErrorHandling(
  async () => {
    const response = await fetch('/api/data');
    return await response.json();
  },
  [], // Fallback to empty array
  { operation: 'loadData' }
);

// If fetch fails, returns []
```

---

##### `retryWithBackoff(requestFn, maxRetries)`

Retry failed requests with exponential backoff.

**Parameters:**
- `requestFn` - Function to retry
- `maxRetries` - Maximum retry attempts (default: 3)

**Returns:** Promise<result>

**Example:**
```javascript
const data = await errorBoundary.retryWithBackoff(
  async () => {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error('Request failed');
    return await response.json();
  },
  3 // Try up to 3 times
);
```

**Retry Delays:**
- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 second delay
- Attempt 4: 4 second delay

---

##### `loadDataWithFallback(primarySource, fallbackData)`

Load data with automatic fallback to cache.

**Parameters:**
- `primarySource` - Function to load primary data
- `fallbackData` - Default fallback data

**Returns:** Promise<data>

**Example:**
```javascript
const projects = await errorBoundary.loadDataWithFallback(
  async () => {
    const response = await fetch('/api/data');
    return await response.json();
  },
  [] // Fallback to empty array
);
```

---

##### `safelyUpdateDOM(elementId, updateFn, fallbackContent)`

Update DOM with error protection.

**Parameters:**
- `elementId` - Element ID to update
- `updateFn` - Function to update element
- `fallbackContent` - Fallback text on error

**Example:**
```javascript
errorBoundary.safelyUpdateDOM(
  'project-count',
  (element) => {
    element.textContent = `${projects.length} projects`;
  },
  'Loading...'
);
```

---

##### `showToast(message, type)`

Display user notification.

**Parameters:**
- `message` - Message text
- `type` - "error", "warning", "success", "info"

**Example:**
```javascript
errorBoundary.showToast('Profile updated successfully', 'success');
errorBoundary.showToast('Failed to save changes', 'error');
```

---

##### `getErrorSummary()`

Get debugging information about captured errors.

**Returns:**
```javascript
{
  totalErrors: 5,
  recentErrors: [
    {
      type: "network_failure",
      message: "Failed to fetch data",
      timestamp: "2025-11-05T12:00:00.000Z"
    }
  ],
  errorTypes: {
    "network_failure": 3,
    "validation": 2
  }
}
```

---

### Utility Functions

#### `safeFetch(url, options)`

Enhanced fetch with automatic retries and error handling.

**Example:**
```javascript
const response = await safeFetch('/api/data');
const data = await response.json();
```

---

## Tyton Orchestrator API

The Tyton Orchestrator provides advanced EDA (Electronic Design Automation) capabilities through a Next.js API.

**Base URL:** `http://localhost:3000` (development)

### Health & Monitoring

#### System Health

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-05T12:00:00.000Z"
}
```

---

#### Comprehensive Health Dashboard

**Endpoint:** `GET /api/admin/health/dashboard`

**Response:**
```json
{
  "overall": "healthy",
  "services": {
    "database": "healthy",
    "api": "healthy",
    "workers": "healthy"
  },
  "metrics": {
    "uptime": 86400,
    "requestCount": 15000,
    "errorRate": 0.02
  }
}
```

---

### Projects

#### List Projects

**Endpoint:** `GET /api/projects`

**Response:**
```json
{
  "projects": [
    {
      "id": "proj_abc123",
      "name": "Smart Sensor Hub",
      "description": "IoT sensor aggregation system",
      "status": "active",
      "createdAt": "2025-11-01T00:00:00.000Z"
    }
  ]
}
```

---

#### Create Project

**Endpoint:** `POST /api/projects`

**Request:**
```json
{
  "name": "Weather Station",
  "description": "Multi-sensor weather monitoring system",
  "specs": {
    "voltage": "3.3V",
    "power": "<2W"
  }
}
```

**Response:**
```json
{
  "id": "proj_new123",
  "name": "Weather Station",
  "status": "created"
}
```

---

#### Get Project

**Endpoint:** `GET /api/projects/[id]`

**Response:**
```json
{
  "id": "proj_abc123",
  "name": "Smart Sensor Hub",
  "description": "IoT sensor aggregation system",
  "status": "active",
  "bom": [...],
  "schematic": {...},
  "layout": {...}
}
```

---

### Orchestration

#### Start Orchestration

**Endpoint:** `POST /api/projects/[id]/orchestrator/start`

**Response:**
```json
{
  "status": "started",
  "runId": "run_xyz789",
  "stages": [
    "parse_spec",
    "decompose",
    "source_parts",
    "generate_schematic",
    "layout",
    "validate"
  ]
}
```

---

#### Get Orchestration Status

**Endpoint:** `GET /api/projects/[id]/orchestrator/status`

**Response:**
```json
{
  "runId": "run_xyz789",
  "status": "running",
  "currentStage": "generate_schematic",
  "progress": 60,
  "stages": {
    "parse_spec": "completed",
    "decompose": "completed",
    "source_parts": "completed",
    "generate_schematic": "in_progress",
    "layout": "pending",
    "validate": "pending"
  }
}
```

---

### EDA Tools

#### Generate Netlist

**Endpoint:** `POST /api/eda/export/netlist`

**Request:**
```json
{
  "projectId": "proj_abc123",
  "format": "kicad"
}
```

**Response:**
```json
{
  "netlist": "(export (version D)...",
  "format": "kicad",
  "components": 12,
  "nets": 45
}
```

---

#### Validate Design (ERC)

**Endpoint:** `POST /api/eda/validation/erc`

**Request:**
```json
{
  "projectId": "proj_abc123"
}
```

**Response:**
```json
{
  "status": "passed",
  "errors": [],
  "warnings": [
    "Pin 3 of U1 is unconnected"
  ],
  "summary": {
    "totalChecks": 50,
    "errors": 0,
    "warnings": 1
  }
}
```

---

#### Validate Design (DRC)

**Endpoint:** `POST /api/eda/validation/drc`

**Request:**
```json
{
  "projectId": "proj_abc123"
}
```

**Response:**
```json
{
  "status": "passed",
  "errors": [],
  "warnings": [
    "Trace width below recommended minimum"
  ],
  "summary": {
    "totalChecks": 75,
    "errors": 0,
    "warnings": 1
  }
}
```

---

#### Generate Layout

**Endpoint:** `POST /api/eda/layout/generate`

**Request:**
```json
{
  "projectId": "proj_abc123",
  "algorithm": "elk",
  "constraints": {
    "maxWidth": 100,
    "maxHeight": 80
  }
}
```

**Response:**
```json
{
  "layout": {
    "width": 95,
    "height": 75,
    "components": [
      {
        "refdes": "U1",
        "x": 25,
        "y": 30,
        "rotation": 0
      }
    ]
  },
  "quality": 0.92,
  "algorithm": "elk"
}
```

---

### Real-time Updates

#### WebSocket Status

**Endpoint:** `GET /api/realtime/status`

**Response:**
```json
{
  "websocket": "available",
  "activeConnections": 5,
  "subscriptions": {
    "project_updates": 3,
    "orchestration": 2
  }
}
```

---

#### Upgrade to WebSocket

**Endpoint:** `GET /api/realtime/upgrade`

Upgrades HTTP connection to WebSocket for real-time project updates.

**WebSocket Messages:**
```json
{
  "type": "orchestration_update",
  "projectId": "proj_abc123",
  "stage": "generate_schematic",
  "progress": 75
}
```

---

## Data Models

### User

```javascript
{
  id: "user_abc123xyz",          // Unique user ID
  email: "user@example.com",     // Email address
  name: "John Doe",              // Full name
  handle: "@johndoe",            // Unique handle
  bio: "Researcher...",          // User bio
  photo: "/uploads/photo.jpg",   // Profile photo URL
  hashedPassword: "...",         // Bcrypt hashed password (not exposed in API)
  googleId: "google_id",         // Google OAuth ID (optional)
  createdAt: 1699200000000,      // Timestamp
  emailVerified: false,          // Email verification status
  profileComplete: true,         // Profile completion status
  researchArea: "Quantum Computing",  // Research area
  institution: "MIT",            // Institution
  academicLevel: "PhD Candidate",     // Academic level
  location: "Cambridge, MA"      // Location
}
```

---

### Project/Equipment Item

```javascript
{
  id: "item_xyz789",                    // Unique item ID
  type: "project",                      // "project" or "equipment"
  title: "Smart Sensor Hub",           // Title
  description: "IoT sensor system...",  // Description
  tags: "iot,sensors,hardware",        // Comma-separated tags
  owner: "@johndoe",                   // Owner handle
  ownerId: "user_abc123xyz",           // Owner user ID
  location: "MIT Lab",                 // Location
  likes: 42,                           // Like count
  likedBy: ["user_def456"],            // Array of user IDs who liked
  createdAt: 1699200000000,            // Creation timestamp
  
  // Equipment-specific fields
  bookings: [                          // Only for equipment
    {
      date: "2025-08-20",
      slot: "09:00-11:00",
      by: "@alice",
      userId: "user_abc123",
      createdAt: 1699200100000
    }
  ]
}
```

---

### Creation Engine Project

```javascript
{
  id: "ce_proj_abc123",              // Project ID
  userId: "user_abc123xyz",          // Owner user ID
  title: "Temperature monitor...",   // Project title
  summary: "Build a temperature...", // Project summary
  spec: {                            // Parsed specification
    purpose: "Monitor temperature...",
    features: ["sensor monitoring", "wireless"],
    constraints: {
      voltage: "3.3-5V",
      power: "<1W",
      size: "compact"
    },
    components: ["environmental_sensor", "microcontroller"],
    interfaces: ["i2c", "wifi"]
  },
  status: "completed",               // "created", "running", "completed", "failed"
  createdAt: 1699200000000,
  updatedAt: 1699201000000
}
```

---

### Component

```javascript
{
  id: "comp_bme280",                 // Component ID
  sku: "BME280",                     // SKU/Part number
  title: "BME280 Environmental Sensor",  // Title
  specs: {                           // Component specifications
    type: "environmental",
    voltage: 3.3,
    current: 0.0036,
    interface: "i2c",
    measures: ["temperature", "humidity", "pressure"],
    package: "LGA",
    accuracy: "±1°C, ±3%RH",
    resolution: "0.01°C"
  },
  price: 4.95,                       // Price
  currency: "USD",                   // Currency
  source: "DigiKey",                 // Supplier
  stock: 1500,                       // Stock quantity
  lastSeenAt: 1699200000000          // Last updated
}
```

---

### Community

```javascript
{
  id: "community_abc123",            // Community ID
  name: "MIT Quantum Research",      // Name
  description: "Collaborative...",   // Description
  type: "university",                // "university", "professional", "research", "hobby", "nonprofit"
  location: "north-america",         // "north-america", "europe", "asia", "global"
  tags: "quantum,computing,research",// Tags
  avatar: "⚛️",                      // Avatar emoji
  createdBy: "@alice",               // Creator handle
  createdById: "user_abc123",        // Creator user ID
  memberCount: 156,                  // Member count
  members: ["user_abc123"],          // Member user IDs
  createdAt: 1699000000000,
  public: true                       // Public/private status
}
```

---

### Discussion

```javascript
{
  id: "discussion_abc123",           // Discussion ID
  title: "Best practices for...",    // Title
  content: "What are the best...",   // Content
  tags: "quantum,error-correction",  // Tags
  owner: "@alice",                   // Owner handle
  ownerId: "user_abc123",            // Owner user ID
  likes: 45,                         // Like count
  likedBy: ["user_def456"],          // Array of user IDs
  views: 320,                        // View count
  createdAt: 1699200000000
}
```

---

### Journal Paper

```javascript
{
  id: "paper_abc123",                // Paper ID
  title: "Novel Approach to...",     // Title
  abstract: "We present a novel...", // Abstract
  authors: ["Dr. Alice", "Dr. Bob"], // Authors array
  category: "Quantum Computing",     // Category
  status: "published",               // "draft", "submitted", "peer-review", "published", "rejected"
  keywords: ["quantum", "error"],    // Keywords array
  fileUrl: "https://arxiv.org/...",  // PDF URL
  submittedBy: "@alice",             // Submitter handle
  submittedById: "user_abc123",      // Submitter user ID
  likes: 89,                         // Like count
  likedBy: [],                       // Array of user IDs
  downloads: 456,                    // Download count
  views: 1234,                       // View count
  createdAt: 1699000000000,
  updatedAt: 1699100000000
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": ["Additional detail 1", "Additional detail 2"]
}
```

### HTTP Status Codes

- **200 OK** - Success
- **201 Created** - Resource created
- **400 Bad Request** - Invalid input
- **401 Unauthorized** - Authentication required
- **403 Forbidden** - Permission denied
- **404 Not Found** - Resource not found
- **409 Conflict** - Resource conflict (e.g., duplicate)
- **413 Payload Too Large** - File too large
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - Server error
- **501 Not Implemented** - Feature not enabled

### Error Types

#### Validation Errors (400)

```json
{
  "error": "Validation failed",
  "details": [
    "Email must be a valid email address",
    "Password must be at least 6 characters"
  ]
}
```

#### Authentication Errors (401)

```json
{
  "error": "Authentication required"
}

{
  "error": "Invalid email or password"
}

{
  "error": "Token expired"
}
```

#### Resource Conflict (409)

```json
{
  "error": "An account already exists with this email address",
  "code": "EMAIL_EXISTS"
}

{
  "error": "Time slot is already booked"
}

{
  "error": "Handle already taken"
}
```

#### Rate Limiting (429)

```json
{
  "error": "Upload rate limit exceeded. Please wait before uploading again."
}
```

---

## Rate Limiting

### File Uploads

- **Limit:** 5 uploads per hour per IP/user
- **Window:** 1 hour rolling window
- **Response:** 429 Too Many Requests

### API Requests

No explicit rate limiting currently implemented, but recommended limits:

- **General API:** 100 requests per minute
- **Search:** 30 requests per minute
- **Authentication:** 10 attempts per 15 minutes

---

## Best Practices

### Authentication

1. **Store tokens securely** - Use localStorage or secure cookies
2. **Refresh tokens** - Check and refresh before expiry
3. **Handle 401 responses** - Redirect to login on auth failure
4. **Use HTTPS** - Always use HTTPS in production

**Example:**
```javascript
// Check auth before protected operations
const user = await tytonAuth.getCurrentUser();
if (!user) {
  window.location.href = '/login';
  return;
}

// Make authenticated request
const response = await tytonAuth.authFetch('/api/items', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(itemData)
});
```

---

### Error Handling

1. **Use try-catch** - Wrap API calls in try-catch blocks
2. **Provide fallbacks** - Use ErrorBoundary for graceful degradation
3. **Show user-friendly messages** - Don't expose technical errors
4. **Log errors** - Use errorBoundary.handleError() for tracking

**Example:**
```javascript
const data = await errorBoundary.withErrorHandling(
  async () => {
    const response = await tytonAuth.authFetch('/api/data');
    return await response.json();
  },
  [], // Fallback to empty array on error
  { operation: 'loadProjects' }
);
```

---

### File Uploads

1. **Validate client-side** - Check file type and size before upload
2. **Show progress** - Use progress events for large files
3. **Handle errors** - Show meaningful error messages
4. **Respect rate limits** - Don't exceed 5 uploads per hour

**Example:**
```javascript
const fileInput = document.getElementById('file');
const file = fileInput.files[0];

// Validate
if (file.size > 5 * 1024 * 1024) {
  errorBoundary.showToast('File too large. Max 5MB.', 'error');
  return;
}

if (!['image/jpeg', 'image/png'].includes(file.type)) {
  errorBoundary.showToast('Invalid file type', 'error');
  return;
}

// Upload
const formData = new FormData();
formData.append('file', file);

const response = await tytonAuth.authFetch('/api/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Uploaded:', result.url);
```

---

### Creation Engine

1. **Validate input** - Check for hazardous keywords
2. **Monitor progress** - Poll status endpoint for updates
3. **Handle failures** - Provide retry mechanism
4. **Download artifacts** - Save generated files locally

**Example:**
```javascript
// Create project
const createResponse = await tytonAuth.authFetch('/api/ce/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    summary: 'Build a temperature sensor with WiFi'
  })
});

const { data } = await createResponse.json();
const projectId = data.projectId;

// Start pipeline
await tytonAuth.authFetch(`/api/ce/projects/${projectId}/run`, {
  method: 'POST'
});

// Poll for completion
const pollStatus = async () => {
  const statusResponse = await tytonAuth.authFetch(`/api/ce/projects/${projectId}`);
  const project = await statusResponse.json();
  
  if (project.data.project.status === 'completed') {
    console.log('Pipeline complete!');
    console.log('Artifacts:', project.data.artifacts);
  } else if (project.data.project.status === 'failed') {
    console.error('Pipeline failed');
  } else {
    // Poll again in 2 seconds
    setTimeout(pollStatus, 2000);
  }
};

pollStatus();
```

---

## Changelog

### Version 0.2.0-alpha (2025-11-05)

**Added:**
- Creation Engine API with automated hardware design pipeline
- Service modules (CAD, firmware, wiring, simulation, documentation)
- Enhanced error handling with ErrorBoundary
- File upload with rate limiting
- Communities feature
- Discussions with threaded replies
- Journal papers submission system
- Comprehensive input validation

**Changed:**
- Renamed from Beta to Alpha
- Enhanced authentication with Google OAuth
- Improved API error responses
- Updated documentation structure

**Security:**
- Added input sanitization
- Implemented rate limiting for uploads
- Enhanced password validation
- Added hazardous project detection

---

## Support

For issues, questions, or feature requests:

- **Documentation:** See this file
- **Email:** support@tyton.dev
- **GitHub:** https://github.com/tyton/api

---

**End of Documentation**

*Generated by Tyton API Documentation System*  
*Last Updated: 2025-11-05*
