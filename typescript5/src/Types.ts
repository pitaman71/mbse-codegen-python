/**
 * Types: schemas as Python dataclasses, and dataclasses as schemas, step by step.
 *
 * A session (mbse-patterns' `Transforms`) runs over one store, `store(schemas, module)`: the schemas a store registers
 * and those they refer to (mbse-schemas' `Reflection.of`), Python's syntax trees (mbse-programs), and the output, whose
 * singleton `Codegen.Output` holds the module written or read. Each step is one decision:
 *
 * - `Dataclass` renders an object schema `s` as a class of the module, with a field per property, in order, each optional
 *   (`name: str | None = None`), then one per adjacency, named after it, holding its entries (`phones: tuple[Phones, ...]
 *   = ()`); its parameter `frozen` (a `bool`) is the decision. It applies where `s` is named, declares no parameters, every
 *   property's type renders (a basic native, a named object schema, or a list of them without an extent, positional or
 *   keyed by a basic native, nested to any depth) and every adjacency is to a named relation. A reference object schema
 *   compares by identity (`eq=False`), a schema's description is the class's docstring, a singleton's name its
 *   class variable `SINGLETON`, and a property's or an adjacency's description its field's metadata (`"description"`). Where a schema declares
 *   adjacencies via several links of one relation (a self-relation), each field's metadata names its link (`"me"`).
 * - `Union` and `Intersection` render a named union or intersection as a value class of a dataclass field per branch or
 *   part, each optional, as a proxy's union or intersection value reads it (`card.reach.email`); its class variable
 *   `KIND` (`"union"`, `"intersection"`) says which. Their parameter `frozen` is the decision, as `Dataclass`'s. A flat
 *   intersection (mbse-schemas' `flat`) is a class of its parts' properties, as a proxy reads them (`ticket.stamp.at`),
 *   its class variable `PARTS` saying each part's schema, or the properties of an inline one.
 * - `Alias` renders a flat union as a type alias of its branches' types (`type Channel = Call | Mail`), as a proxy reads
 *   its value; its branches' names, where they are not their types' (`call`, `int`, `list`, `dict`), and its description
 *   are `Annotated` metadata. It has no parameter.
 * - `Entry` renders a relation as the class of its entries, named after it: a field per link, typed by the object schemas
 *   that declare an adjacency via it (`Pager | Phone`), then one per property, and class variables `LINKS` and `UNIQUES`.
 *   An entry is shared by the objects it links, as mbse-schemas' proxies share theirs, so code reads an adjacency and its
 *   entries alike from proxies and generated classes (`for entry in contact.phones: entry.phone.number`).
 * - `Schema` reads a `@dataclass` class `c` of the module back: an entry class (with `LINKS`) as a relation, a class with
 *   `KIND` as a union or an intersection, any other as an object schema, registered in the schemas' store; a class of
 *   the module a dataclass field names before its own step is registered empty, and filled by that step, and a name
 *   that is neither a class of the module nor a schema of the store is refused. A field's annotation is read as `Dataclass` and `Entry` write one, and any other is refused.
 * - `FlatUnion` reads a type alias of the module back as a flat union, a branch per type of `A | B | ...`.
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

const [s, c, n, k, t, p, x, r, a, b, u, y, w, d] = ["s", "c", "n", "k", "t", "p", "x", "r", "a", "b", "u", "y", "w", "d"]
  .map((named) => E.variable(named)) as [E.Writer, E.Writer, E.Writer, E.Writer, E.Writer, E.Writer, E.Writer, E.Writer,
    E.Writer, E.Writer, E.Writer, E.Writer, E.Writer, E.Writer];

/** A basic native, as Python writes it: without a width, parameters or a description, which `int` cannot hold. */
function basic(type: E.Writer): E.Writer {
  const native = type.get("native");
  return native.get("format").eq("basic").and_(native.has("bits").not_()).and_(native.has("bytes").not_()).and_(
    native.has("terms").not_()).and_(native.has("parameters").not_()).and_(native.has("description").not_());
}

/** A basic native, or a named object schema, union or intersection: each a class. */
function simple(type: E.Writer): E.Writer {
  const [objects, unions, intersections] = [S.OfObject.Schema, S.OfUnion.Schema, S.OfIntersection.Schema].map((meta: any) =>
    P.Exists((q) => q.symbols({ x: meta }).requires(x.get("name").eq(type.get("named").get("name"))))) as [never, never, never];
  return basic(type).or_(E.operation("and", type.has("named"), E.operation("or", objects, E.operation("or", unions, intersections))));
}

/** Whether `Dataclass` renders a type `t`: a simple one, or a list without an extent of one it renders, positional or
 * keyed by a basic native, nested to any depth. It applies itself to the list's item. */
export const Rendered = new P.OfPredicate.Builder().name("Codegen.Rendered").parameters((q) => q.name("t")).create();
new P.OfPredicate.Builder(Rendered).requires(simple(t).or_(t.has("indexed").and_(t.get("indexed").has("extent").not_()).and_(
  t.get("indexed").has("key").not_().or_(basic(t.get("indexed").get("key")))).and_(
  Rendered.call(t.get("indexed").get("item")) as never))).update();

/** Whether `Dataclass` renders the type: `Rendered` applied to it. */
function rendered(type: E.Writer): any {
  return Rendered.call(type);
}

