/*
 * Workflow graph — TypeScript / d3 v7 port of the Graph component of NOMAD's WorkflowCard
 * (nomad-FAIR, gui/src/components/entry/properties/WorkflowCard.js).
 *
 * Copyright The NOMAD Authors. Licensed under the Apache License, Version 2.0
 * (http://www.apache.org/licenses/LICENSE-2.0). Modified for nomad-sdk: d3 v5 → v7 event
 * API; toolbar wired through a controls ref instead of DOM ids; styles as SVG attributes
 * (no stylesheet); archives from local files; no navigation to entry pages (no entries
 * exist before upload).
 */
import { useEffect, useState, type RefObject } from 'react';
import { Box, Tooltip, useTheme } from '@mui/material';
import * as d3 from 'd3';
import {
  getLinks,
  getNodes,
  parseNodeFilter,
  resolveSection,
  type GLink,
  type GNode,
  type Query,
} from '@/workflow/nomad/model';

/** Toolbar actions; set by the graph on every update (they act on the node shown). */
export interface GraphControls {
  filter?: (value: string) => void;
  clearFilter?: () => void;
  back?: () => void;
  reset?: () => void;
  toggleLegend?: () => void;
  toggleForce?: () => void;
}

const LAYOUT = {
  margin: { top: 60, bottom: 60, left: 40, right: 40 },
  circleRadius: 30,
  markerWidth: 4,
  scaling: 0.35,
  color: {
    text: '#6E7A8A',
    outline: '#6E7A8A',
    link: '#6E7A8A',
    linkHigh: '#A31330',
    workflow: '#1E40AF',
    task: '#1E40AF',
    outlineHigh: '#1E88E5',
    input: '#1E3A8A',
    output: '#004D40',
  },
  shape: {
    input: 'circle',
    workflow: 'rect',
    task: 'rect',
    output: 'circle',
  } as Record<string, 'circle' | 'rect'>,
};

type View = [number, number, number];
type NodeSel = d3.Selection<SVGGElement, GNode, SVGGElement, unknown>;
type LinkSel = d3.Selection<SVGPathElement, GLink, SVGGElement, unknown>;

interface GraphProps {
  source: GNode;
  query: Query;
  width: number;
  controls: RefObject<GraphControls>;
  svgRef: RefObject<SVGSVGElement | null>;
  setCurrentNode: (node: GNode | null) => void;
  setShowLegend: (show: boolean) => void;
  setEnableForce: (enabled: boolean) => void;
  onError: (error: unknown) => void;
}

