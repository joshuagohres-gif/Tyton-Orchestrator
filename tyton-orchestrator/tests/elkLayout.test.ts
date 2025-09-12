import { describe, it, expect } from "vitest";
import { computeElkLayout } from "@/server/services/elk";

describe("ELK basic layout", () => {
  it("layouts a tiny graph", async () => {
    const layout = await computeElkLayout({
      id: "test",
      children: [
        { id: "A", width: 140, height: 80 },
        { id: "B", width: 140, height: 80 }
      ],
      edges: [
        { id: "e1", sources: ["A"], targets: ["B"] }
      ]
    });
    
    expect(layout.children?.length).toBe(2);
    expect(layout.edges?.length).toBe(1);
    
    // Check that positions were assigned
    const nodeA = layout.children?.find(n => n.id === "A");
    const nodeB = layout.children?.find(n => n.id === "B");
    
    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();
    expect(typeof nodeA?.x).toBe("number");
    expect(typeof nodeA?.y).toBe("number");
    expect(typeof nodeB?.x).toBe("number");
    expect(typeof nodeB?.y).toBe("number");
    
  }, 15000);
});