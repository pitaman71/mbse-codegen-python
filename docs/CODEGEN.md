<!-- nav -->
[← Bridges for types](BRIDGES.md) · [Home](../README.md) · [Equivalence →](EQUIVALENCE.md)

# Code generation for Python

Status: `Types` is built (0.1–0.8): schemas to dataclasses and type aliases, and back. It applies [mbse-patterns' transforms
design](https://github.com/pitaman71/mbse-patterns/blob/main/docs/TRANSFORMS.md) to Python: phase 2 of its plan, the
first transform with both directions.

## What it generates

`Types` renders mbse-schemas' object schemas as Python dataclasses, through mbse-programs' Python syntax trees, and
reads dataclasses back into schemas. The two directions are inverse: schemas to source and back gives the same schemas,
and source to schemas and back gives the same source, given the same decisions. `Expressions` and `Patterns` come later.

## One store, three parts

A session runs over one store, `Types.store(schemas, module)`, mbse-schemas' `Stores.Combined` of three:

- **the schemas**: `Reflection.of(schemas)`, whose objects are the schemas a store registers and the named schemas
  they refer to, each an object of its kind's meta-schema (`Schemas.OfObject.Schema`, named `Schemas.Object`, and the
  like). A transform's symbol declared with a meta-schema binds a schema, and its predicate says which schemas match.
  The store's data is never read;
- **the syntax trees**: mbse-programs' Python store, whose objects are syntax nodes;
- **the output**: a store of this repository's own, whose singleton `Codegen.Output` links the module, by
  `Codegen.Generated`, so that what is generated is reachable, and so matched.

Reading code back runs a session over the same three: the module given, parsed by a standard of mbse-programs, is
what is matched, and the schemas are what is written, into the store given.

## Transforms

One transform per kind of decision, each `before` and `after` over the same symbols, as mbse-patterns' `Transforms`
requires.

| Transform | Symbols | Before | After | Parameters |
|---|---|---|---|---|
| `Dataclass` | `s`: `Schemas.OfObject.Schema` | `s` is named, declares no parameters, every property's type renders, and every adjacency is to a named relation | the module has a class named after `s` | `frozen`: `bool` |
| `Union` | `s`: `Schemas.OfUnion.Schema` | `s` is named, not `flat`, declares no parameters, has branches, and every branch's type renders | the module has a class named after `s` | `frozen`: `bool` |
| `Intersection` | `s`: `Schemas.OfIntersection.Schema` | `s` is named, declares no parameters, has parts, and every part's type renders, or, `flat`, is an object schema whose properties render | the module has a class named after `s` | `frozen`: `bool` |
| `Alias` | `s`: `Schemas.OfUnion.Schema` | `s` is named, `flat`, declares no parameters, has branches, and every branch's type renders | the module has a type alias named after `s` | none |
| `Entry` | `r`: `Schemas.OfRelation.Schema` | `r` is named, declares no parameters, every property's type renders, and every link is declared by an object schema | the module has a class named after `r` | none |
| `Schema` | `c`: `Programs.Python.ClassDef` | `c` is decorated `@dataclass` or `@dataclass(...)` | a relation named after `c` has its links, or an object schema named after `c` has a property or adjacency per field, is `ref` where `c` is `eq=False`, and is described where `c` has a docstring | none |
| `NativeAlias` | `s`: `Schemas.OfNative.Schema` | `s` is named, declares no parameters, and is a basic native without a width | the module has a type alias named after `s` | none |
| `ListAlias` | `s`: `Schemas.OfIndexed.Schema` | `s` is named, declares no parameters and no extent, its key (if any) is a native, basic or named, and its item renders | the module has a type alias named after `s` | none |
| `AliasSchema` | `al`: `Programs.Python.TypeAlias` | always | a schema named after `al` has been read: a union with branches, a native with a token, or a list with an item | none |

- **A class is one step**, with all its fields: its one decision is `frozen`, and the fields follow from the schema.
  A symbol binds a schema, never a property: a property is a value within a schema, read with `get`, quantified over
  (`s.get("properties").all(...)`) and compared deeply (mbse-expressions' Basic). A decision about one property, when
  there is one to take, will be a parameter of the schema's step.
- **What renders**: a basic native as Python's name for it (`str`, `int`, `float`, `bool`, `bytes`), without a width
  or a description of its own, which Python's type cannot hold, a named
  object schema, union, intersection, native or list by its name, a positional list as `list[...]` and a list keyed by
  a native, basic or named, as `dict[K, V]`, of any of these, nested to any depth: `Types.Rendered` is a predicate that
  applies itself to a list's item (mbse-patterns 0.8.2). An inline list with an extent has no Python form yet, and an
  application none: a schema with such a property has no candidate, rather than a dataclass field that names nothing.
- **A named native or list is a type alias** (0.10) of what it holds, as a proxy reads its value: `type Word = str`,
  `type Names = list[Word]`, `type Tally = dict[Word, Count]`, its description in `Annotated` metadata, as a flat
  union's is. A field names it (`word: Word | None = None`); one without an alias (another format's native, a bounded
  list) is in `missing`. Reading back tells aliases apart by what they hold (`AliasSchema`, which replaces 0.8's
  `FlatUnion`): `A | B` a flat union, a native's name a named native, `list[...]` or `dict[...]` a named list. A named
  native or list a field names is read in full by that class's step, so its own alias's step has nothing left to do;
  that step does not link it (a rewrite returns one element per role), an open question below.
