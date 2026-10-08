/**
 * Types: schemas as Python dataclasses, and dataclasses as schemas, step by step.
 *
 * A session (mbse-patterns' `Transforms`) runs over one store, `store(schemas, module)`: the schemas a store registers
 * and those they refer to (mbse-schemas' `Reflection.of`), Python's syntax trees (mbse-programs), and the output, whose
 * singleton `Codegen.Output` holds the module written or read. Each step is one decision:
 *
 * - `Dataclass` renders an object schema `s` as a class of the module, with a field per property, in order, each optional
 *   (`name: str | None = None`), then one per adjacency, named after it, holding its entries (`phones: tuple[Phones, ...]
 *   = ()`); its parameters `frozen` and `slots` (each a `bool`) are the decisions. It applies where `s` is named, declares no parameters, every
 *   property's type renders (a basic native, a named object schema, or a list of them without an extent, positional or
 *   keyed by a basic native, nested to any depth) and every adjacency is to a named relation. A reference object schema
 *   compares by identity (`eq=False`), a schema's description is the class's docstring, a singleton's name its
 *   class variable `SINGLETON`, and a property's or an adjacency's description its field's metadata (`"description"`). Where a schema declares
 *   adjacencies via several links of one relation (a self-relation), each field's metadata names its link (`"me"`).
 * - `Union` and `Intersection` render a named union or intersection as a value class of a dataclass field per branch or
 *   part, each optional, as a proxy's union or intersection value reads it (`card.reach.email`); its class variable
 *   `KIND` (`"union"`, `"intersection"`) says which. Their parameters `frozen` and `slots` are the decisions, as `Dataclass`'s. A flat
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
 * - `NativeAlias` and `ListAlias` render a named native or list as a type alias of what it holds (`type Word = str`,
 *   `type Names = list[Word]`), as a proxy reads its value, and a field names it.
 * - `AliasSchema` reads a type alias of the module back: a flat union of `A | B | ...`, a named native, or a named list.
 *
 * A type with no Python form is dropped by a step of its own, one transform per reason (`DROPS`: `DropInline`,
 * `DropFormat`, `DropUndeclared`), which the output records and `dropped(session)` reports; where it is held it is
 * `Any`. A type with parameters or terms is not dropped but unbuilt (`Unbuilt`): a schema holding one has no class
 * until the parametric bridge (TypeVars), and `missing(session)` reports it.
 * Each step links what it wrote, by role: a `class`, an `alias`, or, reading back, a `schema` (mbse-patterns' `Wrote`).
 * `generate(schemas, policy, earlier)` and `read(module, schemas)` run each to the end. `frozen` and `slots` are what
 * a schema does not hold: reading code back loses them, and the trace of the generation keeps them. A generation given the
 * steps of an earlier one takes each decision again where its key (`Dataclass(s=Contact)`, by the schema's name) still
 * occurs, so after a change of the schemas only a new schema asks; `session.orphans` are the decisions about schemas
 * now gone, and mbse-patterns' `Transforms.diff` compares the two.
 */

import { Expressions as E } from "@mbse/expressions";
import { Predicates as P, Transforms as T } from "@mbse/patterns";
import { Syntax as Trees } from "@mbse/programs/Framework";
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
/** What the module defines by qualified name (`Codegen.Output`): each dataclass and type alias, nested ones included;
 * derived from the module whenever the output is read, so it is never out of date. A name is unique, so a written trace
 * names a class by it (`Codegen.Output/defined[name="Contact"]`, mbse-schemas' `Paths`), wherever the class is. */
export const Defined = new S.OfRelation.Builder().name("Codegen.Defined").links("output", "node").properties(
  (p) => p.name("name").of((t) => t.as_native(String))).unique("output", "name").create();
/** What the drop steps dropped: a schema, the transform that dropped it (`DROPS`), and where in it (`""` for the
 * schema itself, else a property, branch or part, `name[item]` within a list). */
export const Dropped = new S.OfRelation.Builder().name("Codegen.Dropped").links("output", "schema").properties(
  (p) => p.name("reason").of((t) => t.as_native(String)), (p) => p.name("where").of((t) => t.as_native(String))).create();
const OutputSchema = new S.OfObject.Builder().name(OUTPUT).ref().singleton(OUTPUT).relations(
  (r) => r.name("modules").of(Generated).me("output"), (r) => r.name("defined").of(Defined).me("output"),
  (r) => r.name("dropped").of(Dropped).me("output")).create();

let outputs = 0;

/** The output of a session: the module written or read. */
export class Output {
  static Schema = OutputSchema;
  readonly #identity = `output ${++outputs}`;

  readonly dropped: [unknown, string, string][];

  constructor(public module: Py.Module | null = null, dropped: Iterable<[unknown, string, string]> = []) {
    this.dropped = [...dropped];
  }

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
  (output: Output) => new Bindings.State(new Map(), new Map([
    ["modules", (output.module === null ? [] : [output.module]).map((m) => new Bindings.Entry(new Map([["module", m]])))],
    ["defined", [...(output.module === null ? new Map<string, unknown>() : definitions(output.module))].map(
      ([named, node]) => new Bindings.Entry(new Map([["node", node]]), new Map([["name", named]])))],
    ["dropped", output.dropped.map(([schema, reason, where]) => new Bindings.Entry(new Map([["schema", schema]]),
      new Map([["reason", reason], ["where", where]])))]])),
  (state: Bindings.State) => {
    const output = new Output(...(state.entries.get("modules") ?? []).map((e) => e.links.get("module") as Py.Module));
    output.dropped.push(...(state.entries.get("dropped") ?? []).map((e) => [e.links.get("schema"), e.properties.get("reason") as string,
      e.properties.get("where") as string] as [unknown, string, string]));
    return output;
  });

/** The store a session runs over: the schemas `schemas` registers and those they refer to, Python's syntax trees, and
 * the output, which holds `module`. */
