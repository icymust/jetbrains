import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ServiceNode from '../components/ServiceNode';
import FeatureNode from '../components/FeatureNode';

const nodeTypes = {
  service: ServiceNode,
  feature: FeatureNode,
};

const generateInitialData = () => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  const padding = 0.2; 
  const servicesConfig = [
    {
      id: 'frontend', label: 'Frontend', pos: { x: 500, y: 150 },
      arcStart: Math.PI + padding, arcEnd: 2 * Math.PI - padding,
      features: ['UI Components', 'State Mgmt', 'Router']
    },
    {
      id: 'user-service', label: 'User Service', pos: { x: 100, y: 550 },
      arcStart: 0.5 * Math.PI + padding, arcEnd: 1.5 * Math.PI - padding,
      features: ['Auth', 'Roles', 'Profile']
    },
    {
      id: 'order-service', label: 'Order Service', pos: { x: 900, y: 550 },
      arcStart: -0.5 * Math.PI + padding, arcEnd: 0.5 * Math.PI - padding,
      features: ['Cart', 'Checkout', 'Payments']
    },
    {
      id: 'database', label: 'Database', pos: { x: 500, y: 950 },
      arcStart: 0 + padding, arcEnd: Math.PI - padding,
      features: ['Users DB', 'Orders DB', 'Cache']
    }
  ];

  const radius = 140; 
  const edgeStyle = { stroke: '#555555', strokeWidth: 1.5 };
  const labelBgStyle = { fill: '#121212', fillOpacity: 1, strokeWidth: 0 };
  const labelStyle = { fill: '#a9b7c6', fontWeight: 600, fontSize: 12, fontFamily: 'sans-serif' };

  servicesConfig.forEach((service) => {
    // 1. Add Main Service Node
    nodes.push({
      id: service.id, 
      type: 'service',
      position: { x: service.pos.x - 70, y: service.pos.y - 70 }, // Offset by 140/2 for center alignment
      data: { label: service.label }
    });

    const featureCount = service.features.length;
    service.features.forEach((featName, index) => {
      let finalAngle = (service.arcStart + service.arcEnd) / 2; 
      
      if (featureCount > 1) {
          const range = service.arcEnd - service.arcStart;
          finalAngle = service.arcStart + (index / (featureCount - 1)) * range;
      }

      // CRITICAL FIX: The X and Y calculations are now RELATIVE to the parent node.
      // The parent node is 140x140, so its relative center is (70, 70).
      // We calculate the radius off of (70,70) and then subtract 40 (the FeatureNode's radius) to center it.
      const relativeX = 70 + radius * Math.cos(finalAngle) - 40 + (Math.random() * 40 - 20);
      const relativeY = 70 + radius * Math.sin(finalAngle) - 40 + (Math.random() * 40 - 20);
      
      const featureId = `${service.id}-feat-${index}`;
      
      nodes.push({
        id: featureId, 
        type: 'feature',
        position: { x: relativeX, y: relativeY },
        parentId: service.id, // Binds feature to parent for drag translation
        data: { label: featName }
      });

      edges.push({
        id: `e-${service.id}-${featureId}`,
        source: service.id, target: featureId,
        type: 'straight', style: edgeStyle
      });
    });
  });

  const interServiceEdges = [
    { source: 'frontend', target: 'user-service', label: 'HTTP' },
    { source: 'frontend', target: 'order-service', label: 'HTTP' },
    { source: 'user-service', target: 'database', label: 'gRPC' },
    { source: 'order-service', target: 'database', label: 'gRPC' },
    { source: 'user-service', target: 'order-service', label: 'AMQP' }
  ];

  interServiceEdges.forEach((rel) => {
    edges.push({
      id: `e-${rel.source}-${rel.target}`,
      source: rel.source, target: rel.target, type: 'straight',
      label: rel.label, labelStyle, labelBgStyle,
      labelBgPadding: [10, 4], labelBgBorderRadius: 4,
      style: { stroke: '#777777', strokeWidth: 2 } 
    });
  });

  return { initialNodes: nodes, initialEdges: edges };
};

const { initialNodes, initialEdges } = generateInitialData();

export default function GraphPage() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="relative flex h-dvh w-full flex-col">
      <div className="absolute top-4 left-4 z-50">
        <Button variant="secondary" size="sm" nativeButton={false} render={<Link to="/" />}>
          <ArrowLeft />
          Back to projects
        </Button>
      </div>

      <div className="flex-grow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#333333" gap={24} size={1.5} />
          <Controls className="bg-[#1e1e1e] fill-white border-[#333333]" />
        </ReactFlow>
      </div>
    </div>
  );
}
