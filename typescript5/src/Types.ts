/**
 * Types: schemas as Python dataclasses, and dataclasses as schemas, step by step.
 *
 * A session (mbse-patterns' `Transforms`) runs over one store, `store(schemas, module)`: the schemas a store registers
 * and those they refer to (mbse-schemas' `Reflection.of`), Python's syntax trees (mbse-programs), and the output, whose
 * singleton `Codegen.Output` holds the module written or read. Each step is one decision:
 *
 * - `Dataclass` renders an object schema `s` as a class of the module, with a field per property, in order, each
 *   optional (`name: str | None = None`); its parameter `frozen` (a `bool`) is the decision. It applies where `s` is
 *   named, declares no parameters and no adjacencies, and every property's type is a basic native, a named schema (by
 *   its name) or a positional list of either (`list[...]`). A reference object schema compares by identity
 *   (`eq=False`), and a schema's description is the class's docstring.
 * - `Schema` reads a `@dataclass` class `c` of the module back as an object schema, registered in the schemas' store;
 *   a class a field names before its own step is registered empty, and filled by that step. A field's annotation is
 *   read as `Dataclass` writes one, and any other is refused.
 *
 * `generate(schemas, policy, earlier)` and `read(module, schemas)` run each to the end. `frozen` is the one thing a
 * schema does not hold: reading code back loses it, and the trace of the generation keeps it. A generation given the
 * steps of an earlier one takes each decision again where its key (`Dataclass(s=Contact)`, by the schema's name) still
 * occurs, so after a change of the schemas only a new schema asks; `session.orphans` are the decisions about schemas
 * now gone, and mbse-patterns' `Transforms.diff` compares the two.
 */

import { Expressions as E } from "@mbse/expressions";
import { Predicates as P, Transforms as T } from "@mbse/patterns";
import { Python312, Syntax as Py } from "@mbse/programs/Python";
import { Bindings, Proxies, Reflection, Schemas as S, Stores } from "@mbse/schemas/Framework";
import { ValueError } from "@mbse/schemas/Framework/Errors";

export const OUTPUT = "Codegen.Output";
/** The basic natives' tokens, which are also Python's names for them. */
export const NATIVES = ["bool", "int", "float", "str", "bytes"];
/** Python's keywords: a field so named is written with a trailing underscore (`from_`), and read back without it. */
export const KEYWORDS = ["False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
  "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"];
/** How deeply lists nest in a field's type (`list[list[int]]` is 2). */
export const DEPTH = 4;

export const Generated = new S.OfRelation.Builder().name("Codegen.Generated").links("output", "module").create();
const OutputSchema = new S.OfObject.Builder().name(OUTPUT).ref().singleton(OUTPUT).relations(
  (r) => r.name("modules").of(Generated).me("output")).create();

let outputs = 0;

/** The output of a session: the module written or read. */
export class Output {
  static Schema = OutputSchema;
  readonly #identity = `output ${++outputs}`;

  constructor(public module: Py.Module | null = null) {}

  identity(): string {
    return this.#identity;
  }

  schema_name(): string {
    return OUTPUT;
  }

  owner(): null {
    return null;
  }

  accept(visitor: unknown): void {
    Bindings.accept(BINDING, this, visitor as never);
  }
}

const BINDING = new Bindings.Binding(OutputSchema,
  (output: Output) => new Bindings.State(new Map(), new Map([["modules",
    (output.module === null ? [] : [output.module]).map((m) => new Bindings.Entry(new Map([["module", m]])))]])),
  (state: Bindings.State) => new Output(...(state.entries.get("modules") ?? []).map((e) => e.links.get("module") as Py.Module)));

/** The store a session runs over: the schemas `schemas` registers and those they refer to, Python's syntax trees, and
 * the output, which holds `module`. */
export function store(schemas: Stores.Store, module: Py.Module): Stores.Combined {
  const outputs = new Bindings.OfStore([[OutputSchema, (instance?: Output) => new Bindings.Builder(BINDING, instance)]],
    [Generated]);
  (outputs.singleton(OUTPUT) as unknown as Output).module = module;
  return new Stores.Combined(Reflection.of(schemas), Py.LANGUAGE.Builders as never, outputs);
}

function moduleOf(store: Stores.Combined): Py.Module {
  return (store.singleton(OUTPUT) as unknown as Output).module as Py.Module;
}