export function WorkflowGraph({
  source,
  query,
  width,
  controls,
  svgRef,
  setCurrentNode,
  setShowLegend,
  setEnableForce,
  onError,
}: GraphProps) {
  const theme = useTheme();
  const fontFamily = String(theme.typography.fontFamily);
  const [tooltipContent, setTooltipContent] = useState<string>('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !width) return;
    const { markerWidth, scaling, color } = LAYOUT;
    const nodeShape = LAYOUT.shape;
    const whRatio = 1.7;
    const legendSize = 10;
    const height = width / whRatio;

    const svg = d3.select(svgRef.current);
    svg.selectAll('g').remove();
    svg.selectAll('defs').remove();

    const inOutColor = d3.interpolateRgb(color.input, color.output)(0.5);

    let nodes: GNode[] = [];
    let node: NodeSel | undefined;
    let line: LinkSel | undefined;
    let lineB: LinkSel | undefined;
    let id = 0;
    let view: View = [0, 0, 1];
    let focus: GNode | undefined;
    let previousNode: GNode | 'root' | undefined = 'root';
    let root: GNode | undefined;
    const dquery: Query = { ...query, resolveIndices: {} };
    let currentNode: GNode | undefined;
    let hasError = false;
    let enableForce = false;
    let dragged = false;
    let zoomTransform = d3.zoomIdentity;
    let disposed = false;

    const isWorkflow = (d: GNode) => {
      if (d.sectionType && d.sectionType.startsWith('workflow')) return true;
      const tasks = (d.nodes || []).filter((n) => n.type === 'tasks');
      return tasks.length > 0;
    };

    const nodeColor = (d: GNode) => {
      if (d.color) return d.color;
      if (d.type === 'link') return '#ffffff';
      if (isWorkflow(d)) return color.workflow;
      if (d.type === 'tasks') return color.task;
      if (d.type === 'inputs-outputs') return inOutColor;
      return d.type === 'inputs' ? color.input : color.output;
    };

    const trimName = (name?: string | null) =>
      name && name.length > 25 ? `${name.substring(0, 22)}...` : (name ?? '');

    // NOMAD styles `.text` / `.link` / `.icon` with a stylesheet; here they are attributes.
    const textStyle = <T extends d3.BaseType, D>(sel: d3.Selection<T, D, d3.BaseType, unknown>) =>
      sel.attr('font-family', fontFamily).attr('font-size', 12).attr('text-anchor', 'middle');

    svg.attr('width', width).attr('height', height);
    svg.append('g').attr('class', 'svgGroup');
    const svgGroup = svg.select<SVGGElement>('.svgGroup');
    svg.append('defs').attr('class', 'defs');

    const addLinkMarkers = (links: GLink[]) => {
      svg
        .select('.defs')
        .selectAll('marker')
        .data(
          links.map((link) => link.id!),
          (d) => d as string,
        )
        .join((enter) => {
          const marker = enter
            .append('marker')
            .attr('class', (d) => `marker-${d}`)
            .attr('id', (d) => `${idPrefix}${d}`)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 0)
            .attr('refY', 0)
            .attr('markerWidth', markerWidth)
            .attr('markerHeight', markerWidth)
            .attr('orient', 'auto')
            .attr('fill', color.link)
            .attr('fill-opacity', 0.5);
          marker.append('path').attr('d', 'M0,-5L10,0L0,5');
          return marker;
        });
    };
    // marker ids must be unique in the document (several graphs may exist)
    const idPrefix = `wf${Math.random().toString(36).slice(2, 8)}-`;

    svg.append('g').attr('class', 'legend').attr('visibility', 'hidden');
    const legend = svg.select<SVGGElement>('.legend');

    const addLegend = (label: string, index: number) => {
      const gLegend = legend.append('g').attr('cursor', 'pointer').attr('pointer-events', 'all');
      const shape = nodeShape[label]!;
      const icon = gLegend.append(shape);
      const dx = width / 8;
      const x = width / 2 + dx * index - dx;
      const y = height - legendSize * 3;

      if (shape === 'rect') {
        icon
          .attr('width', legendSize * whRatio)
          .attr('height', legendSize)
          .attr('rx', legendSize * 0.1)
          .attr('x', x - (legendSize * whRatio) / 2)
          .attr('y', y - legendSize / 2);
      } else {
        icon
          .attr('r', legendSize / 2)
          .attr('cx', x)
          .attr('cy', y);
      }
      icon.attr('fill', nodeColor({ type: label + 's', sectionType: label + 's' }));

      textStyle(gLegend.append('text'))
        .text(label)
        .attr('fill', color.text)
        .attr('x', x)
        .attr('y', y + legendSize * 1.2)
        .attr('alignment-baseline', 'middle');

      gLegend
        .on('mouseenter', () => {
          let tooltip = '';
          if (label === 'input') tooltip = 'Input to a task or workflow.';
          else if (label === 'output') tooltip = 'Output from a task or workflow.';
          else if (label === 'workflow') tooltip = 'Task containing further sub-tasks.';
          else if (label === 'task') tooltip = 'Elementary task with inputs and outputs.';
          setShowTooltip(legend.attr('visibility') === 'visible');
          setTooltipContent(tooltip);
        })
        .on('mouseleave', () => setShowTooltip(false));
    };

    // add legend
    legend
      .append('path')
      .attr('d', () => {
        const legendLine = d3.line();
        return legendLine([
          [width / 4 + 70, height - legendSize * 4],
          [(3 * width) / 4, height - legendSize * 4],
          [(3 * width) / 4, height - legendSize],
          [width / 4, height - legendSize],
          [width / 4, height - legendSize * 4],
          [width / 4 + 10, height - legendSize * 4],
        ]);
      })
      .attr('stroke', color.link)
      .attr('stroke-width', 0.5)
      .attr('fill', 'none');
    textStyle(legend.append('text'))
      .text('Legend')
      .attr('fill', color.text)
      .attr('font-weight', 'bold')
      .attr('x', width / 4 + 40)
      .attr('y', height - legendSize * 4);

    Object.keys(nodeShape)
      .filter((key) => key !== 'workflow')
      .forEach((label, index) => addLegend(label, index));

    // add zoom
    const zoomBehaviors = d3
      .zoom<SVGSVGElement, unknown>()
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomTransform = event.transform;
        svgGroup.attr('transform', zoomTransform.toString());
      });
    svg.call(zoomBehaviors);

    // set zoom factor to <1 inorder to see the inputs and outputs
    const zoomF = (r: number) => (width * scaling) / r;

    // add force directed behavior for tasks inside box
    const simulation = d3
      .forceSimulation<GNode>()
      .force(
        'link',
        d3.forceLink<GNode, GLink>().id((d) => d.id!),
      )
      .force('charge', d3.forceManyBody())
      .velocityDecay(0.2)
      .alphaDecay(0.2)
      .stop();

    // add drag
    const dragBehaviors = d3
      .drag<SVGGElement, GNode>()
      .on('drag', (event: d3.D3DragEvent<SVGGElement, GNode, GNode>, d) => {
        if (!d.parent || d.id === nodes[0]!.id) return;
        const sourceEvent = event.sourceEvent as MouseEvent;
        const k = zoomF(view[2]);
        const x = ((sourceEvent.offsetX - zoomTransform.x) / zoomTransform.k - width / 2) / k + view[0];
        const y = ((sourceEvent.offsetY - zoomTransform.y) / zoomTransform.k - height / 2) / k + view[1];
        setShowTooltip(false);
        if (enableForce) {
          d.fx = x;
          d.fy = y;
        } else {
          d.x = x;
          d.y = y;
          zoomTo(view);
        }
      })
      .on('start', () => {
        if (!enableForce) return;
        simulation.alphaTarget(0.7).restart();
      })
      .on('end', (_event, d) => {
        dragged = true;
        if (!enableForce) return;
        simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    const gNode = svgGroup
      .append('g')
      .attr('class', 'node')
      .attr('cursor', 'pointer')
      .attr('pointer-events', 'all');

    const gLink = svgGroup
      .append('g')
      .attr('class', 'link')
      .attr('cursor', 'default')
      .attr('pointer-events', 'all')
      .attr('stroke', color.link)
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.5)
      .attr('fill-opacity', 0.5)
      .attr('stroke-width', 1.5);

    const setNodesPosition = (root: GNode) => {
      // layout root and its nodes horizontally from inputs (left) root and tasks (middle)
      // and outputs (right)
      if (!root.nodes || root.children) return;

      const circleRadius = root.r! / 12;
      const dx = circleRadius * 4;
      const fx = 1.4;
      const tasks = root.nodes.filter((n) => n.type === 'tasks');
      root.children = tasks;
      // tasks are arranged in a circle inside the parent workflow
      tasks.forEach((n, index) => {
        const theta = (2 * Math.PI * index) / tasks.length - Math.PI / 4;
        n.r = Math.sqrt(n.size || 1) * circleRadius * 1.4;
        const r = root.r! - n.r;
        n.x = -r * 0.95 * Math.cos(theta) * whRatio + root.x!;
        n.y = -r * (theta < 0 || theta > Math.PI ? 0.95 : 0.85) * Math.sin(theta) + root.y!;
      });

      // inputs left
      const inputs = root.nodes.filter((n) => n.type === 'inputs');
      let offsetX = ((inputs.length - 1) * dx) / 2;
      inputs.forEach((n, index) => {
        n.y = index * dx - offsetX + root.y!;
        n.x = -root.r! * fx * whRatio + root.x!;
        n.r = circleRadius;
      });

      // inputs-outputs top
      const inouts = root.nodes.filter((n) => n.type === 'inputs-outputs');
      offsetX = (inouts.length - 1) * dx;
      inouts.forEach((n, index) => {
        n.x = index * dx * 2 - offsetX + root.x!;
        n.y = -root.r! * fx + root.y!;
        n.r = circleRadius;
      });

      // outputs right
      const outputs = root.nodes.filter((n) => n.type === 'outputs');
      offsetX = ((outputs.length - 1) * dx) / 2;
      outputs.forEach((n, index) => {
        n.y = index * dx - offsetX + root.y!;
        n.x = root.r! * whRatio * fx + root.x!;
        n.r = circleRadius;
      });
      root.nodes = [...inputs, ...inouts, ...root.children, ...outputs];
    };

    interface P {
      x: number;
      y: number;
      r: number;
    }
    const fLink = (n1: P, n2: P) => {
      let vx = n2.x - n1.x;
      let vy = n2.y - n1.y;
      const vr = Math.sqrt(vx * vx + vy * vy);
      const sin = vy / vr;
      const cos = vx / vr;
      const sx = vy ? Math.max(-1, Math.min(cos / sin, 1)) * Math.sign(sin) : Math.sign(vx);
      const sy = vx ? Math.max(-1, Math.min(sin / cos, 1)) * Math.sign(cos) : Math.sign(vy);
      const targetR = (f: number) => Math.abs(n2.r) * f;
      let offsetxt, offsetyt, offsetxs, offsetys;
      if (n1.r > 0) {
        // offset from edge of circle
        offsetxs = cos * n1.r;
        offsetys = sin * n1.r;
      } else {
        // offset from edge of square
        offsetxs = -sx * n1.r * whRatio;
        offsetys = -sy * n1.r;
      }
      if (n2.r > 0) {
        // offset to edge of circle
        offsetxt = cos * targetR(1);
        offsetyt = sin * targetR(1);
      } else {
        // offset to edge of square
        offsetxt = sx * targetR(whRatio);
        offsetyt = sy * targetR(1);
      }
      const src = { x: n1.x + offsetxs, y: n1.y + offsetys };
      const target = { x: n2.x - offsetxt, y: n2.y - offsetyt };
      vx = target.x - src.x;
      vy = target.y - src.y;
      const points: [number, number][] = [[src.x, src.y]];
      if (Math.abs(vx) > Math.abs(vy)) {
        target.x = target.x - markerWidth * 1.2 * Math.sign(vx);
      } else {
        target.y = target.y - markerWidth * 1.2 * Math.sign(vy);
      }
      points.push([target.x, target.y]);
      return d3.line()(points);
    };

    const zoomTo = (v: View) => {
      if (!node || !focus) return;
      const current = nodes[0]!;

      // for elementary tasks, set radius to 1/6
      const k = zoomF(v[2]);
      const rk = (n: GNode) => (n.id === focus!.id && !isWorkflow(n) ? 1 / 6 : 1);
      const bound = (d: GNode): [number, number] => {
        let x = (d.x! - v[0]) * k + width / 2;
        let y = (d.y! - v[1]) * k + height / 2;
        const s = 0.8 * scaling;
        if (d.type === 'tasks' && d.id !== current.id) {
          x = Math.min(Math.max(x, s * width), (1 - s) * width);
          y = Math.min(Math.max(y, s * height), (1 - s) * height);
        }
        return [x, y];
      };

      const translate = (n: GNode): P => {
        const isCircle = ['inputs', 'outputs', 'inputs-outputs'].includes(n.type ?? '');
        const dr = n.r! * rk(n) * k;
        const [x, y] = bound(n);
        return { x, y, r: isCircle ? dr : -dr };
      };

      view = v;
      node.attr('transform', (d) => {
        const [x, y] = bound(d);
        return `translate(${x},${y})`;
      });
      node.selectAll<SVGCircleElement, GNode>('circle').attr('r', (d) => d.r! * rk(d) * k);
      node
        .selectAll<SVGRectElement, GNode>('rect')
        .attr('x', (d) => -d.r! * rk(d) * k * whRatio)
        .attr('y', (d) => -d.r! * rk(d) * k)
        .attr('rx', (d) => d.r! * rk(d) * k * 0.05)
        .attr('width', (d) => d.r! * 2 * rk(d) * k * whRatio)
        .attr('height', (d) => d.r! * 2 * rk(d) * k);
      line?.attr('d', (d) => fLink(translate(d.source), translate(d.target)));
      lineB?.attr('d', (d) => fLink(translate(d.source), translate(d.target)));
      node.selectAll<SVGTextElement, GNode>('text').attr('y', (d) => -1.2 * d.r! * rk(d) * k);
    };

    const zoom = (d: GNode) => {
      focus = d;
      if (!focus) return;
      svg
        .transition()
        .duration(500)
        .tween('zoom', () => {
          const i = d3.interpolateZoom(view, [focus!.x!, focus!.y!, focus!.r! * 2]);
          return (t) => zoomTo(i(t));
        });
    };

    const expand = (d: GNode, q: Query, after?: (d: GNode) => void) => {
      resolveSection(d, q)
        .then((resolved) => {
          if (!resolved || disposed) return;
          return getNodes(resolved, q).then((ns) => {
            resolved.nodes = ns;
            return getLinks(resolved, query).then((links) => {
              if (disposed) return;
              resolved.links = links;
              update(resolved);
              zoom(resolved);
              after?.(resolved);
            });
          });
        })
        .catch(onError);
    };

    const update = (source: GNode) => {
      if (!source) return;
      if (!source.nodes || !source.nodes.length) return;

      dragged = false;

      const setShowNodes = (inputValue: string) => {
        if (hasError) setCurrentNode(currentNode ?? null);
        let sourceNode: GNode | undefined = currentNode;
        if (currentNode && ['inputs', 'outputs'].includes(currentNode.type ?? '')) {
          sourceNode = currentNode.parent;
        }
        if (!sourceNode || !currentNode) return;
        let total = 1;
        const same = (sourceNode.nodes || []).filter((n) => n.type === (currentNode!.type || 'tasks'));
        if (same.length) total = same[0]!.total!;
        let value: number[];
        try {
          value = parseNodeFilter(inputValue, total);
          hasError = false;
        } catch (error) {
          console.error(error);
          hasError = true;
          setCurrentNode(null);
          return;
        }
        if (!value.length) return;
        dquery.resolveIndices![currentNode.type || 'tasks'] = value;
        source.nodes = (source.nodes || []).filter((n) => n.id !== currentNode!.id);
        // set children and links to recalculate node positions and links
        const d = source;
        d.children = undefined;
        d.links = undefined;
        expand(d, dquery);
      };

      const handleMouseOverIcon = (_event: MouseEvent, d: GNode) => {
        d3.select(svgRef.current)
          .select(`#icon-${d.id}`)
          .style('stroke-opacity', 1)
          .style('stroke', color.outlineHigh);
        if (d.id === source.id) {
          if (!previousNode || previousNode === 'root') return;
          setShowTooltip(true);
          setTooltipContent('Click to go back up');
        } else if (['inputs', 'outputs'].includes(d.type ?? '')) {
          setShowTooltip(true);
          setTooltipContent(`Click to switch ${d.type} filter`);
        } else if (d.type === 'tasks') {
          const sectionType = d.sectionType === 'tasks' ? 'task' : 'workflow';
          setShowTooltip(true);
          setTooltipContent(`Click to expand ${sectionType}`);
        }
      };

      const handleMouseOutIcon = (_event: MouseEvent, d: GNode) => {
        setShowTooltip(false);
        d3.select(svgRef.current)
          .select(`#icon-${d.id}`)
          .style('stroke-opacity', 0.5)
          .style('stroke', color.outline);
      };

      const handleClickIcon = (event: MouseEvent | null, d: GNode) => {
        setShowTooltip(false);
        if (dragged) d.children = null;
        event?.stopPropagation();
        setCurrentNode(d);
        dquery.resolveIndices![d.type || 'tasks'] = null;
        currentNode = d;
        if (!d.nodes || !d.nodes.length) {
          return;
        }
        if (d.id === source.id) {
          if (!previousNode || previousNode === 'root') return;
          setCurrentNode(previousNode);
          currentNode = previousNode;
          update(previousNode);
          zoom(previousNode);
          previousNode = previousNode.parent;
          return;
        }
        d.parent = source;
        previousNode = d.parent;
        expand(d, query);
      };

      controls.current = {
        filter: setShowNodes,
        clearFilter: () => {
          const mid = (query.maxNodes || 6) / 2;
          setShowNodes(`:${mid},${-mid}:`);
        },
        back: () => {
          previousNode = source.parent;
          handleClickIcon(null, source);
        },
        reset: () => {
          if (!root) return;
          previousNode = 'root';
          root.nodes = null;
          root.links = null;
          root.children = null;
          dquery.resolveIndices = {};
          expand(root, query);
          svg.call(zoomBehaviors.transform, d3.zoomIdentity);
          if (enableForce) simulation.alphaTarget(0);
        },
        toggleLegend: () => {
          const visibility = legend.attr('visibility') === 'visible' ? 'hidden' : 'visible';
          legend.attr('visibility', visibility);
          setShowLegend(visibility === 'visible');
        },
        toggleForce: () => {
          enableForce = !enableForce;
          setEnableForce(enableForce);
          update(source);
          zoom(source);
          if (enableForce) simulation.alphaTarget(0.7).restart();
          else simulation.alphaTarget(0).stop();
        },
      };

      // set ids and size
      const maxLength = Math.max(
        ...source.nodes.filter((n) => n.type === 'tasks').map((n) => n.nChildren || 1),
      );
      source.size = (source.nChildren ?? 0) / maxLength;
      source.id = id;
      id = id + 1;
      source.nodes.forEach((n) => {
        n.size = ((n.nChildren || 1) / maxLength) ** 0.8;
        // put a lower limit on size so node will not get too small
        n.size = Math.max(n.size, 0.1);
        n.id = id;
        id = id + 1;
      });

      setNodesPosition(source);

      nodes = [source, ...source.nodes];
      const links = source.links || [];

      links.forEach((link) => {
        link.id = `${link.source.id}-${link.target.id}`;
      });

      addLinkMarkers(links);

      if (enableForce) {
        const k = zoomF(source.r! * 2);
        simulation.nodes(source.nodes.filter((n) => n.type === 'tasks')).on('tick', () => zoomTo(view));
        simulation.force<d3.ForceManyBody<GNode>>('charge')!.strength(-10 / k ** 2);
        simulation
          .force<d3.ForceLink<GNode, GLink>>('link')!
          .strength(0.005 / k)
          .distance(source.r!)
          .links(links.filter((link) => link.source.type === 'tasks' && link.target.type === 'tasks'));
        simulation.force('center', d3.forceCenter(source.x!, source.y!));
        simulation.force('collide', d3.forceCollide(source.r! / 3).strength(2));
      }

      // previous views are replaced (NOMAD hides them; same result)
      gNode.selectAll('g').remove();
      node = gNode
        .selectAll<SVGGElement, GNode>('g')
        .data(nodes, (d) => d.id!)
        .join('g')
        .attr('cursor', (d) => (d.nodes ? null : 'pointer'))
        .call(dragBehaviors);

      node
        .filter((d) => d.type === 'tasks' || d.id === source.id)
        .append('rect')
        .attr('id', (d) => `icon-${d.id}`)
        .attr('stroke', color.outline)
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.5)
        .attr('fill', (d) => nodeColor(d))
        .attr('fill-opacity', (d) => {
          if (d.type === 'link') return 0;
          if (!d.nodes || !d.nodes.filter((n) => n.type === 'tasks').length) return 1;
          if (d.id === source.id) return 0.2;
          return 1;
        })
        .on('mouseenter', handleMouseOverIcon)
        .on('mouseleave', handleMouseOutIcon)
        .on('click', handleClickIcon);

      node
        .filter((d) => d.type === 'inputs' || d.type === 'outputs' || d.type === 'inputs-outputs')
        .append('circle')
        .attr('id', (d) => `icon-${d.id}`)
        .attr('stroke', color.outline)
        .attr('stroke-width', 1)
        .attr('stroke-opacity', 0.5)
        .attr('fill', (d) => nodeColor(d))
        .on('mouseenter', handleMouseOverIcon)
        .on('mouseleave', handleMouseOutIcon)
        .on('click', handleClickIcon);

      textStyle(node.append('text'))
        .attr('fill', color.text)
        .attr('font-weight', (d) => (d.id === source.id ? 'bold' : 'normal'))
        .attr('id', (d) => `text-${d.id}`)
        .text((d) => trimName(d.name))
        .attr('font-size', (d) => (d.id === nodes[0]!.id ? 18 : 14))
        .on('click', (event: MouseEvent) => {
          // NOMAD opens the entry page here; before upload there is no entry to open.
          event.stopPropagation();
        })
        .on('mouseenter', (_event, d) => {
          if (!d.type || !d.parent || !d.sectionType) return;
          d3.select(svgRef.current)
            .select(`#text-${d.id}`)
            .attr('font-weight', 'bold')
            .text(d.name ?? '');
        })
        .on('mouseleave', (_event, d) => {
          setShowTooltip(false);
          d3.select(svgRef.current)
            .select(`#text-${d.id}`)
            .attr('font-weight', d.id === source.id ? 'bold' : 'normal')
            .text(trimName(d.name));
        });

      gLink.selectAll('path').remove();
      lineB = gLink
        .selectAll<SVGPathElement, GLink>('path.lineB')
        .data(links)
        .join('path')
        .attr('id', (d) => `link-${d.id}`)
        .attr('marker-end', (d) => `url(#${idPrefix}${d.id})`)
        .attr('class', 'lineB')
        .attr('stroke-dasharray', (d) => (d.dashed ? '3, 3' : null));

      line = gLink
        .selectAll<SVGPathElement, GLink>('path.line')
        .data(links)
        .join('path')
        .attr('class', 'line')
        .attr('pointer-events', 'all')
        .attr('stroke-width', 8)
        .attr('stroke-opacity', 0)
        .on('click', (event: MouseEvent, d) => {
          if (d.dashed) return;
          event.stopPropagation();
          const parent = d.source.parent || d.target.parent;
          if (!parent) return;
          // use the parent node to contain source and target nodes
          const linkNode = parent;
          const sourceNode = d.source;
          const targetNode = d.target;
          if (sourceNode.type !== 'tasks' || targetNode.type !== 'tasks') return;

          const store = (n: GNode) => {
            n._name = n.name;
            n._type = n.type;
            n.children = null;
            if (n.links) {
              n._links = [...n.links];
              n.links = null;
            }
            if (n.nodes) n._nodes = [...n.nodes];
          };

          const restore = (n: GNode) => {
            if (!n._nodes) return;
            n.nodes = n._nodes;
            n.links = n._links;
            n.children = null;
            n.name = n._name || n.name;
            n.type = n._type || n.type;
          };

          // store the original nodes info
          store(linkNode);
          store(sourceNode);
          store(targetNode);

          // include into sourceNode the targetNode inputs
          const inputs = [...(targetNode.nodes || []).filter((n) => n.type === 'inputs')];
          const url: Record<string, string | null | undefined> = {};
          (sourceNode.nodes || []).forEach((n) => {
            url[n.url!] = n.name;
          });
          inputs.forEach((input) => {
            if (Object.keys(url).includes(input.url!)) {
              sourceNode.nodes!.push(input);
              input._name = input.name;
              const sourceName = url[input.url!];
              if (sourceName !== input.name) input.name = `${input.name}/${sourceName}`;
              input._type = input.type;
              input.type = 'inputs-outputs';
            }
          });

          linkNode.type = 'link';
          // parent nodes should contain the source, target
          linkNode.nodes = [sourceNode, targetNode];
          // and the targetNode inputs
          linkNode.nodes.push(...inputs);
          // and the sourceNode outputs
          const inputUrls = inputs.map((n) => n.url);
          const outputs = (sourceNode.nodes || []).filter(
            (n) => n.type === 'outputs' && !inputUrls.includes(n.url),
          );
          linkNode.nodes.push(...outputs);
          // and the targetNode outputs
          linkNode.nodes.push(...(targetNode.nodes || []).filter((n) => n.type === 'outputs'));

          // generate links for this configuration
          getLinks(linkNode, query)
            .then((generated) => {
              if (disposed || !generated) return;
              const kept: (GLink | null)[] = [...generated];
              for (const [index, link] of generated.entries()) {
                if (link.target.url === sourceNode.url) {
                  // flip source and target since node is output of sourceNode
                  kept[index] = { source: link.target, target: link.source, id: link.id, label: null };
                } else if (link.target.url === linkNode.url || link.source.url === linkNode.url) {
                  // remove link to and from rootNode
                  kept[index] = null;
                } else if (link.source.url === sourceNode.url && link.target.url === targetNode.url) {
                  // remove link from sourceNode to targetNode, unnecessary
                  kept[index] = null;
                }
              }
              linkNode.links = kept.filter((l): l is GLink => l !== null);
              linkNode.name = null;
              update(linkNode);
              zoom(linkNode);
              previousNode = linkNode;
              // reset original nodes info
              inputs.forEach((input) => {
                input.type = 'inputs';
                input.name = input._name || input.name;
                input.children = null;
              });
              linkNode.type = linkNode._type;
              restore(linkNode);
              restore(sourceNode);
              restore(targetNode);
              setNodesPosition(linkNode);
            })
            .catch(onError);
        })
        .on('mouseenter', (_event, d) => {
          const s = d3.select(svgRef.current);
          s.select(`#link-${d.id}`).style('stroke-opacity', 1.0).style('stroke', color.linkHigh);
          s.select(`.marker-${d.id}`)
            .attr('fill-opacity', 1.0)
            .attr('stroke', color.linkHigh)
            .attr('fill', color.linkHigh);
          s.select(`#icon-${d.source.id}`).style('stroke', color.linkHigh).style('stroke-opacity', 1.0);
          s.select(`#icon-${d.target.id}`).style('stroke', color.linkHigh).style('stroke-opacity', 1.0);
          setShowTooltip(!!d.label);
          setTooltipContent(d.label ?? '');
        })
        .on('mouseleave', (_event, d) => {
          const s = d3.select(svgRef.current);
          s.select(`#link-${d.id}`).style('stroke-opacity', null).style('stroke', null);
          s.select(`.marker-${d.id}`).attr('fill-opacity', 0.5).attr('stroke', null).attr('fill', color.link);
          s.select(`#icon-${d.source.id}`).style('stroke', color.outline).style('stroke-opacity', 0.5);
          s.select(`#icon-${d.target.id}`).style('stroke', color.outline).style('stroke-opacity', 0.5);
          setShowTooltip(false);
        });
    };

    const start = { ...source, nodes: null, links: null, children: null } as GNode;
    resolveSection(start, query)
      .then((resolved) => {
        if (!resolved || disposed) return;
        return getNodes(resolved, query).then((ns) => {
          resolved.nodes = ns;
          resolved.x = 0;
          resolved.y = 0;
          resolved.r = width / 2;
          return getLinks(resolved, query).then((links) => {
            if (disposed) return;
            resolved.links = links;
            focus = resolved;
            root = resolved;
            setCurrentNode(resolved);
            currentNode = resolved;
            update(resolved);
            zoomTo([resolved.x!, resolved.y!, resolved.r! * 2]);
          });
        });
      })
      .catch(onError);

    return () => {
      disposed = true;
      simulation.stop();
      svg.interrupt();
      controls.current = {};
    };
  }, [
    source,
    query,
    width,
    fontFamily,
    controls,
    svgRef,
    setCurrentNode,
    setShowLegend,
    setEnableForce,
    onError,
  ]);

  return (
    <Tooltip
      title={tooltipContent}
      open={showTooltip && !!tooltipContent}
      slotProps={{
        popper: {
          anchorEl: {
            getBoundingClientRect: () => new DOMRect(tooltipPosition.x, tooltipPosition.y, 0, 0),
          },
        },
      }}
    >
      <Box onMouseMove={(event) => setTooltipPosition({ x: event.clientX, y: event.clientY })}>
        <svg ref={svgRef} role="img" aria-label="Workflow graph" />
      </Box>
    </Tooltip>
  );
}