export function store(schemas: Stores.Store, module: Py.Module): Stores.Combined {
  const outputs = new Bindings.OfStore([[OutputSchema, (instance?: Output) => new Bindings.Builder(BINDING, instance)]],
    [Generated, Defined, Dropped]);
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

/** Whether a native's token is one Python's types hold: a basic one, or `python3`'s of the same name. */
function pythonic(native: E.Writer): E.Writer {
  return native.get("format").eq("basic").or_(native.get("format").eq("python3").and_(
    NATIVES.map((named) => native.get("token").eq(named)).reduce((either, other) => either.or_(other))));
}

/** Whether a list's extent, if it has one, is of int bounds, which `Annotated` metadata holds. */
function bounded(indexed: E.Writer): E.Writer {
  return indexed.has("extent").not_().or_(indexed.get("extent").has("terms").not_());
}

function over(symbols: Record<string, S.OfObject.Data>, constraint: unknown) {
  return new P.OfPredicate.Builder().symbols(symbols).requires(constraint as never).create();
}

// --- Drops: what has no Python form, and why ---

/** Why a type has no Python form, by the transform that drops it (CODEGEN.md, Resolved; each an open question). A type
 * dropped where it is held is `Any` there, and the schema holding it keeps its class; a named native of another format
 * has no alias, and every reference to it is `Any`. */
export const DROPS: Record<string, string> = {
  DropInline: "an inline schema: a Python class needs a name, which is the schema's to give",
  DropFormat: "a native of another format: only Python's and basic natives are supported",
  DropUndeclared: "a link no object schema declares, which has no type",
};

/** Why a named schema has no Python form at all: a native of another format; none for any other. */
function itself(schema: any): string[] {
  return schema instanceof S.OfNative.Data && ![S.BASIC, S.PYTHON3].includes((schema.token as S.OfNative.Token).format) ? ["DropFormat"] : [];
}

/** Why a type, where it is held, has no Python form: an inline object, union, intersection or relation, or an inline
 * native of another format. A named schema is not dropped where it is held: a reference to one dropped as a whole is
 * `Any` (see `demoted`), and its own step says why. */
function held(type: any): string[] {
  if (type.name !== null) return [];
  if (type instanceof S.OfObject.Data || type instanceof S.OfUnion.Data || type instanceof S.OfIntersection.Data
    || type instanceof S.OfRelation.Data) return ["DropInline"];
  return itself(type);
}

/** Whether a type is written as `Any`: dropped where it is held, or a reference to a schema dropped as a whole. */
function demoted(type: any): boolean {
  return (type.name !== null ? itself(type) : held(type)).length > 0;
}

/** The drops of a type held at `where`, by reason, and of the types an inline list it is holds. */
function dropsAt(type: any, where: string): [string, string][] {
  const reasons = held(type);
  if (reasons.length > 0) return reasons.map((reason) => [reason, where]);
  if (type instanceof S.OfIndexed.Data && type.name === null) {
    return [...dropsAt(type.item, `${where}[item]`), ...(type.key === null ? [] : dropsAt(type.key, `${where}[key]`))];
  }
  return [];
}

/** What of a named schema has no Python form, by reason and place: the schema itself (`""`), or a property, an
 * adjacency, a link, a branch, a part, or a list's item or key, where the schema itself has a form. */
function drops(store: any, schema: any): [string, string][] {
  const whole = itself(schema);
  if (whole.length > 0) return whole.map((reason) => [reason, ""]);
  if (schema instanceof S.OfIndexed.Data) return [...dropsAt(schema.item, "item"), ...(schema.key === null ? [] : dropsAt(schema.key, "key"))];
  const properties = (owner: any): [string, string][] => [...owner.properties].flatMap(([named, prop]: [string, any]) => dropsAt(prop.type, named));
  if (schema instanceof S.OfRelation.Data) {
    const objects = [...store.extent("Schemas.Object")];
    return [...properties(schema), ...schema.links.filter((link) => declarers(objects, schema, link).length === 0)
      .map((link) => ["DropUndeclared", link] as [string, string])];
  }
  if (schema instanceof S.OfObject.Data) {
    return [...properties(schema), ...[...schema.adjacencies].filter(([, adjacency]) => (adjacency.relation as any).name === null)
      .map(([named]) => ["DropInline", named] as [string, string])];
  }
  const members = (schema instanceof S.OfUnion.Data ? schema.branches : schema.parts) as any[];
  if (schema instanceof S.OfIntersection.Data && schema.flat) {
    return members.filter((part) => part.type.name === null).flatMap((part) => [...part.type.properties].flatMap(
      ([named, prop]: [string, any]) => dropsAt(prop.type, `${part.name}.${named}`)));
  }
  return members.flatMap((member) => dropsAt(member.type, member.name));
}

/** Whether a native, as reflected, is of another format than Python's and basic. */
function foreign(native: E.Writer): E.Writer {
  return native.get("format").eq("basic").not_().and_(native.get("format").eq("python3").not_());
}

/** Whether the type `type`, where it is held, is dropped for `reason` (as `held`). */
function at(reason: string, type: E.Writer): E.Writer {
  if (reason === "DropInline") return type.has("object").or_(type.has("union")).or_(type.has("intersection"));
  return type.has("native").and_(foreign(type.get("native")));
}

/** Whether a type `t` is dropped for `reason` where it is held, or holds one that is within an inline list, at any
 * depth (as `dropsAt`). It applies itself to the list's item and key. */
function somewhere(reason: string): P.OfPredicate {
  const found = new P.OfPredicate.Builder().name(`Codegen.${reason}`).parameters((q) => q.name("t")).create();
  const indexed = t.get("indexed");
  new P.OfPredicate.Builder(found).requires(at(reason, t).or_(t.has("indexed").and_(E.operation("or",
    found.call(indexed.get("item")) as never, indexed.has("key").and_(found.call(indexed.get("key")) as never))))).update();
  return found;
}

const SOMEWHERE: Record<string, P.OfPredicate> = { DropInline: somewhere("DropInline"), DropFormat: somewhere("DropFormat") };

/** Whether the schema `z` of `kind` holds a type dropped for `reason` (as `drops`); null where it never does. */
function heldAt(reason: string, kind: string, z: E.Writer): E.Writer | null {
  if (reason === "DropUndeclared") {
    return kind === "relation" ? z.get("links").any("l", E.operation("not", P.Exists((q) => q.symbols({ y: S.OfObject.Schema })
      .requires(declares(y, l))) as never)) : null;
  }
  const found = SOMEWHERE[reason] as P.OfPredicate;
  const each = (listed: string) => z.has(listed).and_(z.get(listed).any("p", found.call(p.get("type")) as never));
  if (kind === "object" || kind === "relation") {
    const properties = each("properties");
    const inline = z.has("adjacencies").and_(z.get("adjacencies").any("a", a.get("relation").has("relation")));
    return kind === "object" && reason === "DropInline" ? properties.or_(inline) : properties;
  }
  if (kind === "union") return each("branches");
  if (kind === "intersection") {
    const flat = z.get("parts").any("p", p.get("type").has("object").and_(p.get("type").get("object").has("properties")).and_(
      p.get("type").get("object").get("properties").any("q", found.call(E.variable("q").get("type")) as never)));
    return z.has("flat").not_().and_(each("parts")).or_(z.has("flat").and_(z.has("parts")).and_(flat));
  }
  if (kind === "list") return E.operation("or", found.call(z.get("item")) as never, z.has("key").and_(found.call(z.get("key")) as never));
  return null;
}

function dropping(reason: string) {
  return (store: Stores.Combined, match: Record<string, unknown>): void => {
    const schema = Object.values(match)[0];
    (store.singleton(OUTPUT) as unknown as Output).dropped.push(...drops(store, schema).filter(([found]) => found === reason)
      .map(([found, where]) => [schema, found, where] as [unknown, string, string]));
  };
}

const DROP_KINDS: [string, any][] = [["object", S.OfObject.Schema], ["relation", S.OfRelation.Schema], ["union", S.OfUnion.Schema],
  ["intersection", S.OfIntersection.Schema], ["native", S.OfNative.Schema], ["list", S.OfIndexed.Schema]];

/** A transform per reason and kind of schema it applies to, named after the reason: before, a named native of another
 * format (`DropFormat` as a whole), or a schema holding a type dropped for the reason; after, the output records it
 * (`Codegen.Dropped`). */
function dropTransforms(): T.Transform[] {
  const made: T.Transform[] = [];
  for (const reason of Object.keys(DROPS)) {
    for (const [kind, meta] of DROP_KINDS) {
      const symbol = kind === "relation" ? "r" : "s";
      const z = E.variable(symbol);
      const whole = kind === "native" && reason === "DropFormat" ? foreign(z) : null;
      const inside = heldAt(reason, kind, z);
      if (whole === null && inside === null) continue;
      const recorded = P.Exists((q) => q.symbols({ o: OutputSchema }).requires(E.quantifier("any", "e", E.operation("entries", o, "dropped"),
        E.variable("e").get("schema").eq(z).and_(E.variable("e").get("reason").eq(reason))) as never));
      made.push(new T.Transform(reason, over({ [symbol]: meta }, z.has("name").and_((inside ?? whole) as E.Writer)),
        over({ [symbol]: meta }, recorded), { rewrite: dropping(reason) as never }));
    }
  }
  return made;
}

// --- Parameters and terms: not built yet ---

/** Whether a type `t` has parameters or terms, whose Python form (TypeVars) is not built yet, there or within an inline
 * list it is: an application, a native or a list declaring parameters, a width or an extent that is a term, or a
 * reference to a named schema that declares parameters, has such a width or extent, or is an application. A schema
 * holding one has no class or alias yet, and `missing` reports it: it is not dropped (CODEGEN.md, Resolved). */
export const Unbuilt = new P.OfPredicate.Builder().name("Codegen.Unbuilt").parameters((q) => q.name("t")).create();

function namedUnbuilt(type: E.Writer): unknown {
  const kinds: [any, (z: E.Writer) => E.Writer][] = [[S.OfObject.Schema, (z) => z.has("parameters")],
    [S.OfUnion.Schema, (z) => z.has("parameters")], [S.OfIntersection.Schema, (z) => z.has("parameters")],
    [S.OfApply.Schema, (z) => z.has("name")], [S.OfNative.Schema, (z) => z.has("parameters").or_(z.has("terms"))],
    [S.OfIndexed.Schema, (z) => z.has("parameters").or_(bounded(z).not_())]];
  const found = kinds.map(([meta, more]) => P.Exists((q) => q.symbols({ x: meta }).requires(x.get("name").eq(
    type.get("named").get("name"))).requires(more(x))) as unknown);
  return E.operation("and", type.has("named"), found.reduce((either, other) => E.operation("or", either as never, other as never)) as never);
}

new P.OfPredicate.Builder(Unbuilt).requires(t.has("apply").or_(
  t.has("native").and_(t.get("native").has("parameters").or_(t.get("native").has("terms")))).or_(
  t.has("indexed").and_(t.get("indexed").has("parameters").or_(bounded(t.get("indexed")).not_()))).or_(
  namedUnbuilt(t) as never).or_(t.has("indexed").and_(E.operation("or", Unbuilt.call(t.get("indexed").get("item")) as never,
    t.get("indexed").has("key").and_(Unbuilt.call(t.get("indexed").get("key")) as never))))).update();

/** Whether none of the types `z` holds under `listed` is unbuilt (see `Unbuilt`). */
function built(listed: string, z: E.Writer): E.Writer {
  return z.has(listed).not_().or_(z.get(listed).all("p", E.operation("not", Unbuilt.call(p.get("type")) as never)));
}

const l = E.variable("l");

/** Whether `schema` declares an adjacency to the relation `r` via `link`. */
function declares(schema: E.Writer, link: E.Writer): E.Writer {
  return schema.has("adjacencies").and_(schema.get("adjacencies").any("b", b.get("relation").has("named").and_(
    b.get("relation").get("named").get("name").eq(r.get("name"))).and_(b.get("me").eq(link))));
}

const PARAMETRIC_RELATION = P.Exists((q) => q.symbols({ r: S.OfRelation.Schema as any }).requires(
  r.get("name").eq(a.get("relation").get("named").get("name"))).requires(r.has("parameters")));
/** Whether `Dataclass` renders the object schema `s`: named, without parameters, and holding no type that is unbuilt
 * (see `Unbuilt`), nor an adjacency to a relation that declares parameters. A type that is dropped is `Any` (see
 * Drops), so it keeps no class from being written. */
const RENDERABLE = s.has("name").and_(s.has("parameters").not_()).and_(built("properties", s)).and_(
  s.has("adjacencies").not_().or_(s.get("adjacencies").all("a", E.operation("not", E.operation(
    "and", a.get("relation").has("named"), PARAMETRIC_RELATION as never)) as never)));
/** Whether `Entry` renders the relation `r`: named, without parameters, holding no type that is unbuilt, and no link
 * declared by an object schema that declares parameters. */
const ENTRY_RENDERABLE = r.has("name").and_(r.has("parameters").not_()).and_(built("properties", r)).and_(
  r.get("links").all("l", E.operation("not", P.Exists((q) => q.symbols({ y: S.OfObject.Schema }).requires(
    declares(y, l)).requires(y.has("parameters"))) as never)));
const o = E.variable("o");
/** Whether the module defines a class named after `s`, by its qualified name. */
const HAS_CLASS = P.Exists((q) => q.symbols({ o: OutputSchema }).requires(
  P.Contains(o.get("defined"), (e) => e.get("name").eq(s.name).and_(e.get("node").get("kind").eq("ClassDef")))));

function name(builder: any, spelling: string): any {
  return builder.Name().id(spelling);
}

/** The annotation of a type: `Any` for one dropped (see Drops), a named schema by its name, a dotted one as attributes
 * (`Codegen.Output`, a nested class), or what it holds, in `Annotated` with what that cannot say. */
function annotation(type: any): (b: any) => any {
  if (demoted(type)) return (b) => name(b, "Any");
  return type.name !== null ? (b) => dotted(b, type.name) : annotated(structureAnnotation(type), facets(type));
}

/** What a native's or a list's annotation cannot say, as `Annotated` metadata: a native's token where it is not
 * `basic` (`"native": ["python3", "int"]`) and its width in bits or bytes, a list's extent, its `minimum` and its
 * `maximum` where it has one, and its description. */
function facets(type: any): Record<string, MetadataValue> {
  const found: Record<string, MetadataValue> = {};
  if (type instanceof S.OfNative.Data) {
    const token = type.token as S.OfNative.Token;
    if (token.format !== S.BASIC) found["native"] = [token.format, token.name];
    for (const unit of ["bits", "bytes"]) if ((type as any)[unit] !== null) found[unit] = (type as any)[unit];
  } else if (type instanceof S.OfIndexed.Data && type.extent !== null) {
    found["minimum"] = type.extent.minimum as bigint;
    if (type.extent.maximum !== null) found["maximum"] = type.extent.maximum as bigint;
  }
  if (type.description !== null) found["description"] = type.description;
  return found;
}

/** `held`, or `Annotated[held, {...}]` where there are facets. */
function annotated(held: (b: any) => any, found: Record<string, MetadataValue>): (b: any) => any {
  return Object.keys(found).length === 0 ? held : (b: any) => b.Subscript().value((x: any) => name(x, "Annotated")).slice(
    (x: any) => x.Tuple().add_elts(held).add_elts(metadataLiteral(found)));
}

/** mbse-schemas' keyed list, which generated code holds where a `dict` cannot compare keys as schema equality does. */
export const MAP = "Proxies.OfIndexed.Map";

/** Whether a list keyed by `key` is a `Proxies.OfIndexed.Map`, not a `dict`: a key that is not a native, or a `float`,
 * whose NaNs and `-0.0` a `dict` compares otherwise (mbse-schemas' EQUALITY.md). */
function mapped(key: any): boolean {
  const structure = S.structure(key) as any;
  return !(structure instanceof S.OfNative.Data) || (structure.token as S.OfNative.Token).name === "float";
}

/** `a.b.c` as names and attributes. */
function dotted(builder: any, text: string): any {
  const parts = text.split(".");
  const last = parts.pop() as string;
  return parts.length > 0 ? builder.Attribute().value((x: any) => dotted(x, parts.join("."))).attr(last) : name(builder, last);
}

/** The annotation of what a type holds, its name aside: a native's, or a list's of its items, keyed by a `dict` or,
 * where a `dict` cannot compare its keys as schema equality does, a `Proxies.OfIndexed.Map`. */
function structureAnnotation(type: any): (b: any) => any {
  if (type instanceof S.OfIndexed.Data && type.key !== null) {
    return (b) => b.Subscript().value((x: any) => dotted(x, mapped(type.key) ? MAP : "dict")).slice(
      (x: any) => x.Tuple().add_elts(annotation(type.key)).add_elts(annotation(type.item)));
  }
  if (type instanceof S.OfIndexed.Data) {
    return (b) => b.Subscript().value((x: any) => name(x, "list")).slice(annotation(type.item));
  }
  return (b) => name(b, type.token.name);
}

/** A property's name as a field's: a keyword with a trailing underscore. */
function field(named: string): string {
  return KEYWORDS.includes(named) ? `${named}_` : named;
}

/** A string literal of `text`, in double quotes. */
function quoted(text: string): string {
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

/** The modules the steps import from, in the order their imports come. */
const SOURCES = ["__future__", "dataclasses", "typing", "mbse.Schemas.Framework"];

/** Imports `named` from `source`, once, after `from __future__ import annotations`, the imports in the order of
 * `SOURCES`, whichever step needs them first. */
function require(module: Py.Module, source: string, named: string): void {
  const B = Py.LANGUAGE.Builders as any;
  let imports = module.body.filter((statement) => statement instanceof Py.ImportFrom) as any[];
  if (imports.length === 0) {
    imports = [B.ImportFrom().module((d: any) => d.add_names("__future__")).add_names(
      (alias: any) => alias.name((d: any) => d.add_names("annotations"))).create()];
    module.body.splice(0, 0, imports[0]);
  }
  let found = imports.find((statement) => dottedName(statement.module) === source);
  if (found === undefined) {
    found = B.ImportFrom().module((d: any) => source.split(".").reduce((built: any, part) => built.add_names(part), d)).create();
    module.body.splice(imports.filter((statement) => SOURCES.indexOf(dottedName(statement.module)) < SOURCES.indexOf(source)).length, 0, found);
  }
  const names = found.names.map((alias: any) => alias.name.names[0].spelling as string);
  if (!names.includes(named)) { // in name order, whichever step needs it first
    found.names.splice(names.filter((other: string) => other < named).length, 0, B.Alias().name((d: any) => d.add_names(named)).create());
  }
}

/** A `DottedName`'s text. */
function dottedName(named: any): string {
  return named.names.map((part: any) => part.spelling).join(".");
}

const FROZEN = (q: any) => q.name("frozen").of((x: any) => x.as_native(Boolean)).description("Whether the class is frozen");
const SLOTS = (q: any) => q.name("slots").of((x: any) => x.as_native(Boolean)).description(
  "Whether the class has slots: fixed attributes, no `__dict__`, smaller and faster");

/** `@dataclass`, with `eq=False` for a reference object's class (or an entry's), `frozen=True` and `slots=True` as the
 * step decided. */
function decorator(schema: any, frozen: boolean, slots: boolean): (b: any) => any {
  const keywords = ([["eq", schema.ref === true || schema instanceof S.OfRelation.Data], ["frozen", frozen], ["slots", slots]] as [string, boolean][])
    .filter(([, on]) => on) // a union or intersection is a value
    .map(([key]) => [key, key === "eq" ? "False" : "True"]);
  if (keywords.length === 0) return (b) => name(b, "dataclass");
  return (b) => keywords.reduce((built, [a, v]) => built.add_keywords((w: any) => w.arg(a).value((x: any) => x.Constant().spelling(v))),
    b.Call().func((x: any) => name(x, "dataclass")));
}

/** `A | B | ...` of the names, in order. */
function union(names: string[]): (b: any) => any {
  return names.slice(1).reduce((left: (b: any) => any, named) => (b: any) => b.BinOp().left(left).op("|").right(
    (x: any) => dotted(x, named)), (b: any) => dotted(b, names[0] as string));
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

/** Imports `Annotated`, `Any` and mbse-schemas' `Proxies` where `built` uses them. */
function annotations(module: Py.Module, built: any): void {
  const used = new Set([...Trees.walk(built)].filter((node) => node instanceof Py.Name).map((node) => spelling(node)));
  for (const named of ["Annotated", "Any"]) if (used.has(named)) require(module, "typing", named);
  if (used.has("Proxies")) require(module, "mbse.Schemas.Framework", "Proxies");
}

/** `NAME: ClassVar[str] = "text"`. */
function classText(named: string, text: string): any {
  return (Py.LANGUAGE.Builders as any).AnnAssign().target((b: any) => name(b, named)).annotation(
    (b: any) => b.Subscript().value((x: any) => name(x, "ClassVar")).slice((x: any) => name(x, "str"))).value(
    (b: any) => b.Constant().spelling(quoted(text))).create();
}

/** Places a class in the module, with the imports it needs: `dataclass`, `field`, `ClassVar` and `Annotated` where
 * it uses them; what the step wrote, by role: the class. */
function finish(store: Stores.Combined, built: any): Map<string, unknown> {
  const module = moduleOf(store);
  require(module, "dataclasses", "dataclass");
  annotations(module, built);
  const assigned = (built.body as any[]).filter((statement) => statement instanceof Py.AnnAssign);
  if (assigned.some((statement) => statement.value instanceof Py.Call)) require(module, "dataclasses", "field");
  if (assigned.some((statement) => statement.annotation instanceof Py.Subscript && spelling(statement.annotation.value) === "ClassVar")) {
    require(module, "typing", "ClassVar");
  }
  place(module, built);
  return new Map([["class", built]]);
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

function render(store: Stores.Combined, match: Record<string, unknown>, args: Record<string, unknown>): Map<string, unknown> {
  const schema = match["s"] as S.OfObject.Data;
  const B = Py.LANGUAGE.Builders as any;
  const body: any[] = [...docstring(schema.description), ...(schema.singleton === null ? [] : [classText("SINGLETON", schema.singleton)]),
    ...[...schema.properties].map(([named, property]) => optionalField(named, annotation(property.type), property.description))];
  for (const [named, adjacency] of schema.adjacencies) {
    const relation = adjacency.relation as S.OfRelation.Data;
    const entries = (b: any) => b.Subscript().value((x: any) => name(x, "tuple")).slice((x: any) => x.Tuple().add_elts(
      (y: any) => dotted(y, relation.name === null || itself(relation).length > 0 ? "Any" : relation.name)).add_elts(
      (y: any) => y.Constant().spelling("...")));
    const metadata: Record<string, MetadataValue> = adjacency.description === null ? {} : { description: adjacency.description };
    if (new Set([...schema.adjacencies.values()].filter((other) => other.relation === relation).map((other) => other.me)).size > 1) {
      metadata["me"] = adjacency.me; // which link, where ambiguous
    }
    body.push(B.AnnAssign().target((b: any) => name(b, field(named))).annotation(entries).value(
      defaultOf((b: any) => b.Tuple(), metadata)).create());
  }
  const built = B.ClassDef().name(schema.name).add_decorator_list(decorator(schema, args["frozen"] as boolean, args["slots"] as boolean)).create();
  built.body = body.length > 0 ? body : [B.Pass().create()];
  return finish(store, built);
}

function renderEntry(store: Stores.Combined, match: Record<string, unknown>, args: Record<string, unknown>): Map<string, unknown> {
  const relation = match["r"] as S.OfRelation.Data;
  const B = Py.LANGUAGE.Builders as any;
  const objects = [...store.extent("Schemas.Object")] as any[];
  const uniques = relation.uniques.map((unique) => [...unique].sort().join("\u0000")).sort().map((unique) => unique.split("\u0000"));
  const body = [...docstring(relation.description), classVariable("LINKS", 1, [...relation.links]),
    ...(uniques.length > 0 ? [classVariable("UNIQUES", 2, uniques)] : []),
    ...relation.links.map((link) => {
      const declaring = declarers(objects, relation, link).filter((o) => itself(o).length === 0).map((o) => o.name);
      return optionalField(link, union(declaring.length > 0 ? declaring : ["Any"]));
    }),
    ...[...relation.properties].map(([named, property]) => optionalField(named, annotation(property.type), property.description))];
  const built = B.ClassDef().name(relation.name).add_decorator_list(decorator(relation, false, args["slots"] as boolean)).create();
  built.body = body;
  return finish(store, built);
}

/** The name a class or a type alias defines, or null for another statement. */
function defined(statement: any): string | null {
  if (statement instanceof Py.ClassDef) return (statement as any).name.spelling;
  return statement instanceof Py.TypeAlias ? (statement as any).name.id.spelling : null;
}

/** Whether a statement is a class decorated `@dataclass` or `@dataclass(...)`. */
function isDataclass(statement: any): boolean {
  return statement instanceof Py.ClassDef && (statement as any).decorator_list.some((d: any) =>
    (d instanceof Py.Name && spelling(d) === "dataclass") || (d instanceof Py.Call && d.func instanceof Py.Name && spelling(d.func) === "dataclass"));
}

/** The dataclasses and type aliases of the module by qualified name, nested ones within the classes that hold them
 * (`Codegen.Output` within `class Codegen`), in the order they come; a class that only holds others is no
 * definition of its own. */
function definitions(module: Py.Module): Map<string, any> {
  const found = new Map<string, any>();
  const visit = (statements: any[], prefix: string): void => {
    for (const statement of statements) {
      const named = defined(statement);
      if (named !== null && (isDataclass(statement) || statement instanceof Py.TypeAlias)) found.set(prefix + named, statement);
      if (statement instanceof Py.ClassDef) visit((statement as any).body, `${prefix}${named}.`);
    }
  };
  visit(module.body, "");
  return found;
}

/** The qualified name of a dataclass or a type alias of the module (`Codegen.Output`). */
function qualified(module: Py.Module, statement: unknown): string {
  return [...definitions(module)].find(([, found]) => found === statement)![0];
}

/** Gives a class or a type alias the name `spelling`. */
function rename(statement: any, spelled: string): void {
  const named = (Py.LANGUAGE.Builders as any).Identifier().spelling(spelled).create();
  if (statement instanceof Py.ClassDef) (statement as any).name = named;
  else statement.name.id = named;
}

/** Inserts a class or a type alias among the definitions of a module's or a class's body, in name order, after what
 * else the body holds (imports, a docstring, fields); a body that was only `pass` holds it instead. */
function insert(body: any[], built: any): void {
  if (body.length === 1 && body[0] instanceof Py.Pass) body.splice(0, 1);
  const named = defined(built) as string;
  const after = body.findIndex((statement: any) => (defined(statement) ?? "") > named);
  body.splice(after < 0 ? body.length : after, 0, built);
}

/** Moves a definition held under `prefix` to module level, named by its qualified name, which validation flags: a
 * class that only holds others moves what it holds instead. */
function unnest(module: Py.Module, statement: any, prefix: string): void {
  if (statement instanceof Py.ClassDef && !isDataclass(statement)) {
    for (const nested of (statement as any).body) unnest(module, nested, `${prefix}.${defined(statement)}`);
    return;
  }
  rename(statement, `${prefix}.${defined(statement)}`);
  insert(module.body, statement);
}

/** Places a class or a type alias, named as its schema is, in the module, so that the module does not depend on the
 * order of the steps: a dotted name (`Codegen.Output`) as a class nested in the class of its prefix, the prefix's own
 * dataclass where it has one (a class written later takes in those nested in its place), else a class that only holds
 * others. A prefix that is a type alias cannot hold a class: the class stays at module level, named as given, which
 * validation flags. */
function place(module: Py.Module, built: any): void {
  const prefix = (defined(built) as string).split(".");
  const last = prefix.pop() as string;
  let body: any[] = module.body;
  for (const part of prefix) {
    let held = body.find((statement: any) => defined(statement) === part);
    if (held instanceof Py.TypeAlias) {
      insert(module.body, built);
      return;
    }
    if (held === undefined) {
      held = (Py.LANGUAGE.Builders as any).ClassDef().name(part).create();
      held.body = [];
      insert(body, held);
    }
    body = held.body;
  }
  rename(built, last);
  const holder = body.find((statement: any) => defined(statement) === last && statement instanceof Py.ClassDef && !isDataclass(statement));
  if (holder !== undefined) {
    body.splice(body.indexOf(holder), 1);
    for (const nested of holder.body) {
      if (built instanceof Py.ClassDef) insert((built as any).body, nested);
      else unnest(module, nested, [...prefix, last].join(".")); // an alias cannot hold them: at module level, named as given, as if the alias had come first
    }
  }
  insert(body, built);
}

/** An object schema as a dataclass of the module. */
export const Dataclass = new T.Transform("Dataclass", over({ s: S.OfObject.Schema }, RENDERABLE),
  over({ s: S.OfObject.Schema }, HAS_CLASS), {
    parameters: [FROZEN, SLOTS],
    rewrite: render as never,
  });

/** A relation as the class of its entries: a field per link, typed by the object schemas that declare it, then one per
 * property, and class variables `LINKS` and `UNIQUES` that say which fields are links and what is unique. */
export const Entry = new T.Transform("Entry", over({ r: S.OfRelation.Schema as any }, ENTRY_RENDERABLE),
  over({ r: S.OfRelation.Schema as any }, P.Exists((q) => q.symbols({ o: OutputSchema }).requires(
    P.Contains(o.get("defined"), (e) => e.get("name").eq(r.name).and_(e.get("node").get("kind").eq("ClassDef")))))),
  { parameters: [SLOTS], rewrite: renderEntry as never });

/** Where a union's and an intersection's members are, in their module form and their data. */
const MEMBERS: Record<string, string> = { union: "branches", intersection: "parts" };

function variantsRenderable(kind: string, flat: boolean): E.Writer {
  const members = MEMBERS[kind] as string;
  const flatness = flat ? s.has("flat") : s.has("flat").not_();
  let whole = built(members, s);
  if (kind === "intersection" && flat) { // an inline part's properties are the class's own
    whole = whole.and_(s.get(members).all("p", p.get("type").has("object").not_().or_(built("properties", p.get("type").get("object")))));
  }
  return s.has("name").and_(s.has("parameters").not_()).and_(flatness).and_(s.has(members)).and_(whole);
}

/** The name a flat union's branch has unless its alias says otherwise: its type's, as Python writes it. */
function convention(type: any): string {
  if (type.name !== null) return snakeCase(type.name);
  if (type instanceof S.OfIndexed.Data) return type.key === null ? "list" : "dict";
  return type.token.name;
}

function snakeCase(named: string): string {
  return named.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase();
}

type MetadataValue = string | bigint | MetadataValue[] | { [key: string]: MetadataValue };

/** A dict literal of text, lists of text and dicts of them. */
function metadataLiteral(value: MetadataValue): (b: any) => any {
  if (typeof value === "string") return (b) => b.Constant().spelling(quoted(value));
  if (typeof value === "bigint") return (b) => b.Constant().spelling(String(value));
  if (Array.isArray(value)) return (b) => value.reduce((built: any, item) => built.add_elts(metadataLiteral(item)), b.List());
  return (b) => Object.entries(value).reduce((built: any, [key, item]) => built.add_items(
    (i: any) => i.key(metadataLiteral(key)).value(metadataLiteral(item))), b.Dict());
}

function renderAlias(store: Stores.Combined, match: Record<string, unknown>): Map<string, unknown> {
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
  const module = moduleOf(store);
  const alias = B.TypeAlias().name((b: any) => b.id(schema.name)).value(annotated(union, metadata)).create();
  annotations(module, alias);
  place(module, alias);
  return new Map([["alias", alias]]);
}

function renderVariants(kind: string) {
  return (store: Stores.Combined, match: Record<string, unknown>, args: Record<string, unknown>): Map<string, unknown> => {
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
    const built = B.ClassDef().name(schema.name).add_decorator_list(decorator(schema, args["frozen"] as boolean, args["slots"] as boolean)).create();
    built.body = body;
    return finish(store, built);
  };
}

function variants(kind: string, meta: any): T.Transform {
  const renderable = kind === "intersection" ? E.operation("or", variantsRenderable(kind, false), variantsRenderable(kind, true))
    : variantsRenderable(kind, false);
  return new T.Transform(kind.slice(0, 1).toUpperCase() + kind.slice(1), over({ s: meta }, renderable),
    over({ s: meta }, HAS_CLASS), {
      parameters: [FROZEN, SLOTS],
      rewrite: renderVariants(kind) as never,
    });
}

/** A named union as a class of a field per branch, of which one is set, as a proxy's union value reads it, its class
 * variable `KIND` `"union"`. */
export const Union = variants("union", S.OfUnion.Schema);
/** A named intersection as a class of a field per part, as a proxy's intersection value reads it, its class variable
 * `KIND` `"intersection"`. */
export const Intersection = variants("intersection", S.OfIntersection.Schema);

const al = E.variable("al");
/** Whether the module has a type alias named after `s`. */
const HAS_ALIAS = P.Exists((q) => q.symbols({ o: OutputSchema }).requires(
  P.Contains(o.get("defined"), (e) => e.get("name").eq(s.name).and_(e.get("node").get("kind").eq("TypeAlias")))));
/** A flat union as a type alias of its branches' types (`type Channel = Call | Mail`), as a proxy reads its value; its
 * branches' names and its description, where it has them, in `Annotated` metadata. */
export const Alias = new T.Transform("Alias", over({ s: S.OfUnion.Schema }, variantsRenderable("union", true)),
  over({ s: S.OfUnion.Schema }, HAS_ALIAS), { rewrite: renderAlias as never });

/** A named native or list as a type alias of what it holds, what that annotation cannot say (a width, an extent, a
 * description) in `Annotated` metadata. */
function renderNamed(store: Stores.Combined, match: Record<string, unknown>): Map<string, unknown> {
  const schema = match["s"] as any;
  const module = moduleOf(store);
  const alias = (Py.LANGUAGE.Builders as any).TypeAlias().name((b: any) => b.id(schema.name)).value(
    annotated(structureAnnotation(schema), facets(schema))).create();
  annotations(module, alias);
  place(module, alias);
  return new Map([["alias", alias]]);
}

const NAMED = s.has("name").and_(s.has("parameters").not_());
/** A named native Python's types hold (see `pythonic`) as a type alias of Python's type for it (`type Word = str`), as
 * a proxy reads its value. */
export const NativeAlias = new T.Transform("NativeAlias", over({ s: S.OfNative.Schema as any }, NAMED.and_(pythonic(s)).and_(
  s.has("terms").not_())),
  over({ s: S.OfNative.Schema as any }, HAS_ALIAS), { rewrite: renderNamed as never });
/** A named list as a type alias of `list[T]` or `dict[K, T]` (`type Names = list[str]`), as a proxy reads its value. */
export const ListAlias = new T.Transform("ListAlias", over({ s: S.OfIndexed.Schema as any }, NAMED.and_(bounded(s)).and_(
  E.operation("not", Unbuilt.call(s.get("item")) as never)).and_(s.has("key").not_().or_(E.operation("not", Unbuilt.call(s.get("key")) as never)))),
  over({ s: S.OfIndexed.Schema as any }, HAS_ALIAS), { rewrite: renderNamed as never });

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
/** Whether the class `c` is named after the schema `t`, by its qualified name. */
const C_IS_T = P.Exists((q) => q.symbols({ o: OutputSchema }).requires(
  P.Contains(o.get("defined"), (e) => e.get("node").eq(c).and_(e.get("name").eq(t.name)))));
const C_IS_R = P.Exists((q) => q.symbols({ o: OutputSchema }).requires(
  P.Contains(o.get("defined"), (e) => e.get("node").eq(c).and_(e.get("name").eq(r.name)))));
const HAS_SCHEMA = E.operation("or",
  P.Exists((q) => q.symbols({ t: S.OfObject.Schema }).requires(C_IS_T).requires(
    t.has("ref").eq(UNEQUAL).and_(t.has("description").eq(DOCUMENTED))).requires(COUNTED)),
  E.operation("or", P.Exists((q) => q.symbols({ r: S.OfRelation.Schema as any }).requires(C_IS_R).requires(r.has("links"))),
  E.operation("or", ...[[S.OfUnion.Schema, "branches"], [S.OfIntersection.Schema, "parts"]].map(([meta, members]) =>
    P.Exists((q) => q.symbols({ t: meta as any }).requires(C_IS_T).requires(t.has(members as string)))))));

function spelling(node: any): string {
  return node.id.spelling;
}

/** The type an annotation `Dataclass` writes names: a basic native, a named schema, or a list or dict of them. */
function typeOf(schemas: Stores.Store, node: any, where: string, module: Py.Module): any {
  if (node instanceof Py.Subscript && node.value instanceof Py.Name && spelling(node.value) === "Annotated") {
    const [held, found] = (node.slice as any).elts;
    return faceted(typeOf(schemas, held, where, module), literal(found)).update();
  }
  if (head(node) === "Any") throw new ValueError(`${where}: Any is a dropped type, which reading cannot restore`);
  if ((node instanceof Py.Name || node instanceof Py.Attribute) && head(node) !== null) {
    const named = head(node) as string;
    return NATIVES.includes(named) ? S.OfNative.resolve((x) => x.token("basic", named)) : registered(schemas, named, module, where);
  }
  const container = node instanceof Py.Subscript ? head(node.value) : null;
  if (container === "list") return new S.OfIndexed.Builder().of(typeOf(schemas, node.slice, where, module)).create();
  if ((container === "dict" || container === MAP) && node.slice instanceof Py.Tuple && node.slice.elts.length === 2) {
    const [key, item] = node.slice.elts.map((element: any) => typeOf(schemas, element, where, module));
    return new S.OfIndexed.Builder().key(key).of(item).create();
  }
  throw new ValueError(`${where}: cannot read the annotation ${Python312.print(node).trim()}`);
}

/** The dotted text of a name or of attributes of a name (`Proxies.OfIndexed.Map`), or null for another expression. */
function head(node: any): string | null {
  if (node instanceof Py.Attribute) {
    const held = head(node.value);
    return held === null ? null : `${held}.${(node as any).attr.spelling}`;
  }
  return node instanceof Py.Name ? spelling(node) : null;
}

/** The schema registered as `named`, or, where the module has a class of that name, one registered empty, to be filled
 * when that class is read: a union or an intersection where the class says so (`KIND`), else an object schema. A name
 * that is neither is refused: reading never makes up a schema. */
function registered(schemas: Stores.Store, named: string, module: Py.Module, where = ""): any {
  if (![...schemas.names()].includes(named)) {
    const cls = definitions(module).get(named);
    if (cls === undefined) throw new ValueError(`${where}: ${named} is not a class of the module or a schema of the store`);
    if (cls instanceof Py.TypeAlias) return aliasSchema(schemas, module, named, cls);
    const kind = classVariables(cls).get("KIND");
    const made = kind === "union" ? new S.OfUnion.Builder().name(named).create() : kind === "intersection"
      ? new S.OfIntersection.Builder().name(named).create() : new S.OfObject.Builder().name(named).create();
    (schemas as any).register(made);
  }
  return schemas.registered(named);
}

/** What a type alias holds, and its `Annotated` metadata. */
function aliased(alias: any): [any, Record<string, any>] {
  const value = alias.value;
  if (value instanceof Py.Subscript && value.value instanceof Py.Name && spelling(value.value) === "Annotated") {
    return [(value.slice as any).elts[0], literal((value.slice as any).elts[1])];
  }
  return [value, {}];
}

/** The named lists being read, so that one that holds itself through aliases alone is refused. */
const READING = new Set<string>();

/** The schema a type alias's value says, registered as `name`: of `A | B`, a flat union, registered empty and filled
 * when its alias is read, since its branches may name classes not read yet; of a native's name, a named native, and of
 * `list[...]` or `dict[...]`, a named list, each read in full now, with its description. Anything else is refused. */
function aliasSchema(schemas: Stores.Store, module: Py.Module, named: string, alias: any): any {
  const [value, metadata] = aliased(alias);
  if (value instanceof Py.BinOp && value.op === "|") {
    (schemas as any).register(new S.OfUnion.Builder().name(named).flat().create());
    return schemas.registered(named);
  }
  const native = value instanceof Py.Name && NATIVES.includes(spelling(value));
  if (!native && !(value instanceof Py.Subscript && ["list", "dict", MAP].includes(head(value.value) as string))) {
    throw new ValueError(`${named}: cannot read the alias of ${Python312.print(value).trim()}`);
  }
  if (READING.has(named)) throw new ValueError(`${named}: a list that holds itself through aliases alone has no Python form`);
  READING.add(named);
  let held: any;
  try {
    held = typeOf(schemas, value, named, module);
  } finally {
    READING.delete(named);
  }
  let builder: any = native ? new S.OfNative.Builder().name(named).token(held.token.format, held.token.name)
    : new S.OfIndexed.Builder().name(named).of(held.item);
  if (!native && held.key !== null) builder = builder.key(held.key);
  (schemas as any).register(faceted(builder.create(), metadata).update());
  return schemas.registered(named);
}

/** A builder of the native or list `type` with the facets `Annotated` metadata gives it (see `facets`). */
function faceted(type: any, found: Record<string, any>): any {
  let builder: any;
  if (type instanceof S.OfNative.Data) {
    builder = new S.OfNative.Builder(type);
    if (found["native"] !== undefined) builder = builder.token(...(found["native"] as [string, string]));
    for (const unit of ["bits", "bytes"]) if (found[unit] !== undefined) builder = builder[unit](found[unit]);
  } else {
    builder = new S.OfIndexed.Builder(type);
    if (found["minimum"] !== undefined) builder = builder.extent({ minimum: found["minimum"], maximum: found["maximum"] ?? null });
  }
  return withDescription(builder, found["description"]);
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
/** The value of a literal the steps write: text, an int, or a tuple, list or dict of literals. */
function literal(node: any): any {
  const inner = node instanceof Py.Parenthesized ? node.value : node;
  if (inner instanceof Py.Dict) return Object.fromEntries(inner.items.map((item: any) => [literal(item.key), literal(item.value)]));
  if (inner instanceof Py.Tuple || inner instanceof Py.List) return inner.elts.map(literal);
  return `'"`.includes(inner.spelling[0]) ? unquoted(inner.spelling) : BigInt(inner.spelling);
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
  const found = definitions(module).get(named);
  return found instanceof Py.ClassDef && classVariables(found).has("LINKS") ? found : undefined;
}

/** The names of `A | B | ...`, in order. */
function alternatives(node: any): string[] {
  if (node instanceof Py.BinOp && node.op === "|") return [...alternatives(node.left), ...alternatives(node.right)];
  const named = head(node);
  return named === null ? [] : [named];
}

/** The entry class `tuple[R, ...]` holds, or null for another annotation. */
function entriesOf(node: any): string | null {
  return node instanceof Py.Subscript && node.value instanceof Py.Name && spelling(node.value) === "tuple"
    && node.slice instanceof Py.Tuple && node.slice.elts.length === 2 ? head(node.slice.elts[0]) : null;
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
  const named = qualified(module, cls);
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
  const named = qualified(module, cls);
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

/** Reads a class back; what the step wrote, by role: the schema. */
function readClass(store: Stores.Combined, match: Record<string, unknown>): Map<string, unknown> {
  const cls = match["c"] as any;
  const [schemas, module] = [schemasOf(store), moduleOf(store)];
  const named = qualified(module, cls);
  if (classVariables(cls).has("LINKS")) {
    readEntry(schemas, module, cls);
    return new Map([["schema", schemas.registered(named)]]);
  }
  const kind = classVariables(cls).get("KIND");
  if (kind !== undefined) {
    readVariants(schemas, module, cls, kind);
    return new Map([["schema", schemas.registered(named)]]);
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
      if (relationName === "Any") throw new ValueError(`${where}: Any is a dropped type, which reading cannot restore`);
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
  return new Map([["schema", builder.update()]]);
}

/** The types of `A | B | ...`, in order: names or subscripts. */
function branchesOf(node: any): any[] {
  return node instanceof Py.BinOp && node.op === "|" ? [...branchesOf(node.left), ...branchesOf(node.right)] : [node];
}

/** The name a branch has unless its alias says otherwise, from its annotation, as `convention` from its type. */
function namedConvention(node: any): string {
  if (node instanceof Py.Subscript && node.value instanceof Py.Name && spelling(node.value) === "Annotated") return namedConvention((node.slice as any).elts[0]);
  if (node instanceof Py.Subscript) return head(node.value) === MAP ? "dict" : spelling(node.value);
  const named = head(node) as string;
  return NATIVES.includes(named) ? named : snakeCase(named);
}

function readAlias(store: Stores.Combined, match: Record<string, unknown>): Map<string, unknown> {
  const alias = match["al"] as any;
  const [schemas, module] = [schemasOf(store), moduleOf(store)];
  const named = qualified(module, alias);
  const [value, metadata] = aliased(alias);
  const schema = registered(schemas, named, module);
  if (!(schema instanceof S.OfUnion.Data)) return new Map([["schema", schema]]); // a native or a list, read in full when it was first named
  const nodes = branchesOf(value);
  const names: string[] = metadata["branches"] ?? nodes.map(namedConvention);
  const notes: Record<string, string> = metadata["descriptions"] ?? {};
  let builder: any = new S.OfUnion.Builder(schema).branches(...nodes.map((node, i) => {
    const type = typeOf(schemas, node, `${named}.${names[i]}`, module);
    return (q: any) => withDescription(q.name(names[i]).of(type), notes[names[i] as string]);
  })).flat();
  if (metadata["description"] !== undefined) builder = builder.description(metadata["description"]);
  return new Map([["schema", builder.update()]]);
}

/** Whether a schema named after the alias `al` has been read: a union with branches, a native with a token, or a list
 * with an item. */
const ALIASED = ([[S.OfUnion.Schema, "branches"], [S.OfNative.Schema, "token"], [S.OfIndexed.Schema, "item"]] as [any, string][]).map(
  ([meta, filled]) => P.Exists((q) => q.symbols({ t: meta, o: OutputSchema }).requires(
    P.Contains(o.get("defined"), (e) => e.get("node").eq(al).and_(e.get("name").eq(t.name)))).requires(t.has(filled))) as unknown)
  .reduce((either, other) => E.operation("or", either as never, other as never));
/** A type alias of the module as a schema: of `A | B | ...`, a flat union, a branch per type, named after it or as its
 * `Annotated` metadata says; of a native's name, a named native; of `list[...]` or `dict[...]`, a named list; its
 * description, where it has one, from its `Annotated` metadata. */
export const AliasSchema = new T.Transform("AliasSchema", over({ al: Py.TypeAlias.Schema }, al.has("kind")),
  over({ al: Py.TypeAlias.Schema }, ALIASED), { rewrite: readAlias as never });

/** A dataclass of the module as an object schema, or an entry class (with `LINKS`) as a relation. */
export const Schema = new T.Transform("Schema", over({ c: Py.ClassDef.Schema }, DECORATED),
  over({ c: Py.ClassDef.Schema }, HAS_SCHEMA), { rewrite: readClass as never });

/** The drop transforms: per reason (`DROPS`), one for each kind of schema it applies to, named after the reason. */
export const DROP = dropTransforms();
export const TO_PYTHON = [Dataclass, Entry, Union, Intersection, Alias, NativeAlias, ListAlias, ...DROP];
export const FROM_PYTHON = [Schema, AliasSchema];
/** Classes that are not frozen and have no slots, every relation's entry class and every alias, and every drop. */
export const PLAIN = new T.Policy(new T.Clause("Dataclass", { frozen: false, slots: false }), new T.Clause("Entry", { slots: false }),
  new T.Clause("Union", { frozen: false, slots: false }), new T.Clause("Intersection", { frozen: false, slots: false }), new T.Clause("Alias"),
  new T.Clause("NativeAlias"), new T.Clause("ListAlias"), ...Object.keys(DROPS).map((reason) => new T.Clause(reason)));

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
  session.run(new T.Policy(new T.Clause("Schema"), new T.Clause("AliasSchema")));
  return session;
}

/** What a generation's drop steps dropped, in the order they did: each schema's name, where in it (`""` for the schema
 * itself, else a property, adjacency, link, branch or part, `name[item]` within a list), the transform that dropped
 * it, and why (`DROPS`). */
export function dropped(session: T.Session): [string, string, string, string][] {
  return (session.store.singleton(OUTPUT) as unknown as Output).dropped.map(([schema, reason, where]) =>
    [(schema as any).name as string, where, reason, DROPS[reason] as string]);
}

/** The object schemas, unions, intersections, relations, named natives and named lists of a generation's store that no
 * class or alias renders, each kind in name order: those no transform renders (see their befores), whose names a field
 * may still name (completeness, which mbse-patterns plans in general). */
export function missing(session: T.Session): any[] {
  const classes = new Set(definitions(moduleOf(session.store as Stores.Combined)).keys());
  return ["Schemas.Object", "Schemas.Union", "Schemas.Intersection", "Schemas.Relation", "Schemas.Native", "Schemas.Indexed"].flatMap((kind) => [...session.store.extent(kind)])
    .filter((schema: any) => !classes.has(schema.name));
}

/** What makes a session's module invalid Python, by path (mbse-programs' validation): such as a name Python cannot
 * spell, which `Dataclass` writes as the schema has it; and, by qualified name, a class nested in a dataclass under
 * the name of one of its fields (`Codegen.Output` where `Codegen` has a field `Output`), which would replace it. */
export function problems(session: T.Session): string[] {
  const module = moduleOf(session.store as Stores.Combined);
  const clashes = [...definitions(module)].filter(([, found]) => isDataclass(found)).flatMap(([named, found]) => {
    const fields = new Set(found.body.filter((item: any) => item instanceof Py.AnnAssign).map((item: any) => spelling(item.target)));
    return found.body.filter((nested: any) => defined(nested) !== null && fields.has(defined(nested)))
      .map((nested: any) => `${named}.${defined(nested)}: both a field and a class or alias nested in ${named}`);
  });
  return [...Py.LANGUAGE.validate(module), ...clashes];
}

/** The source of a session's module, as Python 3.12 prints it; `ValueError` listing its `problems` if it has any. */
export function text(session: T.Session): string {
  const found = problems(session);
  if (found.length > 0) throw new ValueError(`the module is not valid Python: ${found.join("; ")}`);
  return Python312.print(moduleOf(session.store as Stores.Combined));
}