function schemasOf(store: Stores.Combined): Stores.Store {
  return (store.stores[0] as Reflection.OfStore).store;
}

// --- Schemas to classes ---

const [s, c, n, k, t, p, x] = [E.variable("s"), E.variable("c"), E.variable("n"), E.variable("k"), E.variable("t"),
  E.variable("p"), E.variable("x")];

function basic(type: E.Writer): E.Writer {
  return type.get("native").get("format").eq("basic");
}

/** A basic native, or a named object schema. */
function simple(type: E.Writer): E.Writer {
  const named = P.Exists((q) => q.symbols({ x: S.OfObject.Schema }).requires(x.get("name").eq(type.get("named").get("name"))));
  return basic(type).or_(E.operation("and", type.has("named"), named));
}

/** A type `Dataclass` renders: a simple one, or a list without an extent of one it renders, positional or keyed by a
 * basic native, nested `depth` deep at most. */
function rendered(type: E.Writer, depth = DEPTH): E.Writer {
  if (depth === 0) return simple(type);
  const indexed = type.get("indexed");
  const keyed = indexed.has("key").not_().or_(basic(indexed.get("key")));
  return simple(type).or_(type.has("indexed").and_(indexed.has("extent").not_()).and_(keyed).and_(
    rendered(indexed.get("item"), depth - 1)));
}

function over(symbols: Record<string, S.OfObject.Data>, constraint: unknown) {
  return new P.OfPredicate.Builder().symbols(symbols).requires(constraint as never).create();
}

const RENDERABLE = s.has("name").and_(s.has("parameters").not_()).and_(s.has("adjacencies").not_()).and_(
  s.has("properties").not_().or_(s.get("properties").all("p", rendered(p.get("type")))));
const HAS_CLASS = P.Exists((q) => q.symbols({ c: Py.ClassDef.Schema }).requires(
  P.Contains(c.children, (e) => e.property.eq("name").and_(e.child.spelling.eq(s.name)))));

function name(builder: any, spelling: string): any {
  return builder.Name().id(spelling);
}

/** The annotation of a type `Dataclass` renders. */
function annotation(type: any): (b: any) => any {
  if (type instanceof S.OfIndexed.Data && type.key !== null) {
    return (b) => b.Subscript().value((x: any) => name(x, "dict")).slice(
      (x: any) => x.Tuple().add_elts(annotation(type.key)).add_elts(annotation(type.item)));
  }
  if (type instanceof S.OfIndexed.Data) {
    return (b) => b.Subscript().value((x: any) => name(x, "list")).slice(annotation(type.item));
  }
  return (b) => name(b, type.name === null ? type.token.name : type.name);
}

/** A property's name as a field's: a keyword with a trailing underscore. */
function field(named: string): string {
  return KEYWORDS.includes(named) ? `${named}_` : named;
}

