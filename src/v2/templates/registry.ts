import type { Node, NodeInput } from '../types/node';
import { createNode } from '../types/node';

export type TemplateDefinition = {
  children?: any[];
  [key: string]: any;
};

type TemplateFn = (id: string, props: Record<string, unknown>) => Node;

const templates = new Map<string, TemplateFn>();

export function registerTemplate(name: string, fn: TemplateFn): void {
  templates.set(name, fn);
}

export function getTemplate(name: string): TemplateFn | undefined {
  return templates.get(name);
}

/**
 * Substitute $ placeholders in a value.
 * - "$propName" → value from props
 * - "$propName:default" → value from props, or parse default as JSON
 * - "$.xxx" in IDs → "instanceId.xxx"
 */
function substituteValue(value: unknown, id: string, props: Record<string, unknown>): unknown {
  if (typeof value === 'string' && value.startsWith('$')) {
    const rest = value.slice(1);

    // ID prefix: $.xxx → id.xxx
    if (rest.startsWith('.')) {
      return `${id}${rest}`;
    }

    // Prop reference: $name or $name:default
    const colonIdx = rest.indexOf(':');
    if (colonIdx >= 0) {
      const propName = rest.slice(0, colonIdx);
      const defaultStr = rest.slice(colonIdx + 1);
      if (propName in props) return props[propName];
      try {
        return JSON.parse(defaultStr);
      } catch {
        return defaultStr;
      }
    }

    if (rest in props) return props[rest];
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(v => substituteValue(v, id, props));
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = substituteValue(v, id, props);
    }
    return result;
  }

  return value;
}

/**
 * Expand a declarative template definition into a node tree.
 */
export function expandTemplate(
  definition: TemplateDefinition,
  id: string,
  props: Record<string, unknown>,
): Node {
  const expanded = substituteValue(definition, id, props) as Record<string, unknown>;

  const children: Node[] = [];
  if (Array.isArray(expanded.children)) {
    for (const childDef of expanded.children) {
      const childId = childDef.id ?? id;
      children.push(createNode({ ...childDef, id: childId, children: [] } as NodeInput));
    }
  }

  return createNode({
    id,
    children,
    ...(expanded.transform ? { transform: expanded.transform as any } : {}),
    ...(expanded.fill ? { fill: expanded.fill as any } : {}),
    ...(expanded.stroke ? { stroke: expanded.stroke as any } : {}),
    ...(expanded.opacity !== undefined ? { opacity: expanded.opacity as number } : {}),
  } as NodeInput);
}

/**
 * Expand all template references in a node list.
 */
export function expandTemplates(
  nodes: Array<Record<string, unknown>>,
): Node[] {
  const result: Node[] = [];
  for (const nodeDef of nodes) {
    if (nodeDef.template && typeof nodeDef.template === 'string') {
      const fn = getTemplate(nodeDef.template);
      if (fn) {
        result.push(fn(
          nodeDef.id as string,
          (nodeDef.props as Record<string, unknown>) ?? {},
        ));
        continue;
      }
    }
    // Not a template — pass through as a regular node
    const children = Array.isArray(nodeDef.children)
      ? expandTemplates(nodeDef.children as Array<Record<string, unknown>>)
      : [];
    result.push(createNode({ ...nodeDef, children } as NodeInput));
  }
  return result;
}