- **Names are written as the schemas have them**, so that a step can still configure them; a name Python cannot spell
  (not an identifier, or a keyword) is a problem of the module, which mbse-programs' validation reports by path
  (`Types.problems(session)`), and taking the source (`Types.text(session)`) with any left is a `ValueError` listing
  them all. A property named by a keyword is a field with a trailing underscore (`from_`), read back without it: a
  spelling, not a loss.
- **Completeness is reported**: `Types.missing(session)` lists the object schemas no class renders, in name order, so
  a field naming one of them (a schema renders by naming any object schema) is seen, not silently left undefined.
- **Objects read alike, whatever implements them.** Generated classes have the members mbse-schemas' proxies have, so
  that code written against one works on the other without change: a property is a field, and an adjacency one field
  named after it, holding its entries (`phones: tuple[Phones, ...] = ()`; any iterable would do, and a set sorted by a
  comparator, which would serve retrieval, is an open question). Both ends of a relation have their field.
- **A relation is the class of its entries**, named after it (`Entry`): a field per link, typed by the object schemas
  that declare an adjacency via it (`phone: Pager | Phone | None = None`), then one per property, its class variables
  `LINKS` and `UNIQUES` saying which fields are links and what is unique, its docstring its description. An entry is
  one object, in the tuples of each object it links. On the wire an entry is written in its adjacency's form, without
  the link the adjacency implies; in a class, every link is a field, any of which may be `None`.
- **An adjacency field says its link only where it is ambiguous**: reading back takes the one link of the entry class
  typed by the owner, and where a schema declares adjacencies via several links of one relation (a self-relation,
  `Person.children` and `Person.parents` through `Parentage`), each field's metadata names its link:
  `field(default=(), metadata={"me": "parent"})`. A relation the store holds, with no class in the module, needs it
  too.