function over(symbols: Record<string, S.OfObject.Data>, constraint: unknown) {
  return new P.OfPredicate.Builder().symbols(symbols).requires(constraint as never).create();
}

const l = E.variable("l");

/** Whether `schema` declares an adjacency to the relation `r` via `link`. */
function declares(schema: E.Writer, link: E.Writer): E.Writer {
  return schema.has("adjacencies").and_(schema.get("adjacencies").any("b", b.get("relation").has("named").and_(
    b.get("relation").get("named").get("name").eq(r.get("name"))).and_(b.get("me").eq(link))));
}

/** Whether the adjacency `a` is to a named relation, whose entry class its field holds. */
const RELATED = E.operation("and", a.get("relation").has("named"), P.Exists((q) => q.symbols({ r: S.OfRelation.Schema }).requires(
  r.get("name").eq(a.get("relation").get("named").get("name")))));
const RENDERABLE = s.has("name").and_(s.has("parameters").not_()).and_(
  s.has("adjacencies").not_().or_(s.get("adjacencies").all("a", RELATED))).and_(
  s.has("properties").not_().or_(s.get("properties").all("p", rendered(p.get("type")))));
/** Whether `Entry` renders the relation `r`: named, without parameters, its properties' types rendered, and each link
 * declared by an object schema, which types it. */
const ENTRY_RENDERABLE = E.operation("and", r.has("name").and_(r.has("parameters").not_()).and_(
  r.has("properties").not_().or_(r.get("properties").all("p", rendered(p.get("type"))))),
  r.get("links").all("l", P.Exists((q) => q.symbols({ y: S.OfObject.Schema }).requires(declares(y, l)))));
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

/** Imports `name` from `source`, once, after `from __future__ import annotations`, the imports in the order
 * `dataclasses`, `typing`, whichever step needs them first. */
function require(module: Py.Module, source: string, named: string): void {
  const B = Py.LANGUAGE.Builders as any;
  let imports = module.body.filter((statement) => statement instanceof Py.ImportFrom) as any[];
  if (imports.length === 0) {
    imports = [B.ImportFrom().module((d: any) => d.add_names("__future__")).add_names(
      (alias: any) => alias.name((d: any) => d.add_names("annotations"))).create()];
    module.body.splice(0, 0, imports[0]);
  }
  let found = imports.find((statement) => statement.module.names[0].spelling === source);
  if (found === undefined) {
    found = B.ImportFrom().module((d: any) => d.add_names(source)).create();
    module.body.splice(source === "typing" ? 2 : 1, 0, found); // dataclasses is always needed first
  }
  const names = found.names.map((alias: any) => alias.name.names[0].spelling as string);
  if (!names.includes(named)) { // in name order, whichever step needs it first
    found.names.splice(names.filter((other: string) => other < named).length, 0, B.Alias().name((d: any) => d.add_names(named)).create());
  }
}

function decorator(schema: any, frozen: boolean): (b: any) => any {
  const keywords = ([["eq", schema.ref === true], ["frozen", frozen]] as [string, boolean][]).filter(([, on]) => on) // a union or intersection is a value
    .map(([key]) => [key, key === "eq" ? "False" : "True"]);
  if (keywords.length === 0) return (b) => name(b, "dataclass");
  return (b) => keywords.reduce((built, [a, v]) => built.add_keywords((w: any) => w.arg(a).value((x: any) => x.Constant().spelling(v))),
    b.Call().func((x: any) => name(x, "dataclass")));
}

/** `A | B | ...` of the names, in order. */
function union(names: string[]): (b: any) => any {
  return names.slice(1).reduce((left: (b: any) => any, named) => (b: any) => b.BinOp().left(left).op("|").right(
    (x: any) => name(x, named)), (b: any) => name(b, names[0] as string));
}

type Texts = string | Texts[];

/** A tuple of strings, or of tuples of strings. */
function strings(values: Texts[]): (b: any) => any {
  return (b) => values.reduce((built: any, value) => built.add_elts(
    Array.isArray(value) ? strings(value) : (x: any) => x.Constant().spelling(quoted(value))), b.Tuple());
}

/** `tuple[str, ...]`, nested `depth` deep. */
function texts(depth: number): (b: any) => any {
  const item = depth === 1 ? (b: any) => name(b, "str") : texts(depth - 1);
  return (b) => b.Subscript().value((x: any) => name(x, "tuple")).slice(
    (x: any) => x.Tuple().add_elts(item).add_elts((y: any) => y.Constant().spelling("...")));
}

/** `NAME: ClassVar[tuple[str, ...]] = (...)`: what an entry class says of its relation. */
function classVariable(named: string, depth: number, values: Texts[]): any {
  return (Py.LANGUAGE.Builders as any).AnnAssign().target((b: any) => name(b, named)).annotation(
    (b: any) => b.Subscript().value((x: any) => name(x, "ClassVar")).slice(texts(depth))).value(
    (b: any) => b.Parenthesized().value(strings(values))).create();
}

/** `name: T | None = None`. */
/** A field's default as it is, or, where it has metadata, `field(default=..., metadata={...})`. */
function defaultOf(value: (b: any) => any, metadata: Record<string, MetadataValue>): (b: any) => any {
  if (Object.keys(metadata).length === 0) return value;
  return (b: any) => b.Call().func((x: any) => name(x, "field")).add_keywords((kw: any) => kw.arg("default").value(value))
    .add_keywords((kw: any) => kw.arg("metadata").value(metadataLiteral(metadata)));
}

