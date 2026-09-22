export interface ProjectNode {
  id: string;
  name: string;
  type: 'service' | 'feature';
}

export interface ProjectRelation {
  parent_id: string;
  child_id: string;
  label: string;
}

export interface AnalyzedNode extends ProjectNode {
  evidence_paths: string[];
}

export interface AnalyzedGraph {
  nodes: AnalyzedNode[];
  relations: ProjectRelation[];
}

export function toPublicGraph(graph: AnalyzedGraph): {
  nodes: ProjectNode[];
  relations: ProjectRelation[];
} {
  return {
    nodes: graph.nodes.map(({ id, name, type }) => ({ id, name, type })),
    relations: graph.relations,
  };
}
