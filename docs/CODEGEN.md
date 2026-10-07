<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Equivalence →](EQUIVALENCE.md)

# Code generation for Python

Status: `Types` is built (0.1): schemas to dataclasses and back. It applies [mbse-patterns' transforms
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
| `Dataclass` | `s`: `Schemas.OfObject.Schema` | `s` is named, declares no parameters and no adjacencies, Python can spell its names, and every property's type renders | the module has a class named after `s` | `frozen`: `bool` |
| `Schema` | `c`: `Programs.Python.ClassDef` | `c` is decorated `@dataclass` or `@dataclass(...)` | a schema named after `c` has as many properties as `c` has annotated fields | none |

- **A class is one step**, with all its fields: its one decision is `frozen`, and the fields follow from the schema.
  A symbol binds a schema, never a property: a property is a value within a schema, read with `get`, quantified over
  (`s.get("properties").all(...)`) and compared deeply (mbse-expressions' Basic). A decision about one property, when
  there is one to take, will be a parameter of the schema's step.
- **What renders**: a basic native as Python's name for it (`str`, `int`, `float`, `bool`, `bytes`), a named
  object schema by its name, a positional list as `list[...]` and a list keyed by a basic native as `dict[K, V]`, of
  any of these, nested four deep at most (`DEPTH`). A list with an extent has no Python form yet, and a named schema of
  another kind (a named native, union, intersection or application) no class: a schema with such a property has no
  candidate, rather than a field that names nothing.
- **Names are spelled as Python spells them, or refused.** A schema's name and its properties' names must be Python
  identifiers (ASCII letters, digits and underscores, not starting with a digit); a schema's name not a keyword. A
  property named by a keyword is a field with a trailing underscore (`from_`), read back without it. The output
  singleton holds the names Python can spell (`identifiers`) and Python's `keywords`, as values a predicate reads, since
  Basic has no string functions; a schema whose names Python cannot spell has no candidate, rather than invalid source.
- **Completeness is reported**: `Types.missing(session)` lists the object schemas no class renders, in name order, so
  a field naming one of them (a schema renders by naming any object schema) is seen, not silently left undefined.
- **A field is optional**, as every property is (mbse-schemas: nothing is mandatory but by a constraint):
  `name: str | None = None`. `from __future__ import annotations` lets a field name a class defined later.
- **A reference object schema compares by identity**: `@dataclass(eq=False)`, read back as `ref`. A schema's
  description is the class's docstring, a string in double quotes.
- **Classes are in name order**, wherever the steps that wrote them come in the trace, so the module does not depend
  on the order of the decisions; the imports come first, once.
- **Names are matched by name.** After says "a class named after `s`" by its `name` child's spelling, since the
  reflected schemas and the syntax nodes are held by different stores and declare no relation between them; the trace
  links each step to its match.
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

- **Unions and intersections.** A union value names its branch, which `A | B` cannot say; a faithful rendering is a
  class per union with a field per branch, or a tagged union. Which, or a parameter to choose?
- **Model parameters.** A parametric schema as a generic dataclass (`class Matrix[T]`) needs type parameters, which
  mbse-schemas has not built yet; value parameters (an extent's bound) have no Python construct.
- **Relations.** Adjacencies and relations have no dataclass form; mbse-schemas' `Bindings` is the runtime for bound
  classes. Generating bindings beside the dataclasses is the natural next step.
- **Named natives and other formats.** A named native (`Word`) has no class: a `NewType`, or a type alias, is one
  more transform. Natives of other formats (`ccpp`) and widths (bits, bytes) have no Python form yet.
- **Extents.** A bounded list (`.extent(0, 9)`) could be `Annotated[list[T], ...]` with a marker, or a check in
  `__post_init__` with the constraints (`Codegen/Patterns`).
- **Names Python cannot spell.** Mapping them (the older adapter keeps a dotted name's last part) loses the name on
  the way back; renaming the schema is the person's to decide. Should a transform offer a name as a parameter?
- **Property descriptions** have no place in a dataclass field yet: a comment, or `Annotated[..., "..."]`.

## Resolved

- Codegen matches schemas through mbse-schemas' `Reflection.of(store)` (0.8), and compares what they hold with
  mbse-expressions' deep equality (0.5).
- One transform per class, not per field: a step is a decision, and a field has none yet.
- No silent loss (0.3): a property type, an extent or a name `Dataclass` cannot render faithfully makes its schema have
  no candidate, and `missing` reports it. Keyed lists and nested lists render, as mbse-schemas' older Python adapter
  (`Adapters/Dataclasses.py`) maps them.
- Decisions are keyed by schema names (0.2), so they survive any change but a rename; a renamed schema's decision is
  an orphan, for the person to confirm again (mbse-patterns' open question on renames).

---

<!-- nav -->
[← Why the mbse repositories exist](../MBSE.md) · [Home](../README.md) · [Equivalence →](EQUIVALENCE.md)