/** `name: T | None = None`, its description, where it has one, in its metadata. */
function optionalField(named: string, type: (b: any) => any, description: string | null = null): any {
  return (Py.LANGUAGE.Builders as any).AnnAssign().target((b: any) => name(b, field(named))).annotation(
    (b: any) => b.BinOp().left(type).op("|").right((x: any) => x.Constant().spelling("None"))).value(
    defaultOf((b: any) => b.Constant().spelling("None"), description === null ? {} : { description })).create();
}

/** `NAME: ClassVar[str] = "text"`. */
function classText(named: string, text: string): any {
  return (Py.LANGUAGE.Builders as any).AnnAssign().target((b: any) => name(b, named)).annotation(
    (b: any) => b.Subscript().value((x: any) => name(x, "ClassVar")).slice((x: any) => name(x, "str"))).value(
    (b: any) => b.Constant().spelling(quoted(text))).create();
}

/** Places a class in the module, with the imports it needs: `dataclass`, `field` and `ClassVar` where it uses them. */
function finish(store: Stores.Combined, built: any): void {
  const module = moduleOf(store);
  require(module, "dataclasses", "dataclass");
  const assigned = (built.body as any[]).filter((statement) => statement instanceof Py.AnnAssign);
  if (assigned.some((statement) => statement.value instanceof Py.Call)) require(module, "dataclasses", "field");
  if (assigned.some((statement) => statement.annotation instanceof Py.Subscript && spelling(statement.annotation.value) === "ClassVar")) {
    require(module, "typing", "ClassVar");
  }
  place(module, built);
}

function docstring(description: string | null): any[] {
  return description === null ? []
    : [(Py.LANGUAGE.Builders as any).Expr().value((b: any) => b.Constant().spelling(quoted(description))).create()];
}

/** The object schemas that declare an adjacency to `relation` via `link`, in name order: the link's types. */
function declarers(objects: any[], relation: unknown, link: string): any[] {
  return objects.filter((o) => [...o.adjacencies.values()].some((adjacency: any) => adjacency.relation === relation
    && adjacency.me === link));
}

function render(store: Stores.Combined, match: Record<string, unknown>, args: Record<string, unknown>): void {
  const schema = match["s"] as S.OfObject.Data;
  const B = Py.LANGUAGE.Builders as any;
  const body: any[] = [...docstring(schema.description), ...(schema.singleton === null ? [] : [classText("SINGLETON", schema.singleton)]),
    ...[...schema.properties].map(([named, property]) => optionalField(named, annotation(property.type), property.description))];
  for (const [named, adjacency] of schema.adjacencies) {
    const relation = adjacency.relation as S.OfRelation.Data;
    const entries = (b: any) => b.Subscript().value((x: any) => name(x, "tuple")).slice((x: any) => x.Tuple().add_elts(
      (y: any) => name(y, relation.name as string)).add_elts((y: any) => y.Constant().spelling("...")));
    const metadata: Record<string, MetadataValue> = adjacency.description === null ? {} : { description: adjacency.description };
    if (new Set([...schema.adjacencies.values()].filter((other) => other.relation === relation).map((other) => other.me)).size > 1) {
      metadata["me"] = adjacency.me; // which link, where ambiguous
    }
    body.push(B.AnnAssign().target((b: any) => name(b, field(named))).annotation(entries).value(
      defaultOf((b: any) => b.Tuple(), metadata)).create());
  }
  const built = B.ClassDef().name(schema.name).add_decorator_list(decorator(schema, args["frozen"] as boolean)).create();
  built.body = body.length > 0 ? body : [B.Pass().create()];
  finish(store, built);
}

function renderEntry(store: Stores.Combined, match: Record<string, unknown>): void {
  const relation = match["r"] as S.OfRelation.Data;
  const B = Py.LANGUAGE.Builders as any;
  const objects = [...store.extent("Schemas.Object")] as any[];
  const uniques = relation.uniques.map((unique) => [...unique].sort().join("\u0000")).sort().map((unique) => unique.split("\u0000"));
  const body = [...docstring(relation.description), classVariable("LINKS", 1, [...relation.links]),
    ...(uniques.length > 0 ? [classVariable("UNIQUES", 2, uniques)] : []),
    ...relation.links.map((link) => optionalField(link, union(declarers(objects, relation, link).map((o) => o.name)))),
    ...[...relation.properties].map(([named, property]) => optionalField(named, annotation(property.type), property.description))];
  const built = B.ClassDef().name(relation.name).add_decorator_list((b: any) => b.Call().func((x: any) => name(x, "dataclass"))
    .add_keywords((kw: any) => kw.arg("eq").value((x: any) => x.Constant().spelling("False")))).create();
  built.body = body;
  finish(store, built);
}

/** The name a class or a type alias defines, or null for another statement. */
function defined(statement: any): string | null {
  if (statement instanceof Py.ClassDef) return (statement as any).name.spelling;
  return statement instanceof Py.TypeAlias ? (statement as any).name.id.spelling : null;
}

/** Places a class or a type alias among the module's in name order, so that the module does not depend on the order
 * of the steps. */
function place(module: Py.Module, built: any): void {
  const named = defined(built) as string;
  const after = module.body.findIndex((statement: any) => (defined(statement) ?? "") > named);
  module.body.splice(after < 0 ? module.body.length : after, 0, built);
}

