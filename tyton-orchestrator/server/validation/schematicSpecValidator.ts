
import { z } from 'zod';

export const SchematicSpecV12Schema = z.object({
  version: z.literal('1.2'),
  project: z.object({
    name: z.string(),
    description: z.string(),
    revision: z.string(),
    author: z.string(),
    date: z.string(),
  }),
  netClasses: z.record(z.object({
    minWidth: z.number(),
    maxVia: z.number(),
    clearance: z.number(),
    diffPair: z.number().optional(),
  })),
  powerTree: z.object({
    rails: z.array(z.object({
      name: z.string(),
      voltage: z.number(),
      current: z.number(),
      regulation: z.string(),
      source: z.string(),
    })),
  }),
  components: z.array(z.object({
    refDes: z.string(),
    mpn: z.string(),
    package: z.string(),
    value: z.string(),
    description: z.string(),
    pins: z.record(z.object({
      name: z.string(),
      type: z.string(),
    })),
  })),
  nets: z.array(z.object({
    name: z.string(),
    class: z.string(),
    members: z.array(z.string()),
    props: z.record(z.any()).optional(),
  })),
  buses: z.array(z.object({
    name: z.string(),
    type: z.string(),
    nets: z.array(z.string()),
    devices: z.array(z.object({
      refDes: z.string(),
      role: z.string(),
      address: z.string(),
    })),
  })),
  protections: z.array(z.object({
    type: z.string(),
    refDes: z.string(),
    rating: z.string(),
    rationale: z.string(),
  })),
  decoupling: z.array(z.object({
    refDes: z.string(),
    value: z.string(),
    voltage: z.string(),
    type: z.string(),
    placement: z.string(),
    rationale: z.string(),
  })),
  connectors: z.array(z.object({
    refDes: z.string(),
    type: z.string(),
    pins: z.number(),
    description: z.string(),
    pinout: z.record(z.string()),
  })),
  testPoints: z.array(z.object({
    refDes: z.string(),
    net: z.string(),
    description: z.string(),
  })),
  mechanical: z.array(z.object({
    type: z.string(),
    refDes: z.string(),
    size: z.string(),
    location: z.string(),
  })),
  layoutHints: z.object({
    keepouts: z.array(z.string()),
    criticalNets: z.array(z.string()),
    placement: z.record(z.string()),
  }),
  erc: z.array(z.object({
    type: z.string(),
    issue: z.string(),
    details: z.string(),
    severity: z.string(),
  })),
  assumptions: z.array(z.string()),
  openQuestions: z.array(z.string()),
});

export type SchematicSpecV12 = z.infer<typeof SchematicSpecV12Schema>;