/** A string literal of `text`, in double quotes. */
function quoted(text: string): string {
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

/** The imports a dataclass needs, once, at the top. */
function imports(module: Py.Module): void {
  if (!module.body.some((statement) => statement instanceof Py.ImportFrom)) {
    const B = Py.LANGUAGE.Builders as any;
    module.body.splice(0, 0,
      B.ImportFrom().module((d: any) => d.add_names("__future__")).add_names(
        (a: any) => a.name((d: any) => d.add_names("annotations"))).create(),
      B.ImportFrom().module((d: any) => d.add_names("dataclasses")).add_names(
        (a: any) => a.name((d: any) => d.add_names("dataclass"))).create());
  }
}

function decorator(schema: S.OfObject.Data, frozen: boolean): (b: any) => any {
  const keywords = ([["eq", schema.ref], ["frozen", frozen]] as [string, boolean][]).filter(([, on]) => on)
    .map(([key]) => [key, key === "eq" ? "False" : "True"]);
  if (keywords.length === 0) return (b) => name(b, "dataclass");
  return (b) => keywords.reduce((built, [a, v]) => built.add_keywords((w: any) => w.arg(a).value((x: any) => x.Constant().spelling(v))),
    b.Call().func((x: any) => name(x, "dataclass")));
}

function render(store: Stores.Combined, match: Record<string, unknown>, args: Record<string, unknown>): void {
  const schema = match["s"] as S.OfObject.Data;
  const B = Py.LANGUAGE.Builders as any;
  const body: Py.Statement[] = schema.description === null ? []
    : [B.Expr().value((b: any) => b.Constant().spelling(quoted(schema.description as string))).create()];
  for (const [named, property] of schema.properties) {
    body.push(B.AnnAssign().target((b: any) => name(b, field(named))).annotation((b: any) => b.BinOp().left(annotation(property.type))
      .op("|").right((x: any) => x.Constant().spelling("None"))).value((b: any) => b.Constant().spelling("None")).create());
  }
  const built = B.ClassDef().name(schema.name).add_decorator_list(decorator(schema, args["frozen"] as boolean)).create();
  built.body = body.length > 0 ? body : [B.Pass().create()];
  const module = moduleOf(store);
  imports(module);
  place(module, built);
}

/** Places a class among the module's classes in name order, so that the module does not depend on the order of the
 * steps. */
function place(module: Py.Module, built: any): void {
  const after = module.body.findIndex((statement: any) => statement instanceof Py.ClassDef
    && (statement as any).name.spelling > built.name.spelling);
  module.body.splice(after < 0 ? module.body.length : after, 0, built);
}

/** An object schema as a dataclass of the module. */
export const Dataclass = new T.Transform("Dataclass", over({ s: S.OfObject.Schema }, RENDERABLE),
  over({ s: S.OfObject.Schema }, HAS_CLASS), {
    parameters: [(q) => q.name("frozen").of((x) => x.as_native(Boolean)).description("Whether the class is frozen")],
    rewrite: render as never,
  });

// --- Classes to schemas ---

const NAMED_DATACLASS = P.Contains(n.children, (e) => e.property.eq("id").and_(e.child.spelling.eq("dataclass")));
const DECORATED = E.operation("or",
  P.Exists((q) => q.symbols({ n: Py.Name.Schema }).requires(
    P.Contains(c.children, (e) => e.property.eq("decorator_list").and_(e.child.eq(n)))).requires(NAMED_DATACLASS)),
  P.Exists((q) => q.symbols({ k: Py.Call.Schema, n: Py.Name.Schema }).requires(
    P.Contains(c.children, (e) => e.property.eq("decorator_list").and_(e.child.eq(k)))).requires(
    P.Contains(k.children, (e) => e.property.eq("func").and_(e.child.eq(n)))).requires(NAMED_DATACLASS)));
const FIELDS = c.entries("children").count_where("f", E.variable("f").get("property").eq("body").and_(
  E.variable("f").get("child").get("kind").eq("AnnAssign")));
const HAS_SCHEMA = P.Exists((q) => q.symbols({ t: S.OfObject.Schema }).requires(
  P.Contains(c.children, (e) => e.property.eq("name").and_(e.child.spelling.eq(t.name)))).requires(
  t.has("properties").and_(t.get("properties").count().eq(FIELDS)).or_(t.has("properties").not_().and_(FIELDS.eq(0n)))));

function spelling(node: any): string {
  return node.id.spelling;
}

/** The type an annotation `Dataclass` writes names: a basic native, a named schema, or a list or dict of them. */
function typeOf(schemas: Stores.Store, node: any, where: string): any {
  if (node instanceof Py.Name) {
    const named = spelling(node);
    return NATIVES.includes(named) ? S.OfNative.resolve((x) => x.token("basic", named)) : registered(schemas, named);
  }
  const container = node instanceof Py.Subscript && node.value instanceof Py.Name ? spelling(node.value) : null;
  if (container === "list") return new S.OfIndexed.Builder().of(typeOf(schemas, node.slice, where)).create();
  if (container === "dict" && node.slice instanceof Py.Tuple && node.slice.elts.length === 2) {
    const [key, item] = node.slice.elts.map((element: any) => typeOf(schemas, element, where));
    return new S.OfIndexed.Builder().key(key).of(item).create();
  }
  throw new ValueError(`${where}: cannot read the annotation ${Python312.print(node).trim()}`);
}

/** The schema registered as `name`, or one registered empty, to be filled when its class is read. */
function registered(schemas: Stores.Store, named: string): any {
  if (![...schemas.names()].includes(named)) (schemas as any).register(new S.OfObject.Builder().name(named).create());
  return schemas.registered(named);
}

/** `T` of `T | None`. */
function optional(node: any): any {
  return node instanceof Py.BinOp && node.op === "|" && node.right instanceof Py.Constant && node.right.spelling === "None"
    ? node.left : node;
}

/** The text of a string literal in double or single quotes, or triple ones. */
function unquoted(literal: string): string {
  const quote = ['"""', "'''"].includes(literal.slice(0, 3)) ? literal.slice(0, 3) : literal.slice(0, 1);
  const inner = literal.slice(quote.length, literal.length - quote.length);
  return inner.replace(/\\(.)/gs, (_m, escaped: string) => escaped === "n" ? "\n" : escaped);
}

/** A field's name as a property's: a keyword's trailing underscore dropped. */
function property(named: string): string {
  return named.endsWith("_") && KEYWORDS.includes(named.slice(0, -1)) ? named.slice(0, -1) : named;
}

function keywords(node: any): Map<string, string> {
  return node instanceof Py.Call ? new Map(node.keywords.map((kw: any) => [kw.arg.spelling, kw.value.spelling])) : new Map();
}

function readClass(store: Stores.Combined, match: Record<string, unknown>): void {
  const cls = match["c"] as any;
  const schemas = schemasOf(store);
  const named = cls.name.spelling as string;
  const body = [...cls.body];
  const docstring = body.length > 0 && body[0] instanceof Py.Expr && body[0].value instanceof Py.Constant ? body[0] : null;
  const fields = body.filter((statement) => statement instanceof Py.AnnAssign).map((statement: any) =>
    [property(spelling(statement.target)), typeOf(schemas, optional(statement.annotation),
      `${named}.${spelling(statement.target)}`)] as [string, any]);
  const schema = registered(schemas, named);
  let builder = new S.OfObject.Builder(schema).properties(...fields.map(([f, y]) => (q: any) => q.name(f).of(y)));
  if (cls.decorator_list.some((d: any) => keywords(d).get("eq") === "False")) builder = builder.ref();
  if (docstring !== null) builder = builder.description(unquoted((docstring.value as any).spelling));
  builder.update();
}

/** A dataclass of the module as an object schema. */
export const Schema = new T.Transform("Schema", over({ c: Py.ClassDef.Schema }, DECORATED),
  over({ c: Py.ClassDef.Schema }, HAS_SCHEMA), { rewrite: readClass as never });

export const TO_PYTHON = [Dataclass];
export const FROM_PYTHON = [Schema];
/** Classes that are not frozen. */
export const PLAIN = new T.Policy(new T.Clause("Dataclass", { frozen: false }));

/** A session that renders the schemas `schemas` registers, and those they refer to, as the dataclasses of a new module,
 * run to the end: each decision an `earlier` step with its key took (`Dataclass(s=Contact)`) taken again, the others by
 * `policy`; the module is its store's output (`text(session)`). */
export function generate(schemas: Stores.Store, policy: T.Policy = PLAIN, earlier: Iterable<T.Step> = []): T.Session {
  const session = new T.Session(store(schemas, (Py.LANGUAGE.Builders as any).Module().create()), [...TO_PYTHON], {}, null,
    earlier);
  session.run(policy);
  return session;
}

/** A session that reads the dataclasses of `module` as schemas registered in `schemas` (a new store if none), run to
 * the end. */
export function read(module: Py.Module, schemas: Stores.Store | null = null): T.Session {
  const session = new T.Session(store(schemas ?? new Proxies.OfStore(), module), [...FROM_PYTHON]);
  session.run(new T.Policy(new T.Clause("Schema")));
  return session;
}

/** The object schemas of a generation's store that no class renders, in name order: those `Dataclass` does not render
 * (see its before), whose names a field may still name (completeness, which mbse-patterns plans in general). */
export function missing(session: T.Session): any[] {
  const classes = new Set(moduleOf(session.store as Stores.Combined).body.filter((statement) => statement instanceof Py.ClassDef)
    .map((statement: any) => statement.name.spelling));
  return [...session.store.extent("Schemas.Object")].filter((schema: any) => !classes.has(schema.name));
}

/** What makes a session's module invalid Python, by path (mbse-programs' validation): such as a name Python cannot
 * spell, which `Dataclass` writes as the schema has it. */
export function problems(session: T.Session): string[] {
  return Py.LANGUAGE.validate(moduleOf(session.store as Stores.Combined));
}

/** The source of a session's module, as Python 3.12 prints it; `ValueError` listing its `problems` if it has any. */
export function text(session: T.Session): string {
  const found = problems(session);
  if (found.length > 0) throw new ValueError(`the module is not valid Python: ${found.join("; ")}`);
  return Python312.print(moduleOf(session.store as Stores.Combined));
}
