import { z } from 'zod';
import type { Node, NodeInput } from '../types/node';
import { createNode, NodeSchema } from '../types/node';
import { getDsl } from '../dsl/dslMeta';
import { resolveFieldSchema, unwrap } from '../dsl/schemaIntrospect';
import type { TextMeasurer } from '../text/measure';

export type TemplateDefinition = {
  children?: any[];
  [key: string]: any;
};

export type TemplateFn = (id: string, props: Record<string, unknown>, measure?: TextMeasurer) => Node;

const templates = new Map<string, TemplateFn>();

export function registerTemplate(name: string, fn: TemplateFn): void {
  templates.set(name, fn);
}

export function getTemplate(name: string): TemplateFn | undefined {
  return templates.get(name);
}

export interface ShapeDefinition {
  template: TemplateFn;
  props: z.ZodObject<any>;
}

export interface ShapeSet {
  name: string;
  description: string;
  shapes: Map<string, ShapeDefinition>;
}

const shapeSets = new Map<string, ShapeSet>();

/**
 * Names the node level claims before a shape's props get a look at them.
 * Derived from the schemas rather than listed by hand, so the reservation
 * cannot drift from what the walker actually does.
 */
function reservedPropNames(): Set<string> {
  const nodeHints = getDsl(NodeSchema) ?? {};
  const transformHints = getDsl(resolveFieldSchema(NodeSchema, 'transform')!) ?? {};
  return new Set([
    ...(nodeHints.kwargs ?? []),
    ...(nodeHints.flags ?? []),
    ...(transformHints.kwargs ?? []),
    ...(nodeHints.sigil ? [nodeHints.sigil.key] : []),
  ]);
}

/**
 * Names that open a construct on a node line — `rect`, `at`, `fill`. A prop
 * may share one when it takes a value (`fill=red` is unambiguous), but not
 * when it is a boolean: a bare `rect` on the line is read as geometry, and
 * the flag would never arrive.
 */
function keywordLedNames(): Set<string> {
  const nodeHints = getDsl(NodeSchema) ?? {};
  const names = new Set<string>([
    ...(nodeHints.geometry ?? []),
    ...(nodeHints.inlineProps ?? []),
    ...(nodeHints.blockProps ?? []),
    'template',
  ]);
  for (const field of nodeHints.inlineProps ?? []) {
    const schema = resolveFieldSchema(NodeSchema, field);
    const keyword = schema ? getDsl(schema)?.keyword : undefined;
    if (keyword) names.add(keyword); // e.g. `at` for transform
  }
  return names;
}

export function registerSet(set: ShapeSet): void {
  // A prop sharing a name with a node-level kwarg or flag would never reach
  // the shape: the walker resolves `opacity=0.5` on a box to the node, and it
  // has to, or every shape would have to re-implement opacity. Catching the
  // collision at registration turns a prop that silently never arrives into
  // an error the shape's author sees the first time they run the tests.
  const reserved = reservedPropNames();
  const keywordLed = keywordLedNames();
  for (const [shapeName, def] of set.shapes) {
    const shape = (def.props.shape ?? {}) as Record<string, z.ZodType>;
    for (const [propName, propSchema] of Object.entries(shape)) {
      if (reserved.has(propName)) {
        throw new Error(
          `Shape "${set.name}.${shapeName}" declares a prop named "${propName}", which the ` +
          `node level already claims — rename the prop, or read node.${propName} instead.`,
        );
      }
      if (keywordLed.has(propName) && unwrap(propSchema) instanceof z.ZodBoolean) {
        throw new Error(
          `Shape "${set.name}.${shapeName}" declares a boolean prop named "${propName}", which ` +
          `opens a construct on a node's line — written bare it would be read as ${propName}, ` +
          `never as the prop. Rename it.`,
        );
      }
    }
  }

  shapeSets.set(set.name, set);
  for (const [shapeName, def] of set.shapes) {
    templates.set(`${set.name}.${shapeName}`, def.template);
  }
}

export function getSet(name: string): ShapeSet | undefined {
  return shapeSets.get(name);
}

export function listSets(): ShapeSet[] {
  return Array.from(shapeSets.values());
}

export function getSetNames(): string[] {
  return Array.from(shapeSets.keys());
}

export function getShapeNames(setName: string): string[] {
  const set = shapeSets.get(setName);
  if (!set) return [];
  return Array.from(set.shapes.keys());
}

export function getShapeDefinition(setName: string, shapeName: string): ShapeDefinition | undefined {
  return shapeSets.get(setName)?.shapes.get(shapeName);
}

export function getShapePropsSchema(
  name: string,
  searchPath: string[] = [],
): z.ZodObject<any> | undefined {
  // Fully-qualified name (contains dot)
  if (name.includes('.')) {
    const [setName, shapeName] = name.split('.', 2);
    return shapeSets.get(setName)?.shapes.get(shapeName)?.props;
  }
  // Unqualified — walk search path
  for (const setName of searchPath) {
    const props = shapeSets.get(setName)?.shapes.get(name)?.props;
    if (props) return props;
  }
  // Fall back to checking all sets
  for (const set of shapeSets.values()) {
    const props = set.shapes.get(name)?.props;
    if (props) return props;
  }
  return undefined;
}

export function resolveTemplateName(
  name: string,
  searchPath: string[],
): TemplateFn | undefined {
  // Fully-qualified name (contains dot) — direct lookup
  if (name.includes('.')) {
    return templates.get(name);
  }
  // Unqualified — walk search path
  for (const setName of searchPath) {
    const fn = templates.get(`${setName}.${name}`);
    if (fn) return fn;
  }
  // Fall back to flat template names (for primitives if any remain)
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
  searchPath: string[] = ['core'],
  measure?: TextMeasurer,
  warnings?: string[],
): Node[] {
  const result: Node[] = [];
  for (const nodeDef of nodes) {
    if (nodeDef.template && typeof nodeDef.template === 'string') {
      const fn = resolveTemplateName(nodeDef.template, searchPath);
      if (fn) {
        const node = fn(
          nodeDef.id as string,
          (nodeDef.props as Record<string, unknown>) ?? {},
          measure,
        );
        // Merge node-level properties (transform, fill, stroke, etc.)
        // that were parsed alongside the template invocation. `children` is
        // merged rather than assigned: the template's own parts (a box's bg
        // and label) survive, and DSL-authored children are appended after
        // them. Assigning would leave the template an empty shell and push
        // the raw child defs into the tree unexpanded — which then crashed
        // the tree walker on their missing `children` array.
        for (const key of Object.keys(nodeDef)) {
          if (key === 'id' || key === 'template' || key === 'props' || key === 'children') continue;
          (node as any)[key] = nodeDef[key];
        }
        if (Array.isArray(nodeDef.children) && nodeDef.children.length > 0) {
          node.children = [
            ...node.children,
            ...expandTemplates(
              nodeDef.children as Array<Record<string, unknown>>,
              searchPath,
              measure,
              warnings,
            ),
          ];
        }
        result.push(node);
        continue;
      }
      warnings?.push(
        `Unknown template "${nodeDef.template}" on node "${nodeDef.id}" — ` +
        `searched sets: ${searchPath.join(', ')}`,
      );
    }
    // Not a template — pass through as a regular node
    const children = Array.isArray(nodeDef.children)
      ? expandTemplates(nodeDef.children as Array<Record<string, unknown>>, searchPath, measure, warnings)
      : [];
    result.push(createNode({ ...nodeDef, children } as NodeInput));
  }
  return result;
}
