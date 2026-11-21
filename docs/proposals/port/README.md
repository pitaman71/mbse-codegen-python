<!-- nav -->
[← CAP-027: Python3 source generated from schemas](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-027.md) · [Home](../../../README.md)

# Porting Types onto mbse-transforms 0.1 and mbse-programs 0.4 (a proposal, for review)

This proposal belongs to [INI-081: stabilize Python codegen](https://github.com/pitaman71/mbse-basis/blob/main/proposals/PRIORITIES.md#ini-081--stabilize-python-codegen).
It proposes how mbse-codegen-python's `Types` moves off mbse-patterns 0.9.1's transforms, mbse-programs 0.3.28 and
mbse-schemas 0.10.0, onto [mbse-transforms](https://github.com/pitaman71/mbse-transforms) 0.1.0, mbse-programs 0.4 (a
Python 3 module's tree as one value) and mbse-schemas 0.30. Its design and decisions so far are mbse-basis
[CAP-027: Python3 source generated from schemas](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-027.md)'s,
and [CAP-039: schemas round-trip through Python3](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-039.md)
states the round trips it keeps. The [first-release proposal](https://github.com/pitaman71/mbse-transforms/blob/main/docs/proposals/first-release/README.md#what-mbse-codegen-python-then-needs-of-it)
of mbse-transforms says what this repository then needs of it. Stage 1 is built (0.17.0), against the siblings as
it pins them (Gaps found, 1).

## Where it stands

mbse-codegen-python 0.16.0 is one module, `Types`: 1,323 lines in Python (`mbse.Codegen.Python.Types`) and 1,278 in
TypeScript (`typescript5/src/Types.ts`). Its tests are 20 cases in each language: suite TYP (17) and suite SKL (3). It
pins mbse-schemas 0.10.0, mbse-expressions 0.5.4, mbse-patterns 0.9.1 and mbse-programs 0.3.28 (`siblings.json`).

**Measured against the siblings as they stand**, in a scratch environment outside every checkout (CPython 3.14.7; the
siblings installed from their checkouts: mbse-schemas 0.30.1 at `777c645`, mbse-expressions 0.12.1 at `53373f9`,
mbse-programs 0.4.0 at `0aeb634`, mbse-transforms 0.1.0 at `fe22000`, mbse-patterns 0.9.1 at `fedd858`):

- **Every case fails before it runs.** Both Python notebooks stop at their first cell, since the package imports
  `Types`, and `Types` imports `mbse.Expressions.Expressions`, which mbse-expressions 0.12.1 no longer has. None of the
  20 cases is reached.
- **Each import of `Types`, tried alone**: `mbse.Expressions.Expressions` is gone; `mbse.Patterns.Predicates` and
  `mbse.Patterns.Transforms` fail at import, since mbse-patterns 0.9.1 imports `Bindings` from mbse-schemas, which
  0.30.1 no longer has; `mbse.Programs.Framework.Syntax` and `mbse.Programs.Python` (0.3's syntax nodes, `Python312`)
  fail at import on `Visitors.Native`, and mbse-programs 0.4 sets them aside.
- **What it uses of mbse-schemas**: `Bindings` and `Reflection` are gone; of `Schemas`, `OfNative`, `OfIndexed`,
  `OfApply`, `BASIC`, `PYTHON3` and `structure` are gone; `Stores.Store` is gone, and `Stores.Combined` is deprecated
  since 0.16.0; `Proxies.OfIndexed`, whose `Map` is the run-time class generated code imports for keys a `dict` cannot
  hold faithfully, is gone. `Schemas.OfObject`, `OfRelation`, `OfUnion` and `OfIntersection` remain.
- **Uses, by the module they come from** (names in `Types.py`): 100 of mbse-programs 0.3's Python syntax nodes, 82 of
  mbse-schemas' `Schemas`, 48 of mbse-expressions' writers, 41 of mbse-patterns' predicates, 33 of mbse-patterns'
  transforms, 23 of `Stores`, 8 of `Bindings`, 3 of `Python312`, and one each of `Reflection`, `Proxies` and the 0.3
  framework's `walk`.
- **The pins**: `polyrepo.py check` reports mbse-expressions (0.12.1 against 0.5.4), mbse-programs (0.4.0 against
  0.3.28) and mbse-schemas (0.30.1 against 0.10.0) incompatible.
- **TypeScript** was not installed: its `npm install` runs each sibling's own install, which writes into the sibling
  checkouts. `Types.ts` imports the same names from the same packages (`@mbse/expressions`' `Expressions`,
  `@mbse/patterns`, `@mbse/programs`' `Framework` and `Python`, and `@mbse/schemas`' `Bindings` and `Reflection`), and
  mbse-programs' TypeScript is not ported (Gaps found, 2).

**Its 21 transforms.** `TO_PYTHON` is `Dataclass`, `Entry`, `Union`, `Intersection`, `Alias`, `NativeAlias` and
`ListAlias`, then `DROP`, twelve transforms under three names: `DropInline` over object schemas, relations, unions,
intersections and lists; `DropFormat` over those and natives; `DropUndeclared` over relations. `FROM_PYTHON` is `Schema`
and `AliasSchema`. Each is a `before` and an `after` over mbse-patterns' predicates, with a rewrite function, run by
mbse-patterns' `Session` over one combined store of three: the schemas (`Reflection.of`), the syntax nodes, and an output
whose singleton `Codegen.Output` holds the module.

**What replaces each name `Types` exports:**

| `Types` 0.16 | Replaced by |
|---|---|
| `store(schemas, module)`, a `Stores.Combined` of three stores | The caller's stores: the schemas' store behind the `source`, the store of the caller's choosing behind the `sync` or the `target` (Decided, 1), and a certificates' store. mbse-schemas no longer combines stores |
| `Output`, `Generated`, `Defined`, `OUTPUT` | Retired (Decided, 10): where what the transforms write goes is the caller's. What a module defines, by qualified name, is read from its value whenever it is needed |
| `Dropped`, `DROPS`, `DROP`, `dropped(session)` | A drop transform per reason with a distinct name (Decided, 4); the drops reported from their certificates (Decided, 5) |
| `Dataclass`, `Entry`, `Union`, `Intersection`, `Alias`, `ListAlias` | mbse-transforms transforms, each defined by `Transforms.define` with a prototype pattern and a registered procedure (The proposal, below) |
| `NativeAlias` | Nothing to match in mbse-schemas 0.30, which has no named scalar (Decided, 7) |
| `Schema`, `AliasSchema` | One transform per file, as [CAP-317: transforms targeting value objects](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/README.md#CAP-317) leaves it (Decided, 6) |
| `Unbuilt`, and each `before`'s constraints (mbse-expressions writers, mbse-patterns' `Exists` and `Contains`) | Each prototype pattern's spec where the condition is structural; the rest the caller's verification (Decided, 2) |
| Each `after` | The caller's verification between `apply` and `certify` |
| `TO_PYTHON`, `FROM_PYTHON` | The transforms in the catalog, `Transforms.TheCatalog`, read by name |
| `PLAIN`, a mbse-patterns `Policy` that takes candidates | A `Transforms.Policy` that ranks them; `generate` takes the first of each frame's |
| `generate(schemas, policy, earlier)`, `read(module, schemas)` | The same entry points, written as the caller of mbse-transforms: frames, a session, `apply`, verification, `certify` |
| `session.orphans`, mbse-patterns' `Transforms.diff`, `earlier` applications | Queries over the certificates, as mbse-transforms' reruns and diffs are |
| `missing(session)` | Kept: the schemas no class or Python type alias renders, read from the schemas' store and the module's value. [CAP-082: completeness reported](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-082.md) is mbse-transforms', not met |
| `problems(session)` | mbse-programs' `Check.validate(store, path)`, plus `Types`' own check of a nested class under a dataclass field's name |
| `text(session)` | mbse-programs' `Print.print_module(store, path)`, refused while `problems` lists any |
| `KEYWORDS`, `NATIVES` | Kept: a property named by a keyword is a field with a trailing underscore; the five basic scalars are Python's `bool`, `int`, `float`, `str` and `bytes` |
| `MAP`, `Proxies.OfIndexed.Map` in generated code | No counterpart in mbse-schemas 0.30.1 (Gaps found, 4; Decided, 8) |

## Decided elsewhere, that applies

- **The transform model.** "A transform has a prototype, a procedure, and a cerificate. The prototype comprises what
  you called `before`. The procedure is native code for the time being." Application "takes up to three arguments as
  visitors": "`source` - a read-only `Visitors.OfPattern` bearing a pattern frame bound to a source copy that is not to
  be disturbed (nondestructive)"; "`sync` - a writeable `Visitors.OfPattern` bearing a pattern frame bound to a copy
  that is to be edited in place (destructive)"; "`target` - a writeable `Visitors.OfPattern` bearing a pattern frame
  bound to a (usually empty) copy that is to be replaced (constructive)"
  ([mbse-transforms' first-release proposal](https://github.com/pitaman71/mbse-transforms/blob/main/docs/proposals/first-release/README.md#the-transform-model-as-the-user-decided)).
- **The procedure takes visitors, and that's that**: "All I stated was procedures (such as validation, simplification,
  comparison, etc.) take visitor(s) as an argument(s) and that's that. No additional criteria or invention beyond the
  visitor boundary is acceptable." The caller makes each visitor and the copy behind it: "The transforms application
  procedure does not need to know how copies are made since it takes Visitors.OfPattern as an argument."
- **No decisions below the parameter level**: "Transforms may not make decisions below the parameter level. Discrete
  decisions in a transformation procedure must themselves be modeled as discrete transforms with non-overlapping
  patterns." A transform may be parametric, and "ofc those parameters must be recorded in the transform certificate".
- **Three levels of certificates**, which "form a complete audit history for transforms": a history certificate, a
  transform certificate per application, and a sub-certificate per argument
  ([CAP-075: steps linked to what they matched and wrote](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-075.md)).
- **Candidates**: "The transform candidates must come from a filter fed by a frame stream." "In a streaming system
  termination conditions are relative." A policy ranks them
  ([CAP-074: transforms applied step by step](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-074.md)).
- **File granularity, for now**: "the restriction of pattern symbol bindings to reference objects means the granularity
  at which we can write transforms to/from AST is at the file level. This is acceptable temporarily and might
  streamline implementation a bit. We can open a future capability that allows transforms to target value objects."
  ([CAP-317: transforms targeting value objects](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/README.md#CAP-317)).
- **The whole tree is values**: "the whole AST is value objects. It's lexically proportionate, so maybe that's just
  tolerable." A file is a reference object holding its tree as one value
  ([mbse-programs' port, Stage 3](https://github.com/pitaman71/mbse-programs/blob/main/docs/proposals/port/README.md#stage-3-the-whole-tree-as-values)).
- **Its predicates move in its own port**, to mbse-schemas' `OfPattern`, rather than wait for mbse-patterns
  ([CAP-027: Python3 source generated from schemas](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-027.md#decided), Decided;
  [mbse-patterns' charter](https://github.com/pitaman71/mbse-patterns/blob/main/docs/proposals/rescope/README.md#decided), Decided, 3).
- **CAP-027's decisions on drops stand**: "A report of all dropped types and reasons should be easy to obtain ... as
  dropping transform steps"; "anything that references a dropped type should be demoted to Any."; "DropParametric?
  Absolutely not."
- **No bespoke schema-aware code**: "No model should need bespoke schema-aware code to read or write. Use mbse-schemas
  built-in serialization support."
  ([CAP-282: no model needs bespoke schema-aware code to read or write](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/README.md#CAP-282)).

**mbse-patterns is no longer needed.** Its transforms are mbse-transforms' precursor, which mbse-transforms replaces;
its predicates move to mbse-schemas' `OfPattern`, as decided above; and its fresh start (0.10) keeps distributions,
sampling, generators and characterizers, none of which `Types` uses, nor mbse-transforms 0.1.0's policies
([CAP-083: policies with guards and distributions](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-083.md)
is not in it). Its 0.9.1 does not import against mbse-schemas 0.30.1 (measured above). The port removes it from
`siblings.json`, `pyproject.toml` and `package.json`.

**mbse-expressions stays a sibling** (Decided, 13): a statement's expressions, its annotations among them, are
mbse-expressions' `Python3` and `Python Types` terms, which `Types` writes through mbse-schemas' builders and reads
through mbse-expressions' `Terms`, as mbse-programs' printer does.

## The proposal

### Each transform, as mbse-transforms has it

A transform is data in a transforms' store: `Types.install(txn)` writes its prototypes, mbse-schemas patterns, and
`Transforms.define(txn, name, procedure, prototype)` writes each transform into `Transforms.TheCatalog` under its name,
naming the procedure registered under it in a `Transforms.Procedures` that `Types` makes. A prototype declares the
transform's parameters through mbse-schemas' Parametrics; `frozen` and `slots` are `Schemas.OfBool` parameters, whose
finite domain makes one candidate per combination of their values, four per class, as today. A procedure,
`procedure(source, sync, target, assignments)`, reads the `source`'s symbols' visitors, writes the `sync`'s or the
`target`'s, whichever the caller gives, through their stores' builders, and takes every choice from `assignments`.

To Python, a schema is a reference object of the schemas' store, so a prototype's symbol binds the schema itself, finer
than a file. A module is a file, so the `sync` or `target` the caller gives binds a file: CAP-317's file granularity is
on the module's side alone.

| Transform | Prototype: symbols, and what it states | Procedure | Parameters | Arguments |
|---|---|---|---|---|
| `Dataclass` | `s`, a `Schemas.OfObject`: named, declaring no parameters, holding nothing unbuilt, and no adjacency to a relation declaring parameters | Writes `s`'s class, a `Programs.Python3.ClassDef` value, into the `body` of the module its `sync` or `target` binds, in name order, nested in the class of its dotted name's prefix, with the imports it needs | `frozen`, `slots` | `source`: `s`'s frame; a `sync` or a `target`, as the caller gives (Decided, 1) |
| `Entry` | `r`, a `Schemas.OfRelation`: named, declaring no parameters, holding nothing unbuilt, no link declared by an object schema declaring parameters | Writes `r`'s entry class: a field per link, then per property, `LINKS` and `UNIQUES` | `slots` | as `Dataclass` |
| `Union` | `s`, a `Schemas.OfUnion`: named, not `flat`, with branches, declaring no parameters, holding nothing unbuilt | Writes a value class of a field per branch, `KIND = "union"` | `frozen`, `slots` | as `Dataclass` |
| `Intersection` | `s`, a `Schemas.OfIntersection`: as `Union`, with parts, `flat` or not | Writes a value class of a field per part, or of its parts' properties where `flat` (`PARTS`, `DESCRIPTIONS`) | `frozen`, `slots` | as `Dataclass` |
| `Alias` | `s`, a `Schemas.OfUnion`: named, `flat`, with branches, declaring no parameters, holding nothing unbuilt | Writes a Python type alias of its branches, as an annotated assignment, `Name: TypeAlias = ...` (Decided, 12), `Annotated` where branch names or descriptions need it | none | as `Dataclass` |
| `ListAlias` | `s`, a `Schemas.OfContainer`: named, declaring no parameters, its element and index holding nothing unbuilt | Writes a Python type alias of `list[...]` or `dict[...]`, as `Alias` does (Decided, 7, 8 and 12) | none | as `Dataclass` |
| `DropInlineObject`, `DropInlineRelation`, `DropInlineUnion`, `DropInlineIntersection`, `DropInlineContainer`, `DropUndeclared` (Decided, 4 and 7) | A schema of its kind holding a schema dropped for the reason | Writes nothing: the certificate records the drop (Decided, 5) | none | `source` alone |
| `Schema`, with `AliasSchema` merged into it (Decided, 6) | `m`, a `Programs.Python3.Module` | Reads every dataclass and Python type alias in `m`'s value, in order, and writes the schemas each describes | none | `source`: `m`'s frame; a `sync` or a `target`, as the caller gives |

Each procedure decides nothing below its parameters. What it computes from the schema it reads, such as `Any` where a
dropped schema is held, `dict` or another form for a keyed container, the nesting of a dotted name and the name order,
follows from the data, as CAP-027 decided each; a procedure's deterministic branches on data are computation
([CAP-074: transforms applied step by step](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-074.md#decided-by-an-agent-for-review),
Decided by an agent, for review).
Transforms that are alternatives for one schema have patterns that do not overlap: `Union` and `Alias` differ by
`flat`. A drop transform and a class's transform both apply to a schema that holds a dropped schema, as today, and
neither is an alternative to the other.

Today's `after`, that the module defines a class or a Python type alias named after the schema, becomes the caller's
verification, between `apply` and `certify`, as "application may optionally verify that the pattern is falsified by the
application or more generally an additional metric that computes recursion progress toward termination". Where it
fails, the caller does not certify.

Which of each prototype's conditions an `OfPattern`'s spec states, and which need its `requires` evaluated, is measured
in stage 1. A spec states an absent property (mbse-transforms' tutorial states an item without a label). Being named,
declaring no parameters and holding nothing unbuilt at any depth need an expression evaluated, which waits on
[CAP-142: expressions evaluated in queries](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-142.md#blocked);
until then they are the caller's verification (Decided, 2).

### Schemas to one module's tree, at file granularity

The caller makes the copies (Decided, 1). For each application it gives, beside the schema's frame as the `source`,
either a `target`, the frame of an empty `Programs.Python3.Module` in mbse-programs' store (`Python3.store()`), owned by
`Programs.Framework.TheWorkspace` under a `path` it chooses, which the application replaces, or a `sync`, the frame of a
module it already holds, which the application edits in place. The procedure writes its class or its Python type alias
into that module's `body`, as nested values in mbse-schemas' builders' syntax: a `ClassDef`'s decorators, docstring
(`Expr`), fields (`AnnAssign`) and nested classes; its annotations as `Python Types` terms and its defaults, metadata
and decorator arguments as `Python3` terms; and the imports (`ImportFrom`) it needs, first, in `Types`' order. Where
what it wrote goes from there, such as one file that gathers every class, is the caller's.

Where a caller gives one module as the `sync` of several applications, the module does not depend on their order:
classes and Python type aliases are in name order, and a class written after the classes nested in its place takes them
in, as today. mbse-programs found that an upsert writing part of a file's value merges into it, and that writing an
element of a list by its index adds it beside the others; whether an application can insert a class before one already
written, or must write the module's `body` whole, is checked in stage 2.

`text(...)` is `Print.print_module(store, path)`. `problems(...)` is `Check.validate(store, path)` with the check of a
class nested under a field's name; `Check.check(store, path, version)` checks the module at every Python version the mbse repositories support, 3.11
and each later one mbse-programs' standards cover (Decided, 12). A name Python cannot spell is written as the schema has it, and validation
flags it, as today.

### Reading back

Reading back is one transform per file until CAP-317 is met. The caller parses the source into mbse-programs' store,
`store.transaction(Parse.parse(text, path))`, or gives a file already there. The `source` is the file's frame. The
procedure reads the module's value in order: each `@dataclass` class as an object schema, a relation (`LINKS`), or a
union or an intersection (`KIND`), and each Python type alias, an annotated assignment `Name: TypeAlias = ...` (Decided, 12), as a flat union or a named container, as `Schema` and
`AliasSchema` read them today, with the same refusals and messages ("Any is a dropped type, which reading cannot
restore"). It writes the schemas through the `sync`'s or the `target`'s visitor, whichever the caller gives (Decided,
6). Reading back has no parameters, so one application, one transform certificate, covers a file. `frozen` and `slots` are not read back: the generation's certificates
keep them, as today's trace does.

### The trace becomes the certificates

| Today (mbse-patterns 0.9.1's trace) | With mbse-transforms 0.1.0 |
|---|---|
| A session's applications, in order | A history certificate, named by the caller, in a certificates' store the caller names, holding `Transforms.install` |
| An application: its transform's name, its match (`s`), its arguments (`frozen`, `slots`) | A transform certificate: the transform and its prototype, each by object reference; its parameter assignments; `prev` and `next` |
| What an application matched | A sub-certificate per argument: the `source`'s frame (the schema's object reference) and the `sync`'s or the `target`'s frame, each a `References.OfFrame`, with the preceding certificate on the same frame. Applications given one module as their `sync` are chained through its sub-certificates |
| Who decided the application's parameters (the caller, or the policy) | The history certificate's `decisions`, `by`: `"caller"`, `"policy"`, or `"reused"` for a decision an earlier history recorded |
| What an application wrote, a class named by its qualified name in `Codegen.Defined` | The sub-certificate holds the module, not the class, and a `target` given empty holds that class alone; the class itself is not recorded until [CAP-317: transforms targeting value objects](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/README.md#CAP-317) is met. A class is found by its qualified name in the file's value |
| `earlier` applications, reused by key (`Dataclass(s=Contact)`, the schema's name) | A query of the earlier history: the transform certificate of the same transform whose `source` sub-certificate holds the same frame. Whether a schema's object reference is the same in a store made again, as its key by name is today, is checked in stage 3 |
| `session.orphans`, `Transforms.diff` | The same query over two histories, compared with mbse-schemas' `Comparison`: added, removed (the orphans) and changed, as mbse-transforms' RRN-02 shows |
| `dropped(session)` | The drop transforms' certificates in a history (Decided, 5) |
| The trace written and read as data | Certificates are mbse-schemas data, written and read by mbse-schemas' own serialization |

### A policy in place of today's choosing

Today `PLAIN`, a mbse-patterns `Policy`, takes each decision: no class frozen, none with slots, every alias, every drop.
With mbse-transforms a policy ranks and the caller takes. `PLAIN` becomes `Transforms.Policy` of
`Transforms.Clause`s naming `Dataclass`, `Union` and `Intersection` by object reference
(`References.of(transforms, ...)`) with `{"frozen": False, "slots": False}`, and `Entry` with `{"slots": False}`. A
transform without parameters has one candidate a frame, which no clause needs to rank. `generate(schemas, policy,
earlier)` is the caller: for each frame, it reuses the assignments an earlier history recorded where the query finds
them, `by` `"reused"`; else it takes the first candidate `session.ranked(policy)` gives, `by` `"policy"`. A caller that
decides an application's parameters itself iterates the session, takes the candidate it chooses, and certifies it `by` `"caller"`. Ties fall
in mbse-transforms' canonical order.

### The TypeScript side

`Types.ts` is the same module in TypeScript, and its port is the same port: mbse-transforms 0.1.0 is built in
TypeScript (`@mbse/transforms`), with the deliberate differences its
[Equivalence](https://github.com/pitaman71/mbse-transforms/blob/main/docs/EQUIVALENCE.md#deliberate-differences) lists
(an options object for the arguments, parameter assignments as a record), which `Types.ts` follows. mbse-programs'
TypeScript does not build Python 3 trees as values yet (Gaps found, 2), so the TypeScript port is a stage of its own,
after mbse-programs' TypeScript is (stage 5), with the same cases under the same IDs and byte-identical generated
source. Until then, `Types.ts` and its cases are set aside, and TypeScript's gate runs what remains, the skill's checks
(Decided, 9).

## Stages

Each stage passes both gates at 100% (`uv run coverage ...` and `npm run coverage`) with the cases it adds in both test
plans, and lands as a pull request.

1. **Siblings, and transforms as data.** Pins the siblings at their main as stage 1 found them, mbse-schemas 0.35.0,
   mbse-expressions 0.15.2, mbse-programs 0.5.1 and mbse-transforms 0.3.1, each required `<1.0`
   ([PRI-031: the version is the contract](https://github.com/pitaman71/mbse-basis/blob/main/docs/PRINCIPLES.md#PRI-031));
   mbse-patterns removed; 0.17.0. `Types` 0.16's code and cases removed, to be written anew stage by stage.
   `Types.install`: each prototype pattern and its parameters; each transform defined, an install of its own, among
   `Types.INSTALLS`, as every repository's `INSTALLS` runs its installs; with cases that read them back
   (suite INS); the measure of what each prototype's spec states (Decided, 2).

   **Measured** (INS-04): each prototype, run as a query over a store of schemas of every kind, keeps the schemas the
   conditions below state, and what needs an expression is the caller's verification. A symbol of a kind of schema
   (`Schemas.OfObject`) binds named schemas alone, so being named needs no spec item. `S` is the transaction's
   `txn.Schemas`.

   | Prototype | Stated by its spec | Needs an expression (CAP-142) |
   |---|---|---|
   | `Codegen.Dataclass`, `s`: `S.OfObject` | named; `_.s.parameters(lambda a: a.clear())`; `_.s.adjacencies(lambda a: a.remove(lambda e: e.adjacency(lambda j: j.relation([S.OfRelation(lambda r: r.parameters(lambda b: b.insert(lambda h: h)))]))))` | holding nothing unbuilt, at any depth |
   | `Codegen.Entry`, `r`: `S.OfRelation` | named; `_.r.parameters(lambda a: a.clear())` | holding nothing unbuilt; no link declared by an object schema declaring parameters, since a declarer is reached only through the relation's anonymous adjacency (`Schemas.Relating`), which no spec names |
   | `Codegen.Union`, `s`: `S.OfUnion` | named; `_.s.flat(False).branches(lambda a: a.insert(lambda e: e)).parameters(lambda a: a.clear())` | holding nothing unbuilt. `flat(False)` keeps a union that never sets `flat`, which reads false (INS-04's `book.Reach`); only a union whose `flat` is cleared (`flat(None)`, absent) passes neither this spec nor `Codegen.Alias`'s, since a spec states a value or its absence, never "false or absent" |
   | `Codegen.Intersection`, `s`: `S.OfIntersection` | named; `_.s.parts(lambda a: a.insert(lambda e: e)).parameters(lambda a: a.clear())` | holding nothing unbuilt, a flat intersection's inline parts' properties included |
   | `Codegen.Alias`, `s`: `S.OfUnion` | named; `_.s.flat(True).branches(lambda a: a.insert(lambda e: e)).parameters(lambda a: a.clear())` | holding nothing unbuilt |
   | `Codegen.ListAlias`, `s`: `S.OfContainer` | named; `_.s.parameters(lambda a: a.clear())` | its element and index holding nothing unbuilt |
   | `Codegen.DropInlineObject`, `DropInlineRelation`, `DropInlineUnion`, `DropInlineIntersection` and `DropInlineContainer`, each `s` or `r` of its kind | named | holding an inline object, union or intersection where a property, a branch, a part, an element or an index holds a schema, at any depth within inline containers, or, for an object schema, an adjacency to an inline relation: each disjunct, one level deep and of one kind, is stated (`_.s.properties(lambda a: a.insert(lambda e: e.property(lambda p: p.schema([S.OfObject(lambda o: o.name(None))]))))`), and their disjunction at any depth is not |
   | `Codegen.DropUndeclared`, `r`: `S.OfRelation` | named | a link no object schema declares, as `Codegen.Entry`'s |
   | `Codegen.Schema`, `m`: `Programs.Python3.Module` | every module | nothing |

   Holding nothing unbuilt is stated one level deep and one kind at a time, as a removal
   (`_.s.properties(lambda a: a.remove(lambda e: e.property(lambda p: p.schema([S.OfObject(lambda o: o.parameters(lambda b: b.insert(lambda h: h)))])))))`),
   and at any depth it is not; the prototypes state no part of a condition that needs an expression.
2. **To Python.** The procedures of `Dataclass`, `Entry`, `Union`, `Intersection`, `Alias` and `ListAlias`, and the
   drop transforms, writing the module's value; `text`, `problems` and `missing`. TYP's cases of rendering, ported.
3. **Choosing and certificates.** `generate` with `PLAIN` and with the caller's choices; certificates; reruns from an
   earlier history, orphans and diffs; `dropped`. TYP's cases of applications, policies and regeneration, ported.
4. **Reading back**, one transform per file; both round trips, as CAP-039 states them.
5. **TypeScript**, after mbse-programs' TypeScript builds Python 3 trees as values: stages 1 to 4 again, the same
   cases, the generated source byte-identical; `docs/EQUIVALENCE.md` rewritten.
6. **Skill, documents, release.** The skill, README and `AGENTS.md` name mbse-transforms where they named
   mbse-patterns; CAP-027's As built and Current, its Python type aliases written as annotated assignments (Decided,
   12), in a pull request to mbse-basis; 0.17.0, the minor version stage 1 set, since its
   dependents must adapt ([PRI-031: the version is the contract](https://github.com/pitaman71/mbse-basis/blob/main/docs/PRINCIPLES.md#PRI-031)),
   tagged when both languages pass. The tutorials and the skill's notebook links,
   [CAP-246: mbse-codegen-python's tutorials](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/README.md#CAP-246)
   and [CAP-247: mbse-codegen-python's skill linking its notebook cases](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/README.md#CAP-247),
   come after the port, as INI-003 orders them.

Stages 2 to 4 also wait on mbse-schemas' frame transducer (Decided, 3; Gaps found, 3).

## Decided

What the user and the specs settle, each with its source; nothing is left open.

1. **The arguments are the caller's.** A transform does not know the file: "The transforms application procedure does
   not need to know how copies are made since it takes Visitors.OfPattern as an argument." A generating transform takes
   the schema's frame as its `source`, and a `sync` (a module edited in place) or a `target` (an empty module,
   replaced), whichever the caller gives; where what it wrote goes from there is the caller's.
2. **A condition that needs an expression is the caller's verification** until CAP-142 is met, as mbse-transforms'
   first-release proposal has it: its predicates move "into procedures' verifications where they need expressions until
   CAP-142". The procedure does not branch on it.
3. **Frames wait on mbse-schemas' frame transducer.** "A gap or bug found in a sibling is reported to the user ... it is
   fixed in the sibling ... never worked around locally"
   ([PRI-032: a sibling's gap is reported, not worked around](https://github.com/pitaman71/mbse-basis/blob/main/docs/PRINCIPLES.md#PRI-032)).
4. **One drop transform per reason and kind of schema**, each under a name of its own, since the catalog holds each
   transform under its name, as CAP-027 has it: "A reason applies to several kinds of schema, and a transform's symbol
   to one, so each reason is a transform per kind it applies to". They are `DropInlineObject`, `DropInlineRelation`,
   `DropInlineUnion`, `DropInlineIntersection`, `DropInlineContainer` and `DropUndeclared`.
5. **The certificates are the drop report**, CAP-027's trace being the report ("A report of all dropped types and reasons
   should be easy to obtain ... as dropping transform steps"); `dropped` reads the drop transforms' certificates.
6. **Reading back is one transform, `Schema`**, `AliasSchema` merged into it: at file granularity both would bind the
   same file. Its `source` is the file's frame, and its `sync` or `target` is the caller's (1).
7. **Only what has a counterpart in mbse-schemas 0.30 is ported.** A scalar is one of the five basic scalars
   ([CAP-156: the five basic scalars with boundless domains](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-156.md)),
   and a list a container
   ([CAP-108: relations as scalable containers](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-108.md)):
   `NativeAlias` and `DropFormat` go, and widths and tokens leave the `Annotated` metadata. Bridging mbse-expressions'
   domains would be a capability of its own, for the user to open.
8. **The keyed container is asked of mbse-schemas** (PRI-032, as in 3). Until it has a public run-time keyed container
   comparing keys as schema equality does, a container keyed by a `float`, a container or a value object has no Python
   form, and `missing` reports the schema holding it.
9. **Python first**, TypeScript a stage of its own, as in mbse-transforms
   ([its first-release proposal](https://github.com/pitaman71/mbse-transforms/blob/main/docs/proposals/first-release/README.md#decided),
   Decided, 1) and mbse-programs' port.
10. **`Codegen.Output` is retired**: where what the transforms write goes is the caller's (1).
11. **Names**: each prototype is `Codegen.<transform>` (`Codegen.Dataclass`), and the merged reading-back transform keeps
    the name `Schema`.
12. **Generated code is checked at every supported Python version**: "for unit testing, generated code must be checked
    at 3.11, 3.12, etc. you may not cull the compatibility targets". The mbse repositories support Python 3.11 and later
    (`requires-python = ">=3.11"` in polyrepo's repository template), so each generated module passes `Check.check` at
    3.11 and at each later version mbse-programs' standards cover. The `type` statement needs Python 3.12, so `Alias`
    and `ListAlias` write a Python type alias as an annotated assignment, `Name: TypeAlias = ...`, valid from Python
    3.10, which `Schema` reads back; CAP-027 is changed to it in stage 6.
13. **mbse-expressions stays in `siblings.json`**: "this is a polyrepo project in which "transitive" dependencies
    intentionally look like peers".

## Gaps found

Each is reported, not worked around
([PRI-032: a sibling's gap is reported, not worked around](https://github.com/pitaman71/mbse-basis/blob/main/docs/PRINCIPLES.md#PRI-032)).

1. **Resolved by stage 1's pins: mbse-schemas 0.35.0, mbse-expressions 0.15.2, mbse-programs 0.5.1 and mbse-transforms
   0.3.1 each require the others `<1.0`, and install together.** As measured before them:
   **mbse-programs and mbse-expressions required mbse-schemas below 0.29; mbse-transforms required 0.30.1 or later.**
   mbse-programs 0.4.0 requires `mbse-schemas>=0.28.0,<0.29` and `mbse-expressions>=0.11.1,<0.12` (its
   `pyproject.toml`; its `siblings.json` pins mbse-schemas 0.28.0 and mbse-expressions 0.11.1). mbse-expressions 0.12.1,
   its main, requires `mbse-schemas>=0.28.0,<0.29`. mbse-transforms 0.1.0 requires `mbse-schemas>=0.30.1,<0.31` and pins
   0.30.1. mbse-codegen-python needs all three, so it cannot install. In the scratch environment, `uv pip check`
   reports three incompatibilities (mbse-expressions and mbse-programs each requiring mbse-schemas below 0.29, and
   mbse-programs requiring mbse-expressions below 0.12), and `polyrepo.py check`, run in mbse-programs' checkout,
   reports mbse-expressions 0.12.1 and mbse-schemas 0.30.1 incompatible with its pins. Installed against them
   regardless, mbse-programs' `Python3` parsed and printed a dataclass, and `mbse.Transforms` imported; its suites were
   not run there. The session porting mbse-programs owns the move; nothing here changes mbse-programs.
2. **mbse-programs' TypeScript does not build Python 3 trees as values.** Its `typescript5/src` has no `Python3`
   module and no `Framework/Model.ts`, and was last changed at `c20d07b` (2026-10-29), before the port's stage 2; its
   `Framework/Syntax.ts` still defines 0.3's natives (`Native`, `NATIVES`). Its TypeScript tests have none of the Python
   suites the port added (`21_Python3Print`, `40_Python3Parse` to `44_Python3Conformance`). Its port proposal orders
   TypeScript after Python 3's rework (stage 3). mbse-codegen-python's TypeScript waits on it (stage 5).
3. **A query's frames are given back after its transaction ends.** Reported by mbse-transforms
   ([its first-release proposal](https://github.com/pitaman71/mbse-transforms/blob/main/docs/proposals/first-release/README.md#gaps-found),
   Gaps found, 1) and by mbse-programs ([its sibling gaps](https://github.com/pitaman71/mbse-programs/blob/main/docs/proposals/sibling-gaps/README.md),
   12): a caller gets object references, not the `Visitors.OfPattern` an application takes, and mbse-schemas has no
   public way to make one. `generate` and `read` are such callers. mbse-schemas' answer, the frame transducer, is open
   there ([its transaction-object proposal](https://github.com/pitaman71/mbse-schemas/blob/main/docs/proposals/transaction-object/README.md#decided)).
   Decided, 3.
4. **`Proxies.OfIndexed.Map` is gone.** CAP-027 decided that generated code imports mbse-schemas' run-time keyed
   container for keys a `dict` cannot hold faithfully ("dict keyed by a wrapper", in mbse-schemas, "(b)"). mbse-schemas
   0.30.1 has no `Proxies.OfIndexed`, and its `Proxies` exports no keyed container a module could import. Decided, 8.
5. **A prototype's conditions that need an expression wait on CAP-142**, already blocked
   ([CAP-142: expressions evaluated in queries](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-142.md#blocked)).
   Decided, 2. Stage 1 measured which they are (Stages, 1): holding nothing unbuilt at any depth, a link no object
   schema declares, what a drop drops, and a union's `flat` false or cleared (a union that never sets `flat` reads
   false, and `Codegen.Union`'s `flat(False)` keeps it). A callback in a spec cannot stand in for one: it is recorded
   as the expression is built, never evaluated against each candidate, and silently matches nothing (mbse-schemas'
   decoupled-code proposal, Gaps found, 5).
## Risks

- **Inserting into a module's value.** Where one module is the `sync` of several applications, name order may need a
  class written before one already in its `body`; if an application cannot insert there, it writes the `body` whole
  (stage 2 checks it).
- **Cost.** Executing a parse's transaction costs about 4.6 ms a statement (mbse-programs' sibling gaps, 11), and each
  application writes its module; a large schema set generates more slowly than today.
- **Lost links.** Until CAP-317 is met, no certificate links the class an application wrote, which today's trace does.
- **Equivalence.** The TypeScript port waits on another repository, and the release waits for it.

---

<!-- nav -->
[← CAP-027: Python3 source generated from schemas](https://github.com/pitaman71/mbse-basis/blob/main/docs/capabilities/CAP-027.md) · [Home](../../../README.md)