- **Flat, where the schema says so.** A union or intersection configured `flat` (mbse-schemas 0.9) reads, on proxies
  and generated code alike, as Python's own forms. A flat union is a type alias of its branches' types (`type Channel =
  Call | Mail`): its value is the branch's value, told apart by type. Its branches' names, where they differ from their
  types' (`call` for `Call`, `int`, `list`, `dict`), and its description, are `Annotated` metadata (`type Code =
  Annotated[int | str, {"branches": ["n", "s"], "description": "A code"}]`). A flat intersection is a class of its
  parts' properties (`ticket.stamp.at`), whose class variable `PARTS` says each part's schema, or the properties of an
  inline part: `{"when": ("at",), "who": "Who"}`. The wire form stays tagged.
- **Absent reads as `None`** on both: a generated field defaults to `None`, and a proxy reads a property that is not set
  as `None` (mbse-schemas 0.8.4), so code that handles a missing value works on either.
- **A field is optional**, as every property is (mbse-schemas: nothing is mandatory but by a constraint):
  `name: str | None = None`. `from __future__ import annotations` lets a field name a class defined later.
- **A reference object schema compares by identity**: `@dataclass(eq=False)`, read back as `ref`. A schema's
  description is the class's docstring, a string in double quotes, and a singleton's name its class variable
  `SINGLETON` (`SINGLETON: ClassVar[str] = "Codegen.Output"`).
- **Nothing is lost silently** (0.9.1). A property's, an adjacency's, a relation property's and a branch's or part's
  description is its field's metadata (`field(default=None, metadata={"description": "digits"})`, beside an
  adjacency's `"me"`); a flat union's branches' descriptions are its `Annotated` metadata's `"descriptions"`, and a
  flat intersection's parts' its class variable `DESCRIPTIONS`, since no field holds a part. What Python's types cannot
  hold (a native's width, a native's own description) has no class, and `missing` reports it.
- **Classes are in name order**, wherever the steps that wrote them come in the trace, so the module does not depend
  on the order of the decisions; the imports come first, once.
- **Names are matched by name.** After says "a class named after `s`" by its `name` child's spelling, since the
  reflected schemas and the syntax nodes are held by different stores and declare no relation between them; the trace
  links each step to its match.
- **Each step links what it wrote** (0.9.2, mbse-patterns 0.9), by role: `Dataclass`, `Entry`, `Union` and
  `Intersection` a `class`, `Alias` an `alias`, and reading back a `schema`. Within the session the link is the
  element (`session.wrote(cls)` is the step that wrote it); a trace names it by its path when written
  (`Codegen.Output/modules[0]/children[4]`, positional, since a syntax node has no name of its own).
- **Reading back** registers each class's schema in the store given; a class a field names before its own step is
  registered empty, which `Schema`'s after does not take for that class's schema unless the class has no fields, and is
  filled when the class is read. An annotation `Dataclass` does not write is refused, naming the field (`Bad.x: cannot
  read the annotation dict[str, int]`).
- **Regenerating reuses decisions.** A step's key is `Dataclass(s=Contact)`, by the schema's path, its name
  (mbse-schemas' `Paths`). Given the earlier steps (`generate(schemas, policy, earlier)`, or a session's `earlier`), a
  generation takes each decision again where its key still occurs, so after the schemas change only a new schema
  asks; the decisions about schemas now gone are `orphans`, and `Transforms.diff` lists what was added, removed and
  decided otherwise (mbse-patterns 0.8).
- **Round trips are laws, tested both ways.** Schemas to source to schemas gives the same schemas, compared as their
  modules' JSON; source to schemas to source gives the source as mbse-programs' Python 3.12 prints it, taking the same
  decisions again. `frozen` is the one thing a schema does not hold: the trace of the generation keeps it.

## Open questions

- **Model parameters.** A parametric schema as a generic dataclass (`class Matrix[T]`) needs type parameters, which
  mbse-schemas has not built yet; value parameters (an extent's bound) have no Python construct.
- **Runtime bindings.** The generated classes hold relations as containers, but are not bound to a store: generating
  mbse-schemas' `Bindings` beside them would let them serialize, validate and be queried as any store's objects.
- **Entries as a sorted set.** Any iterable holds entries; a set sorted by a comparator would serve retrieval.
- **The older adapter.** mbse-schemas' `Adapters/Dataclasses.py` maps containers of dataclasses to relations, as
  0.5 did and 0.6 no longer does; its classes do not read as proxies. Retire it, or bring it to entry classes.
- **Other formats and widths.** Natives of other formats (`ccpp`) and widths (bits, bytes) have no Python form yet.
- **Several elements in one role.** A class's step reads the native and list aliases its fields name, which a rewrite
  cannot yet return as written (one element per role): mbse-patterns could let a role hold several.
- **Extents.** A bounded list (`.extent(0, 9)`) could be `Annotated[list[T], ...]` with a marker, or a check in
  `__post_init__` with the constraints (`Codegen/Patterns`).
- **Configuring names.** A name Python cannot spell is an error when the source is taken; a transform that offers a
  Python name as a parameter (the older adapter keeps a dotted name's last part) would let a person or a policy fix it
  within the session, recorded in the trace.

## Resolved

- A named native is a type alias, not a `NewType` (0.10): a `NewType` cannot hold the `Annotated` metadata that
  carries a description or a width, and a proxy's value is the plain host value either way.

- Descriptions are field metadata (0.9.1), not comments or `Annotated` annotations: metadata reaches code at run
  time (`dataclasses.fields`), as an adjacency's `"me"` already did, and leaves the annotation the type alone.

- Codegen matches schemas through mbse-schemas' `Reflection.of(store)` (0.8), and compares what they hold with
  mbse-expressions' deep equality (0.5).
- One transform per class, not per field: a step is a decision, and a field has none yet.
- No silent loss (0.3): a property type or an extent `Dataclass` cannot render faithfully makes its schema have no
  candidate, and `missing` reports it.
- Relations render as entry classes, and adjacencies as fields holding entries, on both ends (0.6), so that generated
  classes read as mbse-schemas' proxies do (0.8.3) and code works on either without change. It replaces 0.5's
  container fields (the older adapter's mapping), which hid the entries and differed from proxies.
- Unions and intersections render as value classes of a dataclass field per branch or part (0.7), as proxies read
  union and intersection values, the default form; `KIND` says which on the way back. Reading back never makes up a
  schema: a name that is neither a class of the module nor a schema of the store is refused.
- Unions and intersections may be configured `flat` in the schema (mbse-schemas 0.9, codegen 0.8): a type alias of
  the branches' types and a class of the parts' properties, as flat proxies read them. Both forms are a schema's
  configuration, not a decision of codegen, since code written against one does not read the other.
- Names Python cannot spell are written as they are, flagged by mbse-programs' validation (which already holds any
  spelling and flags those), and an error only when the source is taken (0.4), so that a step may still configure
  them. Keyed lists and nested lists render, as mbse-schemas' older Python adapter
  (`Adapters/Dataclasses.py`) maps them.
- Decisions are keyed by schema names (0.2), so they survive any change but a rename; a renamed schema's decision is
  an orphan, for the person to confirm again (mbse-patterns' open question on renames).

---

<!-- nav -->
[← Bridges for types](BRIDGES.md) · [Home](../README.md) · [Equivalence →](EQUIVALENCE.md)