/** An object schema as a dataclass of the module. */
export const Dataclass = new T.Transform("Dataclass", over({ s: S.OfObject.Schema }, RENDERABLE),
  over({ s: S.OfObject.Schema }, HAS_CLASS), {
    parameters: [(q) => q.name("frozen").of((x) => x.as_native(Boolean)).description("Whether the class is frozen")],
    rewrite: render as never,
  });

/** A relation as the class of its entries: a field per link, typed by the object schemas that declare it, then one per
 * property, and class variables `LINKS` and `UNIQUES` that say which fields are links and what is unique. */
export const Entry = new T.Transform("Entry", over({ r: S.OfRelation.Schema as any }, ENTRY_RENDERABLE),
  over({ r: S.OfRelation.Schema as any }, P.Exists((q) => q.symbols({ c: Py.ClassDef.Schema }).requires(
    P.Contains(c.children, (e) => e.property.eq("name").and_(e.child.spelling.eq(r.name)))))), { rewrite: renderEntry as never });

/** Where a union's and an intersection's members are, in their module form and their data. */
const MEMBERS: Record<string, string> = { union: "branches", intersection: "parts" };

/** Whether a part's type is an object schema whose properties render: inline, or named. */
function objectRendered(type: E.Writer): unknown {
  const renders = (o: E.Writer) => o.has("properties").not_().or_(o.get("properties").all("q", rendered(E.variable("q").get("type"))));
  const named = P.Exists((q) => q.symbols({ x: S.OfObject.Schema }).requires(x.get("name").eq(type.get("named").get("name")))
    .requires(renders(x)));
  return E.operation("or", type.has("object").and_(renders(type.get("object"))), E.operation("and", type.has("named"), named));
}

function variantsRenderable(kind: string, flat: boolean): E.Writer {
  const members = MEMBERS[kind] as string;
  const flatness = flat ? s.has("flat") : s.has("flat").not_();
  const each = kind === "intersection" && flat ? objectRendered(p.get("type")) : rendered(p.get("type"));
  return s.has("name").and_(s.has("parameters").not_()).and_(flatness).and_(s.has(members)).and_(s.get(members).all("p", each as never));
}

/** The name a flat union's branch has unless its alias says otherwise: its type's, as Python writes it. */
function convention(type: any): string {
  if (type instanceof S.OfIndexed.Data) return type.key === null ? "list" : "dict";
  return type.name === null ? type.token.name : snakeCase(type.name);
}

function snakeCase(named: string): string {
  return named.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase();
}

type MetadataValue = string | MetadataValue[] | { [key: string]: MetadataValue };

/** A dict literal of text, lists of text and dicts of them. */
function metadataLiteral(value: MetadataValue): (b: any) => any {
  if (typeof value === "string") return (b) => b.Constant().spelling(quoted(value));
  if (Array.isArray(value)) return (b) => value.reduce((built: any, item) => built.add_elts(metadataLiteral(item)), b.List());
  return (b) => Object.entries(value).reduce((built: any, [key, item]) => built.add_items(
    (i: any) => i.key(metadataLiteral(key)).value(metadataLiteral(item))), b.Dict());
}

function renderAlias(store: Stores.Combined, match: Record<string, unknown>): void {
  const schema = match["s"] as any;
  const B = Py.LANGUAGE.Builders as any;
  const union = (schema.branches as any[]).slice(1).reduce((left: (b: any) => any, branch: any) => (b: any) => b.BinOp().left(left)
    .op("|").right(annotation(branch.type)), annotation(schema.branches[0].type));
  const metadata: Record<string, MetadataValue> = {};
  const names = (schema.branches as any[]).map((branch) => branch.name as string);
  if (names.join("\u0000") !== (schema.branches as any[]).map((branch) => convention(branch.type)).join("\u0000")) metadata["branches"] = names;
  if (schema.description !== null) metadata["description"] = schema.description;
  const described = Object.fromEntries((schema.branches as any[]).filter((branch) => branch.description !== null)
    .map((branch) => [branch.name, branch.description]));
  if (Object.keys(described).length > 0) metadata["descriptions"] = described;
  const hasMetadata = Object.keys(metadata).length > 0;
  const value = !hasMetadata ? union : (b: any) => b.Subscript().value((x: any) => name(x, "Annotated")).slice(
    (x: any) => x.Tuple().add_elts(union).add_elts(metadataLiteral(metadata)));
  const module = moduleOf(store);
  if (hasMetadata) require(module, "typing", "Annotated");
  place(module, B.TypeAlias().name((b: any) => b.id(schema.name)).value(value).create());
}

