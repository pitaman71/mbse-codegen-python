"""Types: schemas as Python dataclasses, and dataclasses as schemas, as mbse-transforms' transforms
([CAP-027: Python3 source generated from schemas](mbse:mbse-basis/docs/capabilities/CAP-027.md);
[the port proposal](mbse:mbse-codegen-python/docs/proposals/port/README.md)).

A transform is data: "A transform has a prototype, a procedure, and a cerificate." `install(txn)` writes the
prototypes, mbse-schemas patterns, each named `Codegen.<transform>` (the port proposal, Decided, 11), each declaring the
transform's parameters through mbse-schemas' `Parametrics`; `frozen` and `slots` are `Schemas.OfBool` parameters. Each
transform is then defined by `Transforms.define`, owned by mbse-transforms' catalog (`Transforms.TheCatalog`) under its
name, naming its procedure; a definition is an install like any other. `INSTALLS` lists, in the order they run,
every install a store holding the transforms needs, each run in a transaction of its own, as every repository's
`INSTALLS` does (mbse-programs' `Python3.INSTALLS` among them).

The transforms, as the port proposal's table has them (Decided, 4, 6 and 7):

- `Dataclass`, `Entry`, `Union`, `Intersection`, `Alias` and `ListAlias` write a class or a Python type alias of a named
  schema, `s` (a relation's, `r`);
- `DropInlineObject`, `DropInlineRelation`, `DropInlineUnion`, `DropInlineIntersection`, `DropInlineContainer` and
  `DropUndeclared` drop what a schema of their kind holds that has no Python form, one transform per reason and kind of
  schema;
- `Schema` reads a module, `m`, back into the schemas it describes.

A prototype's spec states what it can state structurally (the port proposal, Decided, 2): a symbol of a kind of schema
binds named schemas alone, so being named needs no spec item. What needs an expression evaluated (being named where the
symbol does not imply it, holding nothing unbuilt at any depth, a link no object schema declares, what a dropped schema
is) waits on [CAP-142: expressions evaluated in queries](mbse:mbse-basis/docs/capabilities/CAP-142.md#blocked), and is
the caller's verification until then.

Each procedure is registered under its transform's name *(agent)*. None is registered yet: the procedures are written
in the port's later stages, and mbse-transforms refuses an application of a transform whose procedure is not registered
(`LookupError`) before anything runs.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from mbse.Programs import Python3
from mbse.Schemas.Framework import Parametrics
from mbse.Transforms import Transforms

__all__ = ["INSTALLS", "install"]

_TRANSFORMS = ("Dataclass", "Entry", "Union", "Intersection", "Alias", "ListAlias", "DropInlineObject",
               "DropInlineRelation", "DropInlineUnion", "DropInlineIntersection", "DropInlineContainer",
               "DropUndeclared", "Schema")
"""The transforms, in the order the port proposal's table gives them, each defined with its prototype,
`Codegen.<transform>`, and the procedure registered under its name."""


def install(txn: Any) -> Any:
    """The prototypes of the transforms, upserted in the store a transaction writes, which holds `Parametrics` and
    mbse-programs' Python 3 schemas: `store.transaction(Types.install)`. Run again, it finds each by its name and writes
    nothing."""
    S, P = txn.Schemas, txn.Parametrics

    frozen = lambda d: d.parameter(lambda p: p.description("Whether the class is frozen").for_value([S.OfBool]))  # noqa: E731
    slots = lambda d: d.parameter(lambda p: p.description(  # noqa: E731
        "Whether the class has slots: fixed attributes, no `__dict__`, smaller and faster").for_value([S.OfBool]))

    return txn.uid("mbse.Codegen.Python/1").mutations([lambda mu: mu.upsert(lambda u: u.exists([lambda p: p
        .symbols({name: S.OfPattern for name in _TRANSFORMS})
        .spec([
            # --- To Python: a named schema's class or Python type alias ---
            lambda _: _.Dataclass.name("Codegen.Dataclass").symbols({"s": S.OfObject}).spec([
                lambda f: f.s.parameters(lambda a: a.clear()),
                lambda f: f.s.adjacencies(lambda a: a.remove(lambda e: e.adjacency(lambda j: j.relation([
                    S.OfRelation(lambda r: r.parameters(lambda b: b.insert(lambda h: h)))])))),
            ]).parameters([P.OfParameters(lambda ps: ps.parameters({"frozen": frozen, "slots": slots}))]),
            lambda _: _.Entry.name("Codegen.Entry").symbols({"r": S.OfRelation}).spec([
                lambda f: f.r.parameters(lambda a: a.clear()),
            ]).parameters([P.OfParameters(lambda ps: ps.parameters({"slots": slots}))]),
            lambda _: _.Union.name("Codegen.Union").symbols({"s": S.OfUnion}).spec([
                lambda f: f.s.flat(False).branches(lambda a: a.insert(lambda e: e)).parameters(lambda a: a.clear()),
            ]).parameters([P.OfParameters(lambda ps: ps.parameters({"frozen": frozen, "slots": slots}))]),
            lambda _: _.Intersection.name("Codegen.Intersection").symbols({"s": S.OfIntersection}).spec([
                lambda f: f.s.parts(lambda a: a.insert(lambda e: e)).parameters(lambda a: a.clear()),
            ]).parameters([P.OfParameters(lambda ps: ps.parameters({"frozen": frozen, "slots": slots}))]),
            lambda _: _.Alias.name("Codegen.Alias").symbols({"s": S.OfUnion}).spec([
                lambda f: f.s.flat(True).branches(lambda a: a.insert(lambda e: e)).parameters(lambda a: a.clear()),
            ]),
            lambda _: _.ListAlias.name("Codegen.ListAlias").symbols({"s": S.OfContainer}),
            # --- Drops: what a schema of the kind holds that has no Python form, by reason ---
            lambda _: _.DropInlineObject.name("Codegen.DropInlineObject").symbols({"s": S.OfObject}),
            lambda _: _.DropInlineRelation.name("Codegen.DropInlineRelation").symbols({"r": S.OfRelation}),
            lambda _: _.DropInlineUnion.name("Codegen.DropInlineUnion").symbols({"s": S.OfUnion}),
            lambda _: _.DropInlineIntersection.name("Codegen.DropInlineIntersection").symbols({"s": S.OfIntersection}),
            lambda _: _.DropInlineContainer.name("Codegen.DropInlineContainer").symbols({"s": S.OfContainer}),
            lambda _: _.DropUndeclared.name("Codegen.DropUndeclared").symbols({"r": S.OfRelation}),
            # --- Reading back: a module's schemas, at file granularity ---
            lambda _: _.Schema.name("Codegen.Schema").symbols({"m": txn.Programs.Python3.Module}),
        ])]))])


def _definition(name: str) -> Callable[[Any], Any]:
    """The transaction that defines the transform `name`: its prototype, `Codegen.<name>`, and the procedure registered
    under its name."""
    return lambda txn: Transforms.define(txn, name, name, getattr(txn.Codegen, name))


INSTALLS = (Parametrics.install, *Python3.INSTALLS, Transforms.install, install, *map(_definition, _TRANSFORMS))
"""Every install a store holding the transforms needs, in the order they run, each in a transaction of its own:
`Parametrics`, mbse-programs' Python 3 schemas, mbse-transforms' schemas, the prototypes, then one definition per
transform. Run again, each writes nothing."""