function renderVariants(kind: string) {
  return (store: Stores.Combined, match: Record<string, unknown>, args: Record<string, unknown>): void => {
    const schema = match["s"] as any;
    const B = Py.LANGUAGE.Builders as any;
    const body = [...docstring(schema.description), classText("KIND", kind)];
    let members = schema[MEMBERS[kind] as string] as any[];
    if (schema.flat) { // an intersection's parts' properties as its own, and which part each is from
      const parts = members.map((part): [string, string | string[]] => [part.name,
        part.type.name !== null ? part.type.name : [...part.type.properties.keys()]]);
      body.push(B.AnnAssign().target((b: any) => name(b, "PARTS")).annotation(
        (b: any) => b.Subscript().value((x: any) => name(x, "ClassVar")).slice((x: any) => x.Subscript().value(
          (y: any) => name(y, "dict")).slice((y: any) => y.Tuple().add_elts((z: any) => name(z, "str")).add_elts(
          (z: any) => z.BinOp().left((v: any) => name(v, "str")).op("|").right(texts(1)))))).value(
        (b: any) => parts.reduce((built: any, [part, held]) => built.add_items((i: any) => i.key(
          (k: any) => k.Constant().spelling(quoted(part))).value(typeof held === "string"
            ? (v: any) => v.Constant().spelling(quoted(held)) : (v: any) => v.Parenthesized().value(strings(held)))), b.Dict())).create());
      const described = Object.fromEntries(members.filter((part) => part.description !== null).map((part) => [part.name, part.description]));
      if (Object.keys(described).length > 0) { // the parts' own descriptions, which no field holds
        body.push(B.AnnAssign().target((b: any) => name(b, "DESCRIPTIONS")).annotation(
          (b: any) => b.Subscript().value((x: any) => name(x, "ClassVar")).slice((x: any) => x.Subscript().value(
            (y: any) => name(y, "dict")).slice((y: any) => y.Tuple().add_elts((z: any) => name(z, "str")).add_elts(
            (z: any) => name(z, "str"))))).value(metadataLiteral(described)).create());
      }
      members = members.flatMap((part) => [...(S.structure(part.type) as any).properties.values()]);
    }
    body.push(...members.map((member) => optionalField(member.name, annotation(member.type), member.description)));
    const built = B.ClassDef().name(schema.name).add_decorator_list(decorator(schema, args["frozen"] as boolean)).create();
    built.body = body;
    finish(store, built);
  };
}

function variants(kind: string, meta: any): T.Transform {
  const renderable = kind === "intersection" ? E.operation("or", variantsRenderable(kind, false), variantsRenderable(kind, true))
    : variantsRenderable(kind, false);
  return new T.Transform(kind.slice(0, 1).toUpperCase() + kind.slice(1), over({ s: meta }, renderable),
    over({ s: meta }, HAS_CLASS), {
      parameters: [(q) => q.name("frozen").of((x) => x.as_native(Boolean)).description("Whether the class is frozen")],
      rewrite: renderVariants(kind) as never,
    });
}

/** A named union as a class of a field per branch, of which one is set, as a proxy's union value reads it, its class
 * variable `KIND` `"union"`. */
export const Union = variants("union", S.OfUnion.Schema);
/** A named intersection as a class of a field per part, as a proxy's intersection value reads it, its class variable
 * `KIND` `"intersection"`. */
export const Intersection = variants("intersection", S.OfIntersection.Schema);

const [al, nm] = [E.variable("al"), E.variable("nm")];
/** Whether the module has a type alias named after `s`. */
const HAS_ALIAS = P.Exists((q) => q.symbols({ al: Py.TypeAlias.Schema, nm: Py.Name.Schema }).requires(
  P.Contains(al.children, (e) => e.property.eq("name").and_(e.child.eq(nm)))).requires(
  P.Contains(nm.children, (e) => e.property.eq("id").and_(e.child.spelling.eq(s.name)))));
/** A flat union as a type alias of its branches' types (`type Channel = Call | Mail`), as a proxy reads its value; its
 * branches' names and its description, where it has them, in `Annotated` metadata. */
export const Alias = new T.Transform("Alias", over({ s: S.OfUnion.Schema }, variantsRenderable("union", true)),
  over({ s: S.OfUnion.Schema }, HAS_ALIAS), { rewrite: renderAlias as never });

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
const ADJACENCIES = t.get("adjacencies").count();
const PROPERTIES = t.get("properties").count();
/** Whether the class `c` is `@dataclass(eq=False)`: a reference object's. */
const UNEQUAL = P.Exists((q) => q.symbols({ k: Py.Call.Schema, w: Py.Keyword.Schema }).requires(
  P.Contains(c.children, (e) => e.property.eq("decorator_list").and_(e.child.eq(k)))).requires(
  P.Contains(k.children, (e) => e.property.eq("keywords").and_(e.child.eq(w)))).requires(
  P.Contains(w.children, (e) => e.property.eq("arg").and_(e.child.spelling.eq("eq")))).requires(
  P.Contains(w.children, (e) => e.property.eq("value").and_(e.child.spelling.eq("False")))));
/** Whether the class `c` has a docstring. */
const DOCUMENTED = P.Exists((q) => q.symbols({ d: Py.Expr.Schema }).requires(
  P.Contains(c.children, (e) => e.property.eq("body").and_(e.index.eq(0n)).and_(e.child.eq(d)))).requires(
  P.Contains(d.children, (e) => e.property.eq("value").and_(e.child.kind.eq("Constant")))));
/** Whether the object schema `t` has a property or an adjacency per field. */
function counted(fields: E.Writer): E.Writer {
  return t.has("properties").and_(t.has("adjacencies")).and_(PROPERTIES.add(ADJACENCIES).eq(fields)).or_(
    t.has("properties").and_(t.has("adjacencies").not_()).and_(PROPERTIES.eq(fields))).or_(
    t.has("properties").not_().and_(t.has("adjacencies")).and_(ADJACENCIES.eq(fields))).or_(
    t.has("properties").not_().and_(t.has("adjacencies").not_()).and_(fields.eq(0n)));
}

/** Whether `t` has a property or an adjacency per field of `c`, its `SINGLETON` aside. */
const COUNTED = t.has("singleton").and_(counted(FIELDS.sub(1n))).or_(t.has("singleton").not_().and_(counted(FIELDS)));
/** Whether the class `c` has been read: an object schema named after it, a reference object's where `c` is
 * `eq=False`, described where it has a docstring, with a property or an adjacency per field; or a relation named after
 * it, with its links; or a union or an intersection named after it, with its members. */
const HAS_SCHEMA = E.operation("or",
  P.Exists((q) => q.symbols({ t: S.OfObject.Schema }).requires(
    P.Contains(c.children, (e) => e.property.eq("name").and_(e.child.spelling.eq(t.name)))).requires(
    t.has("ref").eq(UNEQUAL).and_(t.has("description").eq(DOCUMENTED))).requires(COUNTED)),
  E.operation("or", P.Exists((q) => q.symbols({ r: S.OfRelation.Schema as any }).requires(
    P.Contains(c.children, (e) => e.property.eq("name").and_(e.child.spelling.eq(r.name)))).requires(r.has("links"))),
  E.operation("or", ...[[S.OfUnion.Schema, "branches"], [S.OfIntersection.Schema, "parts"]].map(([meta, members]) =>
    P.Exists((q) => q.symbols({ t: meta as any }).requires(
      P.Contains(c.children, (e) => e.property.eq("name").and_(e.child.spelling.eq(t.name)))).requires(t.has(members as string)))))));

function spelling(node: any): string {
  return node.id.spelling;
}

/** The type an annotation `Dataclass` writes names: a basic native, a named schema, or a list or dict of them. */
function typeOf(schemas: Stores.Store, node: any, where: string, module: Py.Module): any {
  if (node instanceof Py.Name) {
    const named = spelling(node);
    return NATIVES.includes(named) ? S.OfNative.resolve((x) => x.token("basic", named)) : registered(schemas, named, module, where);
  }
  const container = node instanceof Py.Subscript && node.value instanceof Py.Name ? spelling(node.value) : null;
  if (container === "list") return new S.OfIndexed.Builder().of(typeOf(schemas, node.slice, where, module)).create();
  if (container === "dict" && node.slice instanceof Py.Tuple && node.slice.elts.length === 2) {
    const [key, item] = node.slice.elts.map((element: any) => typeOf(schemas, element, where, module));
    return new S.OfIndexed.Builder().key(key).of(item).create();
  }
  throw new ValueError(`${where}: cannot read the annotation ${Python312.print(node).trim()}`);
}

/** The schema registered as `name`, or one registered empty, to be filled when its class is read. */
/** The schema registered as `named`, or, where the module has a class of that name, one registered empty, to be filled
 * when that class is read: a union or an intersection where the class says so (`KIND`), else an object schema. A name
 * that is neither is refused: reading never makes up a schema. */
function registered(schemas: Stores.Store, named: string, module: Py.Module, where = ""): any {
  if (![...schemas.names()].includes(named)) {
    const cls = module.body.find((statement: any) => defined(statement) === named);
    if (cls === undefined) throw new ValueError(`${where}: ${named} is not a class of the module or a schema of the store`);
    if (cls instanceof Py.TypeAlias) {
      (schemas as any).register(new S.OfUnion.Builder().name(named).flat().create());
      return schemas.registered(named);
    }
    const kind = classVariables(cls).get("KIND");
    const made = kind === "union" ? new S.OfUnion.Builder().name(named).create() : kind === "intersection"
      ? new S.OfIntersection.Builder().name(named).create() : new S.OfObject.Builder().name(named).create();
    (schemas as any).register(made);
  }
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

/** The values of a class's `ClassVar`s, by name: tuples of text, or of tuples of text. */
/** The value of a literal the steps write: text, or a tuple, list or dict of literals. */
function literal(node: any): any {
  const inner = node instanceof Py.Parenthesized ? node.value : node;
  if (inner instanceof Py.Dict) return Object.fromEntries(inner.items.map((item: any) => [literal(item.key), literal(item.value)]));
  return inner instanceof Py.Tuple || inner instanceof Py.List ? inner.elts.map(literal) : unquoted(inner.spelling);
}

/** A field's metadata: `field(..., metadata={...})`'s, or none. */
function fieldMetadata(statement: any): Record<string, any> {
  if (!(statement.value instanceof Py.Call)) return {};
  const found = statement.value.keywords.find((kw: any) => kw.arg.spelling === "metadata");
  return found === undefined ? {} : literal(found.value);
}

function withDescription(builder: any, description: string | null | undefined): any {
  return description === null || description === undefined ? builder : builder.description(description);
}

/** The values of a class's `ClassVar`s, by name: text, or tuples, lists and dicts of them. */
function classVariables(cls: any): Map<string, any> {
  return new Map(cls.body.filter((statement: any) => statement instanceof Py.AnnAssign && statement.annotation instanceof Py.Subscript
    && statement.annotation.value instanceof Py.Name && spelling(statement.annotation.value) === "ClassVar")
    .map((statement: any) => [spelling(statement.target), literal(statement.value)]));
}

/** A class's fields: its annotated names but its `ClassVar`s. */
function fieldsOf(cls: any): any[] {
  const variables = classVariables(cls);
  return cls.body.filter((statement: any) => statement instanceof Py.AnnAssign && !variables.has(spelling(statement.target)));
}

/** The entry class (with `LINKS`) named `named` in the module, if any. */
function entryClass(module: Py.Module, named: string): any {
  return module.body.find((statement: any) => statement instanceof Py.ClassDef && (statement as any).name.spelling === named
    && classVariables(statement).has("LINKS"));
}

/** The names of `A | B | ...`, in order. */
function alternatives(node: any): string[] {
  if (node instanceof Py.BinOp && node.op === "|") return [...alternatives(node.left), ...alternatives(node.right)];
  return node instanceof Py.Name ? [spelling(node)] : [];
}

/** The entry class `tuple[R, ...]` holds, or null for another annotation. */
function entriesOf(node: any): string | null {
  return node instanceof Py.Subscript && node.value instanceof Py.Name && spelling(node.value) === "tuple"
    && node.slice instanceof Py.Tuple && node.slice.elts.length === 2 && node.slice.elts[0] instanceof Py.Name
    ? spelling(node.slice.elts[0]) : null;
}

/** The link an adjacency field is from: its metadata's `me`, else the one link of its entry class typed by the owner. */
function meOf(module: Py.Module, owner: string, statement: any, relation: string, where: string): string {
  const me = fieldMetadata(statement)["me"];
  if (me !== undefined) return me;
  const entry = entryClass(module, relation);
  const links: string[] = entry !== undefined ? classVariables(entry).get("LINKS") : [];
  const typed = (entry !== undefined ? fieldsOf(entry) : []).map((item: any) => [spelling(item.target), item] as [string, any])
    .filter(([link, item]) => links.includes(link) && alternatives(optional(item.annotation)).includes(owner)).map(([link]) => link);
  if (typed.length !== 1) throw new ValueError(`${where}: cannot tell which link of ${relation} it is from`);
  return typed[0] as string;
}

/** The relation registered as `name`, read from its entry class first where the module has it and it has no links. */
function relationOf(schemas: Stores.Store, module: Py.Module, named: string, where: string): any {
  if (![...schemas.names()].includes(named)) (schemas as any).register(new S.OfRelation.Builder().name(named).create());
  const relation = schemas.registered(named) as S.OfRelation.Data;
  const entry = entryClass(module, named);
  if (relation.links.length === 0 && entry !== undefined) readEntry(schemas, module, entry);
  if (relation.links.length === 0) throw new ValueError(`${where}: ${named} is not a relation the module or the store holds`);
  return relation;
}

/** Fills the relation an entry class describes: its links, its properties, its uniques and its description. */
function readEntry(schemas: Stores.Store, module: Py.Module, cls: any): void {
  const named = cls.name.spelling as string;
  if (![...schemas.names()].includes(named)) (schemas as any).register(new S.OfRelation.Builder().name(named).create());
  const variables = classVariables(cls);
  const links = variables.get("LINKS") as string[];
  const properties = fieldsOf(cls).filter((item: any) => !links.includes(spelling(item.target))).map((item: any) => {
    const type = typeOf(schemas, optional(item.annotation), `${named}.${spelling(item.target)}`, module);
    return (q: any) => withDescription(q.name(property(spelling(item.target))).of(type), fieldMetadata(item)["description"]);
  });
  let builder = ((variables.get("UNIQUES") ?? []) as string[][]).reduce((built: any, unique) => built.unique(...unique),
    new S.OfRelation.Builder(schemas.registered(named) as never).links(...links).properties(...properties));
  const described = docstringOf(cls);
  if (described !== null) builder = builder.description(described);
  builder.update();
}

/** Fills the union or intersection a class describes (`KIND`): a branch or part per field, and its description. */
function readVariants(schemas: Stores.Store, module: Py.Module, cls: any, kind: string): void {
  const named = cls.name.spelling as string;
  const typed = new Map(fieldsOf(cls).map((item: any) => [property(spelling(item.target)),
    typeOf(schemas, optional(item.annotation), `${named}.${spelling(item.target)}`, module)]));
  const notes = new Map(fieldsOf(cls).map((item: any) => [property(spelling(item.target)), fieldMetadata(item)["description"]]));
  const parts = classVariables(cls).get("PARTS") as Record<string, string | string[]> | undefined;
  const own = (classVariables(cls).get("DESCRIPTIONS") ?? {}) as Record<string, string>;
  const members = parts === undefined ? [...typed].map(([f, type]) => (q: any) => withDescription(q.name(f).of(type), notes.get(f)))
    : Object.entries(parts).map(([part, held]) => {
      const type = typeof held === "string" ? registered(schemas, held, module, `${named}.PARTS`)
        : new S.OfObject.Builder().properties(...held.map((g) => (r: any) => withDescription(r.name(g).of(typed.get(g)), notes.get(g)))).create();
      return (q: any) => withDescription(q.name(part).of(type), own[part]);
    });
  const data = registered(schemas, named, module);
  let builder: any = kind === "union" ? new S.OfUnion.Builder(data).branches(...members)
    : new S.OfIntersection.Builder(data).parts(...members).flat(parts !== undefined);
  const described = docstringOf(cls);
  if (described !== null) builder = builder.description(described);
  builder.update();
}

function docstringOf(cls: any): string | null {
  const body = [...cls.body];
  return body.length > 0 && body[0] instanceof Py.Expr && body[0].value instanceof Py.Constant ? unquoted(body[0].value.spelling as string) : null;
}

function readClass(store: Stores.Combined, match: Record<string, unknown>): void {
  const cls = match["c"] as any;
  const [schemas, module, named] = [schemasOf(store), moduleOf(store), cls.name.spelling as string];
  if (classVariables(cls).has("LINKS")) {
    readEntry(schemas, module, cls);
    return;
  }
  const kind = classVariables(cls).get("KIND");
  if (kind !== undefined) {
    readVariants(schemas, module, cls, kind);
    return;
  }
  const [properties, adjacencies]: [((q: any) => any)[], ((q: any) => any)[]] = [[], []];
  for (const statement of fieldsOf(cls)) {
    const [fieldName, where] = [property(spelling(statement.target)), `${named}.${spelling(statement.target)}`];
    const relationName = entriesOf(statement.annotation);
    const description = fieldMetadata(statement)["description"];
    if (relationName === null) {
      const type = typeOf(schemas, optional(statement.annotation), where, module);
      properties.push((q: any) => withDescription(q.name(fieldName).of(type), description));
    } else {
      const relation = relationOf(schemas, module, relationName, where);
      const me = meOf(module, named, statement, relationName, where);
      adjacencies.push((q: any) => withDescription(q.name(fieldName).of(relation).me(me), description));
    }
  }
  let builder = new S.OfObject.Builder(registered(schemas, named, module)).properties(...properties).relations(...adjacencies);
  const singleton = classVariables(cls).get("SINGLETON");
  if (singleton !== undefined) builder = builder.singleton(singleton);
  if (cls.decorator_list.some((decorated: any) => keywords(decorated).get("eq") === "False")) builder = builder.ref();
  const described = docstringOf(cls);
  if (described !== null) builder = builder.description(described);
  builder.update();
}

/** The types of `A | B | ...`, in order: names or subscripts. */
function branchesOf(node: any): any[] {
  return node instanceof Py.BinOp && node.op === "|" ? [...branchesOf(node.left), ...branchesOf(node.right)] : [node];
}

/** The name a branch has unless its alias says otherwise, from its annotation, as `convention` from its type. */
function namedConvention(node: any): string {
  const named = spelling(node instanceof Py.Subscript ? node.value : node);
  return NATIVES.includes(named) || node instanceof Py.Subscript ? named : snakeCase(named);
}

function readAlias(store: Stores.Combined, match: Record<string, unknown>): void {
  const alias = match["al"] as any;
  const [schemas, module, named] = [schemasOf(store), moduleOf(store), alias.name.id.spelling as string];
  let [value, metadata]: [any, Record<string, any>] = [alias.value, {}];
  if (value instanceof Py.Subscript && value.value instanceof Py.Name && spelling(value.value) === "Annotated") {
    const [union, held] = (value.slice as any).elts;
    value = union;
    metadata = literal(held);
  }
  const nodes = branchesOf(value);
  const names: string[] = metadata["branches"] ?? nodes.map(namedConvention);
  const notes: Record<string, string> = metadata["descriptions"] ?? {};
  let builder: any = new S.OfUnion.Builder(registered(schemas, named, module)).branches(...nodes.map((node, i) => {
    const type = typeOf(schemas, node, `${named}.${names[i]}`, module);
    return (q: any) => withDescription(q.name(names[i]).of(type), notes[names[i] as string]);
  })).flat();
  if (metadata["description"] !== undefined) builder = builder.description(metadata["description"]);
  builder.update();
}

const ALIASED = P.Exists((q) => q.symbols({ t: S.OfUnion.Schema, nm: Py.Name.Schema }).requires(
  P.Contains(al.children, (e) => e.property.eq("name").and_(e.child.eq(nm)))).requires(
  P.Contains(nm.children, (e) => e.property.eq("id").and_(e.child.spelling.eq(t.name)))).requires(t.has("branches")));
/** A type alias of the module as a flat union: a branch per type of `A | B | ...`, named after it, or as its
 * `Annotated` metadata says. */
export const FlatUnion = new T.Transform("FlatUnion", over({ al: Py.TypeAlias.Schema }, al.has("kind")),
  over({ al: Py.TypeAlias.Schema }, ALIASED), { rewrite: readAlias as never });

/** A dataclass of the module as an object schema, or an entry class (with `LINKS`) as a relation. */
export const Schema = new T.Transform("Schema", over({ c: Py.ClassDef.Schema }, DECORATED),
  over({ c: Py.ClassDef.Schema }, HAS_SCHEMA), { rewrite: readClass as never });

export const TO_PYTHON = [Dataclass, Entry, Union, Intersection, Alias];
export const FROM_PYTHON = [Schema, FlatUnion];
/** Classes that are not frozen, and every relation's entry class. */
export const PLAIN = new T.Policy(new T.Clause("Dataclass", { frozen: false }), new T.Clause("Entry"),
  new T.Clause("Union", { frozen: false }), new T.Clause("Intersection", { frozen: false }), new T.Clause("Alias"));

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
  session.run(new T.Policy(new T.Clause("Schema"), new T.Clause("FlatUnion")));
  return session;
}

/** The object schemas, then the relations, of a generation's store that no class renders, each in name order: those
 * `Dataclass` or `Entry` does not render (see their befores), whose names a field may still name (completeness, which
 * mbse-patterns plans in general). */
export function missing(session: T.Session): any[] {
  const classes = new Set(moduleOf(session.store as Stores.Combined).body.map(defined));
  return ["Schemas.Object", "Schemas.Union", "Schemas.Intersection", "Schemas.Relation"].flatMap((kind) => [...session.store.extent(kind)])
    .filter((schema: any) => !classes.has(schema.name));
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
