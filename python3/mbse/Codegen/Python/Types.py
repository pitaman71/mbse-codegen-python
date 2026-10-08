"""Types: schemas as Python dataclasses, and dataclasses as schemas, step by step.

A session (mbse-patterns' `Transforms`) runs over one store, `store(schemas, module)`: the schemas a store registers and
those they refer to (mbse-schemas' `Reflection.of`), Python's syntax trees (mbse-programs), and the output, whose
singleton `Codegen.Output` holds the module written or read. Each step is one decision:

- `Dataclass` renders an object schema `s` as a class of the module, with a field per property, in order, each optional
  (`name: str | None = None`), then one per adjacency, named after it, holding its entries (`phones: tuple[Phones, ...]
  = ()`); its parameter `frozen` (a `bool`) is the decision. It applies where `s` is named, declares no parameters, every
  property's type renders (a basic native, a named object schema, or a list of them without an extent, positional or
  keyed by a basic native, nested to any depth) and every adjacency is to a named relation. A reference object schema
  compares by identity (`eq=False`), a schema's description is the class's docstring, a singleton's name its
  class variable `SINGLETON`, and a property's or an adjacency's description its field's metadata (`"description"`). Where a schema declares
  adjacencies via several links of one relation (a self-relation), each field's metadata names its link (`"me"`).
- `Union` and `Intersection` render a named union or intersection as a value class of a dataclass field per branch or
  part, each optional, as a proxy's union or intersection value reads it (`card.reach.email`); its class variable
  `KIND` (`"union"`, `"intersection"`) says which. Their parameter `frozen` is the decision, as `Dataclass`'s. A flat
  intersection (mbse-schemas' `flat`) is a class of its parts' properties, as a proxy reads them (`ticket.stamp.at`),
  its class variable `PARTS` saying each part's schema, or the properties of an inline one.
- `Alias` renders a flat union as a type alias of its branches' types (`type Channel = Call | Mail`), as a proxy reads
  its value; its branches' names, where they are not their types' (`call`, `int`, `list`, `dict`), and its description
  are `Annotated` metadata. It has no parameter.
- `Entry` renders a relation as the class of its entries, named after it: a field per link, typed by the object schemas
  that declare an adjacency via it (`Pager | Phone`), then one per property, and class variables `LINKS` and `UNIQUES`.
  An entry is shared by the objects it links, as mbse-schemas' proxies share theirs, so code reads an adjacency and its
  entries alike from proxies and generated classes (`for entry in contact.phones: entry.phone.number`).
- `Schema` reads a `@dataclass` class `c` of the module back: an entry class (with `LINKS`) as a relation, a class with
  `KIND` as a union or an intersection, any other as an object schema, registered in the schemas' store; a class of the
  module a dataclass field names before its own step is registered empty, and filled by that step, and a name that is
  neither a class of the module nor a schema of the store is refused. A field's annotation is read as `Dataclass` and `Entry` write one, and any other is refused.
- `NativeAlias` and `ListAlias` render a named native or list as a type alias of what it holds (`type Word = str`,
  `type Names = list[Word]`), as a proxy reads its value, and a field names it.
- `AliasSchema` reads a type alias of the module back: a flat union of `A | B | ...`, a named native, or a named list.

Each step links what it wrote, by role: a `class`, an `alias`, or, reading back, a `schema` (mbse-patterns' `Wrote`).
`generate(schemas, policy, earlier)` and `read(module, schemas)` run each to the end. `frozen` is the one thing a schema
does not hold: reading code back loses it, and the trace of the generation keeps it. A generation given the steps of an
earlier one takes each decision again where its key (`Dataclass(s=Contact)`, by the schema's name) still occurs, so
after a change of the schemas only a new schema asks; `session.orphans` are the decisions about schemas now gone, and
mbse-patterns' `Transforms.diff` compares the two.
"""

from __future__ import annotations

import functools
import re
from collections.abc import Iterable
from typing import Any

from mbse.Expressions import Expressions as E
from mbse.Patterns import Predicates as P, Transforms as T
from mbse.Programs.Framework import Syntax as Trees
from mbse.Programs.Python import Python312, Syntax as Py
from mbse.Schemas.Framework import Bindings, Proxies, Reflection, Schemas as S, Stores

__all__ = ["OUTPUT", "NATIVES", "KEYWORDS", "Rendered", "Output", "Generated", "store", "Dataclass", "Entry", "Union",
           "Intersection", "Alias", "NativeAlias", "ListAlias", "Schema", "AliasSchema", "TO_PYTHON",
           "FROM_PYTHON", "PLAIN", "missing", "problems",
           "generate", "read", "text"]

OUTPUT = "Codegen.Output"
NATIVES = ("bool", "int", "float", "str", "bytes")
"""The basic natives' tokens, which are also Python's names for them."""
KEYWORDS = ("False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
            "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
            "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield")
"""Python's keywords: a field so named is written with a trailing underscore (`from_`), and read back without it."""

Generated = S.OfRelation.Builder().name("Codegen.Generated").links("output", "module").create()
Defined = S.OfRelation.Builder().name("Codegen.Defined").links("output", "node").properties(
    lambda p: p.name("name").of(lambda t: t.as_native(str))).unique("output", "name").create()
"""What the module defines by qualified name (`Codegen.Output`): each dataclass and type alias, nested ones included;
derived from the module whenever the output is read, so it is never out of date. A name is unique, so a written trace
names a class by it (`Codegen.Output/defined[name="Contact"]`, mbse-schemas' `Paths`), wherever the class is."""
_OutputSchema = S.OfObject.Builder().name(OUTPUT).ref().singleton(OUTPUT).relations(
    lambda r: r.name("modules").of(Generated).me("output"), lambda r: r.name("defined").of(Defined).me("output")).create()


class Output:
    """The output of a session: the module written or read."""

    Schema = _OutputSchema

    def __init__(self, module: Py.Module | None = None):
        self.module = module

    def identity(self) -> int:
        return id(self)

    def schema_name(self) -> str:
        return OUTPUT

    def owner(self) -> None:
        return None

    def accept(self, visitor: Any) -> None:
        Bindings.accept(_BINDING, self, visitor)


_BINDING = Bindings.Binding(
    _OutputSchema, lambda output: Bindings.State({}, {
        "modules": [Bindings.Entry({"module": m}) for m in ([] if output.module is None else [output.module])],
        "defined": [Bindings.Entry({"node": node}, {"name": name})
                    for name, node in ({} if output.module is None else _definitions(output.module)).items()]}),
    lambda state: Output(*[e.links["module"] for e in state.entries.get("modules", [])]))


def store(schemas: Stores.Store, module: Py.Module) -> Stores.Combined:
    """The store a session runs over: the schemas `schemas` registers and those they refer to, Python's syntax trees,
    and the output, which holds `module`."""
    outputs = Bindings.OfStore([(_OutputSchema, lambda instance=None: Bindings.Builder(_BINDING, instance))],
                               [Generated, Defined])
    outputs.singleton(OUTPUT).module = module
    return Stores.Combined(Reflection.of(schemas), Py.LANGUAGE.Builders, outputs)


def _module(store: Stores.Combined) -> Py.Module:
    return store.singleton(OUTPUT).module


def _schemas(store: Stores.Combined) -> Stores.Store:
    return store.stores[0].store


# --- Schemas to classes ---

s, c, n, k, t, p, x, r, a, b, u, y, w, d = (E.variable(name) for name in (
    "s", "c", "n", "k", "t", "p", "x", "r", "a", "b", "u", "y", "w", "d"))


def _pythonic(native: E.Writer) -> E.Writer:
    """Whether a native's token is one Python's types hold: a basic one, or `python3`'s of the same name."""
    return native.get("format").eq("basic").or_(native.get("format").eq("python3").and_(functools.reduce(
        lambda either, other: either.or_(other), [native.get("token").eq(named) for named in NATIVES])))


def _basic(type_: E.Writer) -> E.Writer:
    """A native Python's types hold (see `_pythonic`), its width, description and a `python3` token in `Annotated`
    metadata: one without parameters or a width that is a term, which wait on parameters' Python form."""
    native = type_.get("native")
    return _pythonic(native).and_(native.has("terms").not_()).and_(native.has("parameters").not_())


def _bounded(indexed: E.Writer) -> E.Writer:
    """Whether a list's extent, if it has one, is of int bounds, which `Annotated` metadata holds."""
    return indexed.has("extent").not_().or_(indexed.get("extent").has("terms").not_())


def _simple(type_: E.Writer) -> E.Writer:
    """A basic native, or a named schema of a kind that a class or an alias renders: an object schema, a union, an
    intersection, a native or a list."""
    named = [P.Exists(lambda q, meta=meta: q.symbols({"x": meta}).requires(x.get("name").eq(type_.get("named").get("name"))))
             for meta in (S.OfObject.Schema, S.OfUnion.Schema, S.OfIntersection.Schema, S.OfNative.Schema, S.OfIndexed.Schema)]
    return _basic(type_).or_(E.operation("and", type_.has("named"), functools.reduce(
        lambda either, other: E.operation("or", either, other), named)))


Rendered = P.OfPredicate.Builder().name("Codegen.Rendered").parameters(lambda q: q.name("t")).create()
"""Whether `Dataclass` renders a type `t`: a simple one, or a list of one it renders, its extent if any of int bounds,
positional or keyed by a type it renders, nested to any depth. It applies itself to the list's item."""
P.OfPredicate.Builder(Rendered).requires(_simple(t).or_(t.has("indexed").and_(_bounded(t.get("indexed"))).and_(
    t.get("indexed").has("key").not_().or_(Rendered(t.get("indexed").get("key")))).and_(
    Rendered(t.get("indexed").get("item"))))).update()


def _rendered(type_: E.Writer) -> Any:
    """Whether `Dataclass` renders the type: `Rendered` applied to it."""
    return Rendered(type_)


def _over(symbols: dict[str, Any], constraint: Any) -> P.OfPredicate.Data:
    return P.OfPredicate.Builder().symbols(symbols).requires(constraint).create()


l = E.variable("l")


def _declares(schema: E.Writer, link: E.Writer) -> E.Writer:
    """Whether `schema` declares an adjacency to the relation `r` via `link`."""
    return schema.has("adjacencies").and_(schema.get("adjacencies").any("b", b.get("relation").has("named").and_(
        b.get("relation").get("named").get("name").eq(r.get("name"))).and_(b.get("me").eq(link))))


_RELATED = E.operation("and", a.get("relation").has("named"), P.Exists(lambda q: q.symbols({"r": S.OfRelation.Schema}).requires(
    r.get("name").eq(a.get("relation").get("named").get("name")))))
"""Whether the adjacency `a` is to a named relation, whose entry class its field holds."""
_RENDERABLE = s.has("name").and_(s.has("parameters").not_()).and_(
    s.has("adjacencies").not_().or_(s.get("adjacencies").all("a", _RELATED))).and_(
    s.has("properties").not_().or_(s.get("properties").all("p", _rendered(p.get("type")))))
_ENTRY_RENDERABLE = E.operation("and", r.has("name").and_(r.has("parameters").not_()).and_(
    r.has("properties").not_().or_(r.get("properties").all("p", _rendered(p.get("type"))))),
    r.get("links").all("l", P.Exists(lambda q: q.symbols({"y": S.OfObject.Schema}).requires(_declares(y, l)))))
"""Whether `Entry` renders the relation `r`: named, without parameters, its properties' types rendered, and each link
declared by an object schema, which types it."""
o = E.variable("o")
_HAS_CLASS = P.Exists(lambda q: q.symbols({"o": _OutputSchema}).requires(
    P.Contains(o.defined, lambda e: e.name == s.name and e.node.kind == "ClassDef")))
"""Whether the module defines a class named after `s`, by its qualified name."""


def _name(builder: Any, spelling: str) -> Any:
    return builder.Name().id(spelling)


def _annotation(type_: Any) -> Any:
    """The annotation of a type `Dataclass` renders: a named schema by its name, a dotted one as attributes
    (`Codegen.Output`, a nested class), or what it holds, in `Annotated` with what that annotation cannot say."""
    return (lambda b: _dotted(b, type_.name)) if type_.name is not None else _annotated(_structure_annotation(type_), _facets(type_))


def _facets(type_: Any) -> dict[str, Any]:
    """What a native's or a list's annotation cannot say, as `Annotated` metadata: a native's token where it is not
    `basic` (`"native": ["python3", "int"]`) and its width in bits or bytes, a list's extent, its `minimum` and its
    `maximum` where it has one, and its description."""
    facets: dict[str, Any] = {}
    if isinstance(type_, S.OfNative.Data):
        if type_.token.format != S.BASIC:
            facets["native"] = [type_.token.format, type_.token.name]
        facets.update({unit: width for unit, width in (("bits", type_.bits), ("bytes", type_.bytes)) if width is not None})
    elif isinstance(type_, S.OfIndexed.Data) and type_.extent is not None:
        facets["minimum"] = type_.extent.minimum
        if type_.extent.maximum is not None:
            facets["maximum"] = type_.extent.maximum
    if type_.description is not None:
        facets["description"] = type_.description
    return facets


def _annotated(held: Any, facets: dict[str, Any]) -> Any:
    """`held`, or `Annotated[held, {...}]` where there are facets."""
    return held if not facets else lambda b: b.Subscript().value(lambda x: _name(x, "Annotated")).slice(
        lambda x: x.Tuple().add_elts(held).add_elts(_metadata(facets)))


MAP = "Proxies.OfIndexed.Map"
"""mbse-schemas' keyed list, which generated code holds where a `dict` cannot compare keys as schema equality does."""


def _mapped(key: Any) -> bool:
    """Whether a list keyed by `key` is a `Proxies.OfIndexed.Map`, not a `dict`: a key that is not a native, or a
    `float`, whose NaNs and `-0.0` a `dict` compares otherwise (mbse-schemas' EQUALITY.md)."""
    structure = S.structure(key)
    return not isinstance(structure, S.OfNative.Data) or structure.token.name == "float"


def _dotted(builder: Any, text: str) -> Any:
    """`a.b.c` as names and attributes."""
    *head, last = text.split(".")
    return builder.Attribute().value(lambda x: _dotted(x, ".".join(head))).attr(last) if head else _name(builder, last)


def _structure_annotation(type_: Any) -> Any:
    """The annotation of what a type holds, its name aside: a native's, or a list's of its items, keyed by a `dict` or,
    where a `dict` cannot compare its keys as schema equality does, a `Proxies.OfIndexed.Map`."""
    if isinstance(type_, S.OfIndexed.Data) and type_.key is not None:
        return lambda b: b.Subscript().value(lambda x: _dotted(x, MAP if _mapped(type_.key) else "dict")).slice(
            lambda x: x.Tuple().add_elts(_annotation(type_.key)).add_elts(_annotation(type_.item)))
    if isinstance(type_, S.OfIndexed.Data):
        return lambda b: b.Subscript().value(lambda x: _name(x, "list")).slice(_annotation(type_.item))
    return lambda b: _name(b, type_.token.name)


def _field(name: str) -> str:
    """A property's name as a field's: a keyword with a trailing underscore."""
    return f"{name}_" if name in KEYWORDS else name


def _quoted(text: str) -> str:
    """A string literal of `text`, in double quotes."""
    escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'




_SOURCES = ("__future__", "dataclasses", "typing", "mbse.Schemas.Framework")
"""The modules the steps import from, in the order their imports come."""


def _require(module: Py.Module, source: str, name: str) -> None:
    """Imports `name` from `source`, once, after `from __future__ import annotations`, the imports in the order of
    `_SOURCES`, whichever step needs them first."""
    B = Py.LANGUAGE.Builders
    imports = [statement for statement in module.body if isinstance(statement, Py.ImportFrom)]
    if not imports:
        imports = [B.ImportFrom().module(lambda d: d.add_names("__future__")).add_names(
            lambda a: a.name(lambda d: d.add_names("annotations"))).create()]
        module.body.insert(0, imports[0])
    found = next((i for i in imports if _dotted_name(i.module) == source), None)
    if found is None:
        found = B.ImportFrom().module(lambda d: functools.reduce(lambda b, part: b.add_names(part), source.split("."), d)).create()
        module.body.insert(sum(1 for i in imports if _SOURCES.index(_dotted_name(i.module)) < _SOURCES.index(source)), found)
    names = [alias.name.names[0].spelling for alias in found.names]
    if name not in names:  # in name order, whichever step needs it first
        found.names.insert(sum(1 for other in names if other < name), B.Alias().name(lambda d: d.add_names(name)).create())


def _dotted_name(name: Any) -> str:
    """A `DottedName`'s text."""
    return ".".join(part.spelling for part in name.names)


def _decorator(schema: Any, frozen: bool) -> Any:
    keywords = [(name, "False" if name == "eq" else "True") for name, on in (
        ("eq", getattr(schema, "ref", False)), ("frozen", frozen)) if on]  # a union or intersection is a value
    if not keywords:
        return lambda b: _name(b, "dataclass")
    return lambda b: functools.reduce(
        lambda built, keyword: built.add_keywords(
            lambda w: w.arg(keyword[0]).value(lambda x: x.Constant().spelling(keyword[1]))),
        keywords, b.Call().func(lambda x: _name(x, "dataclass")))


def _union(names: list[str]) -> Any:
    """`A | B | ...` of the names, in order."""
    return functools.reduce(lambda left, name: lambda b: b.BinOp().left(left).op("|").right(lambda x: _dotted(x, name)),
                            names[1:], lambda b: _dotted(b, names[0]))


def _strings(values: list[Any]) -> Any:
    """A tuple of strings, or of tuples of strings."""
    return lambda b: functools.reduce(lambda built, value: built.add_elts(
        _strings(value) if isinstance(value, list) else lambda x: x.Constant().spelling(_quoted(value))), values, b.Tuple())


def _texts(depth: int) -> Any:
    """`tuple[str, ...]`, nested `depth` deep."""
    item = (lambda b: _name(b, "str")) if depth == 1 else _texts(depth - 1)
    return lambda b: b.Subscript().value(lambda x: _name(x, "tuple")).slice(
        lambda x: x.Tuple().add_elts(item).add_elts(lambda y: y.Constant().spelling("...")))


def _class_variable(name: str, depth: int, values: list[Any]) -> Any:
    """`NAME: ClassVar[tuple[str, ...]] = (...)`: what an entry class says of its relation."""
    return Py.LANGUAGE.Builders.AnnAssign().target(lambda b: _name(b, name)).annotation(
        lambda b: b.Subscript().value(lambda x: _name(x, "ClassVar")).slice(_texts(depth))).value(
        lambda b: b.Parenthesized().value(_strings(values))).create()


def _default(default: Any, metadata: dict[str, Any]) -> Any:
    """A field's default as it is, or, where it has metadata, `field(default=..., metadata={...})`."""
    if not metadata:
        return default
    return lambda b: b.Call().func(lambda x: _name(x, "field")).add_keywords(
        lambda kw: kw.arg("default").value(default)).add_keywords(lambda kw: kw.arg("metadata").value(_metadata(metadata)))


def _optional_field(name: str, annotation: Any, description: str | None = None) -> Any:
    """`name: T | None = None`, its description, where it has one, in its metadata."""
    return Py.LANGUAGE.Builders.AnnAssign().target(lambda b: _name(b, _field(name))).annotation(
        lambda b: b.BinOp().left(annotation).op("|").right(lambda x: x.Constant().spelling("None"))).value(
        _default(lambda b: b.Constant().spelling("None"), {} if description is None else {"description": description})).create()


def _annotations(module: Py.Module, built: Any) -> None:
    """Imports `Annotated` and mbse-schemas' `Proxies` where `built` uses them."""
    used = {_spelling(node) for node in Trees.walk(built) if isinstance(node, Py.Name)}
    if "Annotated" in used:
        _require(module, "typing", "Annotated")
    if "Proxies" in used:
        _require(module, "mbse.Schemas.Framework", "Proxies")


def _class_text(name: str, text: str) -> Any:
    """`NAME: ClassVar[str] = "text"`."""
    return Py.LANGUAGE.Builders.AnnAssign().target(lambda b: _name(b, name)).annotation(
        lambda b: b.Subscript().value(lambda x: _name(x, "ClassVar")).slice(lambda x: _name(x, "str"))).value(
        lambda b: b.Constant().spelling(_quoted(text))).create()


def _finish(store: Stores.Combined, built: Any) -> dict[str, Any]:
    """Places a class in the module, with the imports it needs: `dataclass`, `field`, `ClassVar` and `Annotated` where it
    uses them; what the step wrote, by role: the class."""
    module = _module(store)
    _require(module, "dataclasses", "dataclass")
    _annotations(module, built)
    assigned = [statement for statement in built.body if isinstance(statement, Py.AnnAssign)]
    if any(isinstance(statement.value, Py.Call) for statement in assigned):
        _require(module, "dataclasses", "field")
    if any(isinstance(statement.annotation, Py.Subscript) and _spelling(statement.annotation.value) == "ClassVar"
           for statement in assigned):
        _require(module, "typing", "ClassVar")
    _place(module, built)
    return {"class": built}


def _docstring(description: str | None) -> list[Any]:
    return [] if description is None else [
        Py.LANGUAGE.Builders.Expr().value(lambda b: b.Constant().spelling(_quoted(description))).create()]


def _declarers(objects: list[Any], relation: Any, link: str) -> list[Any]:
    """The object schemas that declare an adjacency to `relation` via `link`, in name order: the link's types."""
    return [o for o in objects if any(a.relation is relation and a.me == link for a in o.adjacencies.values())]


def _render(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
    schema = match["s"]
    B = Py.LANGUAGE.Builders
    body = _docstring(schema.description) + ([] if schema.singleton is None else [_class_text("SINGLETON", schema.singleton)])
    body += [_optional_field(name, _annotation(prop.type), prop.description) for name, prop in schema.properties.items()]
    for name, adjacency in schema.adjacencies.items():
        relation = adjacency.relation
        entries = lambda b, relation=relation: b.Subscript().value(lambda x: _name(x, "tuple")).slice(  # noqa: E731
            lambda x: x.Tuple().add_elts(lambda y: _dotted(y, relation.name)).add_elts(lambda y: y.Constant().spelling("...")))
        metadata = {} if adjacency.description is None else {"description": adjacency.description}
        if len({a.me for a in schema.adjacencies.values() if a.relation is relation}) > 1:  # which link, where ambiguous
            metadata["me"] = adjacency.me
        body.append(B.AnnAssign().target(lambda b, name=name: _name(b, _field(name))).annotation(entries).value(
            _default(lambda b: b.Tuple(), metadata)).create())
    built = B.ClassDef().name(schema.name).add_decorator_list(_decorator(schema, arguments["frozen"])).create()
    built.body = body or [B.Pass().create()]
    return _finish(store, built)


def _render_entry(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
    relation = match["r"]
    B = Py.LANGUAGE.Builders
    objects = list(store.extent("Schemas.Object"))
    uniques = sorted(sorted(unique) for unique in relation.uniques)
    body = _docstring(relation.description) + [_class_variable("LINKS", 1, list(relation.links))]
    body += [_class_variable("UNIQUES", 2, uniques)] if uniques else []
    body += [_optional_field(link, _union([o.name for o in _declarers(objects, relation, link)]))
             for link in relation.links]
    body += [_optional_field(name, _annotation(prop.type), prop.description) for name, prop in relation.properties.items()]
    built = B.ClassDef().name(relation.name).add_decorator_list(
        lambda b: b.Call().func(lambda x: _name(x, "dataclass")).add_keywords(
            lambda kw: kw.arg("eq").value(lambda x: x.Constant().spelling("False")))).create()
    built.body = body
    return _finish(store, built)


def _defined(statement: Any) -> str | None:
    """The name a class or a type alias defines, or None for another statement."""
    if isinstance(statement, Py.ClassDef):
        return statement.name.spelling
    return statement.name.id.spelling if isinstance(statement, Py.TypeAlias) else None


def _is_dataclass(statement: Any) -> bool:
    """Whether a statement is a class decorated `@dataclass` or `@dataclass(...)`."""
    return isinstance(statement, Py.ClassDef) and any(
        isinstance(d, Py.Name) and _spelling(d) == "dataclass" or isinstance(d, Py.Call) and isinstance(d.func, Py.Name)
        and _spelling(d.func) == "dataclass" for d in statement.decorator_list)


def _definitions(module: Py.Module) -> dict[str, Any]:
    """The dataclasses and type aliases of the module by qualified name, nested ones within the classes that hold them
    (`Codegen.Output` within `class Codegen`), in the order they come; a class that only holds others is no
    definition of its own."""
    found: dict[str, Any] = {}

    def visit(statements: list[Any], prefix: str) -> None:
        for statement in statements:
            name = _defined(statement)
            if name is not None and (_is_dataclass(statement) or isinstance(statement, Py.TypeAlias)):
                found[prefix + name] = statement
            if isinstance(statement, Py.ClassDef):
                visit(statement.body, f"{prefix}{name}.")

    visit(module.body, "")
    return found


def _qualified(module: Py.Module, statement: Any) -> str:
    """The qualified name of a dataclass or a type alias of the module (`Codegen.Output`)."""
    return next(name for name, defined in _definitions(module).items() if defined is statement)


def _rename(statement: Any, spelling: str) -> None:
    """Gives a class or a type alias the name `spelling`."""
    named = Py.LANGUAGE.Builders.Identifier().spelling(spelling).create()
    if isinstance(statement, Py.ClassDef):
        statement.name = named
    else:
        statement.name.id = named


def _insert(body: list[Any], built: Any) -> None:
    """Inserts a class or a type alias among the definitions of a module's or a class's body, in name order, after what
    else the body holds (imports, a docstring, fields); a body that was only `pass` holds it instead."""
    if len(body) == 1 and isinstance(body[0], Py.Pass):
        body.clear()
    after = [i for i, statement in enumerate(body) if (_defined(statement) or "") > _defined(built)]
    body.insert(after[0] if after else len(body), built)


def _unnest(module: Py.Module, statement: Any, prefix: str) -> None:
    """Moves a definition held under `prefix` to module level, named by its qualified name, which validation flags: a
    class that only holds others moves what it holds instead."""
    if isinstance(statement, Py.ClassDef) and not _is_dataclass(statement):
        for nested in statement.body:
            _unnest(module, nested, f"{prefix}.{_defined(statement)}")
        return
    _rename(statement, f"{prefix}.{_defined(statement)}")
    _insert(module.body, statement)


def _place(module: Py.Module, built: Any) -> None:
    """Places a class or a type alias, named as its schema is, in the module, so that the module does not depend on the order
    of the steps: a dotted name (`Codegen.Output`) as a class nested in the class of its prefix, the prefix's own
    dataclass where it has one (a class written later takes in those nested in its place), else a class that only holds
    others. A prefix that is a type alias cannot hold a class: the class stays at module level, named as given, which
    validation flags."""
    *prefix, last = _defined(built).split(".")
    body: list[Any] = module.body
    for part in prefix:
        held = next((statement for statement in body if _defined(statement) == part), None)
        if isinstance(held, Py.TypeAlias):
            _insert(module.body, built)
            return
        if held is None:
            held = Py.LANGUAGE.Builders.ClassDef().name(part).create()
            held.body = []
            _insert(body, held)
        body = held.body
    _rename(built, last)
    holder = next((statement for statement in body if _defined(statement) == last and isinstance(statement, Py.ClassDef)
                   and not _is_dataclass(statement)), None)
    if holder is not None:
        body.remove(holder)
        for nested in holder.body:
            if isinstance(built, Py.ClassDef):
                _insert(built.body, nested)
            else:  # an alias cannot hold them: at module level, named as given, as if the alias had come first
                _unnest(module, nested, ".".join([*prefix, last]))
    _insert(body, built)


Dataclass = T.Transform(
    "Dataclass", _over({"s": S.OfObject.Schema}, _RENDERABLE), _over({"s": S.OfObject.Schema}, _HAS_CLASS),
    [lambda q: q.name("frozen").of(lambda x: x.as_native(bool)).description("Whether the class is frozen")], _render)
"""An object schema as a dataclass of the module."""

Entry = T.Transform(
    "Entry", _over({"r": S.OfRelation.Schema}, _ENTRY_RENDERABLE), _over({"r": S.OfRelation.Schema}, P.Exists(
        lambda q: q.symbols({"o": _OutputSchema}).requires(
            P.Contains(o.defined, lambda e: e.name == r.name and e.node.kind == "ClassDef")))), rewrite=_render_entry)
"""A relation as the class of its entries: a field per link, typed by the object schemas that declare it, then one per
property, and class variables `LINKS` and `UNIQUES` that say which fields are links and what is unique."""

_MEMBERS = {"union": "branches", "intersection": "parts"}
"""Where a union's and an intersection's members are, in their module form and their data."""


def _object_rendered(type_: E.Writer) -> E.Writer:
    """Whether a part's type is an object schema whose properties render: inline, or named."""
    inline = type_.get("object")
    renders = lambda o: o.has("properties").not_().or_(o.get("properties").all("q", _rendered(E.variable("q").get("type"))))  # noqa: E731
    named = P.Exists(lambda q: q.symbols({"x": S.OfObject.Schema}).requires(
        x.get("name").eq(type_.get("named").get("name"))).requires(renders(x)))
    return E.operation("or", type_.has("object").and_(renders(inline)), E.operation("and", type_.has("named"), named))


def _variants_renderable(kind: str, flat: bool) -> Any:
    members = _MEMBERS[kind]
    flatness = s.has("flat") if flat else s.has("flat").not_()
    each = _object_rendered(p.get("type")) if kind == "intersection" and flat else _rendered(p.get("type"))
    return s.has("name").and_(s.has("parameters").not_()).and_(flatness).and_(s.has(members)).and_(s.get(members).all("p", each))


def _convention(type_: Any) -> str:
    """The name a flat union's branch has unless its alias says otherwise: its type's, as Python writes it."""
    if type_.name is not None:
        return _snake(type_.name)
    if isinstance(type_, S.OfIndexed.Data):
        return "list" if type_.key is None else "dict"
    return type_.token.name


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _metadata(entries: dict[str, Any]) -> Any:
    """A dict literal of text, ints, and lists and dicts of them."""
    def literal(value: Any) -> Any:
        if isinstance(value, str):
            return lambda b: b.Constant().spelling(_quoted(value))
        if isinstance(value, int):
            return lambda b: b.Constant().spelling(str(value))
        if isinstance(value, list):
            return lambda b: functools.reduce(lambda built, item: built.add_elts(literal(item)), value, b.List())
        return lambda b: functools.reduce(lambda built, item: built.add_items(
            lambda i: i.key(literal(item[0])).value(literal(item[1]))), value.items(), b.Dict())
    return literal(entries)


def _render_alias(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
    schema = match["s"]
    B = Py.LANGUAGE.Builders
    union = functools.reduce(lambda left, branch: lambda b: b.BinOp().left(left).op("|").right(_annotation(branch.type)),
                             schema.branches[1:], _annotation(schema.branches[0].type))
    metadata: dict[str, Any] = {}
    if [branch.name for branch in schema.branches] != [_convention(branch.type) for branch in schema.branches]:
        metadata["branches"] = [branch.name for branch in schema.branches]
    if schema.description is not None:
        metadata["description"] = schema.description
    described = {branch.name: branch.description for branch in schema.branches if branch.description is not None}
    if described:
        metadata["descriptions"] = described
    module = _module(store)
    alias = B.TypeAlias().name(lambda b: b.id(schema.name)).value(_annotated(union, metadata)).create()
    _annotations(module, alias)
    _place(module, alias)
    return {"alias": alias}


def _render_variants(kind: str) -> Any:
    def render(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
        schema = match["s"]
        B = Py.LANGUAGE.Builders
        members = getattr(schema, _MEMBERS[kind])
        body = _docstring(schema.description) + [_class_text("KIND", kind)]
        if schema.flat:  # an intersection's parts' properties as its own, and which part each is from
            parts = {part.name: part.type.name if part.type.name is not None else list(part.type.properties)
                     for part in members}
            body.append(B.AnnAssign().target(lambda b: _name(b, "PARTS")).annotation(
                lambda b: b.Subscript().value(lambda x: _name(x, "ClassVar")).slice(lambda x: x.Subscript().value(
                    lambda y: _name(y, "dict")).slice(lambda y: y.Tuple().add_elts(lambda z: _name(z, "str")).add_elts(
                        lambda z: z.BinOp().left(lambda w: _name(w, "str")).op("|").right(_texts(1)))))).value(
                lambda b: functools.reduce(lambda built, item: built.add_items(lambda i: i.key(
                    lambda k: k.Constant().spelling(_quoted(item[0]))).value(
                    (lambda v: v.Constant().spelling(_quoted(item[1]))) if isinstance(item[1], str) else
                    (lambda v: v.Parenthesized().value(_strings(item[1]))))), parts.items(), b.Dict())).create())
            described = {part.name: part.description for part in members if part.description is not None}
            if described:  # the parts' own descriptions, which no field holds
                body.append(B.AnnAssign().target(lambda b: _name(b, "DESCRIPTIONS")).annotation(
                    lambda b: b.Subscript().value(lambda x: _name(x, "ClassVar")).slice(lambda x: x.Subscript().value(
                        lambda y: _name(y, "dict")).slice(lambda y: y.Tuple().add_elts(lambda z: _name(z, "str")).add_elts(
                            lambda z: _name(z, "str"))))).value(_metadata(described)).create())
            members = [prop for part in members for prop in S.structure(part.type).properties.values()]
        body += [_optional_field(member.name, _annotation(member.type), member.description) for member in members]
        built = B.ClassDef().name(schema.name).add_decorator_list(_decorator(schema, arguments["frozen"])).create()
        built.body = body
        return _finish(store, built)
    return render


def _variants(kind: str, meta: Any) -> T.Transform:
    renderable = _variants_renderable(kind, False)
    if kind == "intersection":
        renderable = E.operation("or", renderable, _variants_renderable(kind, True))
    return T.Transform(
        kind.capitalize(), _over({"s": meta}, renderable), _over({"s": meta}, _HAS_CLASS),
        [lambda q: q.name("frozen").of(lambda x: x.as_native(bool)).description("Whether the class is frozen")],
        _render_variants(kind))


al = E.variable("al")
_HAS_ALIAS = P.Exists(lambda q: q.symbols({"o": _OutputSchema}).requires(
    P.Contains(o.defined, lambda e: e.name == s.name and e.node.kind == "TypeAlias")))
"""Whether the module defines a type alias named after `s`, by its qualified name."""


Union = _variants("union", S.OfUnion.Schema)
"""A named union as a class of a field per branch, of which one is set, as a proxy's union value reads it, its class
variable `KIND` `"union"`."""
Intersection = _variants("intersection", S.OfIntersection.Schema)
Alias = T.Transform("Alias", _over({"s": S.OfUnion.Schema}, _variants_renderable("union", True)),
                    _over({"s": S.OfUnion.Schema}, _HAS_ALIAS), rewrite=_render_alias)
"""A flat union as a type alias of its branches' types (`type Channel = Call | Mail`), as a proxy reads its value; its
branches' names and its description, where it has them, in `Annotated` metadata."""


def _render_named(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
    """A named native or list as a type alias of what it holds, what that annotation cannot say (a width, an extent, a
    description) in `Annotated` metadata."""
    schema = match["s"]
    module = _module(store)
    alias = Py.LANGUAGE.Builders.TypeAlias().name(lambda b: b.id(schema.name)).value(
        _annotated(_structure_annotation(schema), _facets(schema))).create()
    _annotations(module, alias)
    _place(module, alias)
    return {"alias": alias}


_NAMED = s.has("name").and_(s.has("parameters").not_())
NativeAlias = T.Transform("NativeAlias", _over({"s": S.OfNative.Schema}, _NAMED.and_(_pythonic(s)).and_(
    s.has("terms").not_())),
    _over({"s": S.OfNative.Schema}, _HAS_ALIAS), rewrite=_render_named)
"""A named native Python's types hold (see `_pythonic`) as a type alias of Python's type for it (`type Word = str`), as a
proxy reads its value."""
ListAlias = T.Transform("ListAlias", _over({"s": S.OfIndexed.Schema}, _NAMED.and_(_bounded(s)).and_(
    s.has("key").not_().or_(_rendered(s.get("key")))).and_(_rendered(s.get("item")))),
    _over({"s": S.OfIndexed.Schema}, _HAS_ALIAS), rewrite=_render_named)
"""A named list as a type alias of `list[T]` or `dict[K, T]` (`type Names = list[str]`), as a proxy reads its value."""
"""A named intersection as a class of a field per part, as a proxy's intersection value reads it, its class variable
`KIND` `"intersection"`."""

# --- Classes to schemas ---

_NAMED_DATACLASS = P.Contains(n.children, lambda e: e.property == "id" and e.child.spelling == "dataclass")
_DECORATED = E.operation(
    "or", P.Exists(lambda q: q.symbols({"n": Py.Name.Schema}).requires(
        P.Contains(c.children, lambda e: e.property == "decorator_list" and e.child == n)).requires(_NAMED_DATACLASS)),
    P.Exists(lambda q: q.symbols({"k": Py.Call.Schema, "n": Py.Name.Schema}).requires(
        P.Contains(c.children, lambda e: e.property == "decorator_list" and e.child == k)).requires(
        P.Contains(k.children, lambda e: e.property == "func" and e.child == n)).requires(_NAMED_DATACLASS)))
_FIELDS = c.entries("children").count_where("f", E.variable("f").get("property").eq("body").and_(
    E.variable("f").get("child").get("kind").eq("AnnAssign")))
_ADJACENCIES = t.get("adjacencies").count()
_PROPERTIES = t.get("properties").count()
_UNEQUAL = P.Exists(lambda q: q.symbols({"k": Py.Call.Schema, "w": Py.Keyword.Schema}).requires(
    P.Contains(c.children, lambda e: e.property == "decorator_list" and e.child == k)).requires(
    P.Contains(k.children, lambda e: e.property == "keywords" and e.child == w)).requires(
    P.Contains(w.children, lambda e: e.property == "arg" and e.child.spelling == "eq")).requires(
    P.Contains(w.children, lambda e: e.property == "value" and e.child.spelling == "False")))
"""Whether the class `c` is `@dataclass(eq=False)`: a reference object's."""
_DOCUMENTED = P.Exists(lambda q: q.symbols({"d": Py.Expr.Schema}).requires(
    P.Contains(c.children, lambda e: e.property == "body" and e.index == 0 and e.child == d)).requires(
    P.Contains(d.children, lambda e: e.property == "value" and e.child.kind == "Constant")))
"""Whether the class `c` has a docstring."""


def _counted(fields: E.Writer) -> E.Writer:
    """Whether the object schema `t` has a property or an adjacency per field."""
    return t.has("properties").and_(t.has("adjacencies")).and_(_PROPERTIES.add(_ADJACENCIES).eq(fields)).or_(
        t.has("properties").and_(t.has("adjacencies").not_()).and_(_PROPERTIES.eq(fields))).or_(
        t.has("properties").not_().and_(t.has("adjacencies")).and_(_ADJACENCIES.eq(fields))).or_(
        t.has("properties").not_().and_(t.has("adjacencies").not_()).and_(fields.eq(0)))


_COUNTED = t.has("singleton").and_(_counted(_FIELDS.sub(1))).or_(t.has("singleton").not_().and_(_counted(_FIELDS)))
"""Whether `t` has a property or an adjacency per field of `c`, its `SINGLETON` aside."""
_C_IS_T = P.Exists(lambda q: q.symbols({"o": _OutputSchema}).requires(
    P.Contains(o.defined, lambda e: e.node == c and e.name == t.name)))
"""Whether the class `c` is named after the schema `t`, by its qualified name."""
_C_IS_R = P.Exists(lambda q: q.symbols({"o": _OutputSchema}).requires(
    P.Contains(o.defined, lambda e: e.node == c and e.name == r.name)))
_HAS_SCHEMA = E.operation(
    "or", P.Exists(lambda q: q.symbols({"t": S.OfObject.Schema}).requires(_C_IS_T).requires(
        t.has("ref").eq(_UNEQUAL).and_(t.has("description").eq(_DOCUMENTED))).requires(_COUNTED)),
    E.operation("or", P.Exists(lambda q: q.symbols({"r": S.OfRelation.Schema}).requires(_C_IS_R).requires(
        r.has("links"))), E.operation("or", *[P.Exists(lambda q, meta=meta, members=members: q.symbols({"t": meta}).requires(
            _C_IS_T).requires(t.has(members))) for meta, members in ((S.OfUnion.Schema, "branches"), (S.OfIntersection.Schema, "parts"))])))
"""Whether the class `c` has been read: an object schema named after it, a reference object's where `c` is
`eq=False`, described where it has a docstring, with a property or an adjacency per field; or a relation named after it,
with its links; or a union or an intersection named after it, with its members."""


def _spelling(node: Any) -> str:
    return node.id.spelling


def _type(schemas: Stores.Store, annotation: Any, where: str, module: Py.Module) -> Any:
    """The type an annotation `Dataclass` writes names: a basic native, a named schema, or a list or dict of them, in
    `Annotated` with what their annotation cannot say."""
    if isinstance(annotation, Py.Subscript) and isinstance(annotation.value, Py.Name) and _spelling(annotation.value) == "Annotated":
        held, facets = annotation.slice.elts[0], _literal(annotation.slice.elts[1])
        return _faceted(_type(schemas, held, where, module), facets).update()
    if isinstance(annotation, (Py.Name, Py.Attribute)) and _head(annotation) is not None:
        name = _head(annotation)
        return S.OfNative.Data({"bool": bool, "int": int, "float": float, "str": str, "bytes": bytes}[name]) if (
            name in NATIVES) else _named(schemas, name, module, where)
    container = _head(annotation.value) if isinstance(annotation, Py.Subscript) else None
    if container == "list":
        return S.OfIndexed.Builder().of(_type(schemas, annotation.slice, where, module)).create()
    if container in ("dict", MAP) and isinstance(annotation.slice, Py.Tuple) and len(annotation.slice.elts) == 2:
        key, item = (_type(schemas, element, where, module) for element in annotation.slice.elts)
        return S.OfIndexed.Builder().key(key).of(item).create()
    raise ValueError(f"{where}: cannot read the annotation {Python312.print(annotation).strip()}")


def _faceted(type_: Any, facets: dict[str, Any]) -> Any:
    """A builder of the native or list `type_` with the facets `Annotated` metadata gives it (see `_facets`)."""
    if isinstance(type_, S.OfNative.Data):
        builder = S.OfNative.Builder(type_)
        builder = builder.token(*facets["native"]) if "native" in facets else builder
        for unit in ("bits", "bytes"):
            builder = getattr(builder, unit)(facets[unit]) if unit in facets else builder
    else:
        builder = S.OfIndexed.Builder(type_)
        builder = builder.extent(facets["minimum"], facets.get("maximum")) if "minimum" in facets else builder
    return _described(builder, facets.get("description"))


def _head(node: Any) -> str | None:
    """The dotted text of a name or of attributes of a name (`Proxies.OfIndexed.Map`), or None for another expression."""
    if isinstance(node, Py.Attribute):
        held = _head(node.value)
        return None if held is None else f"{held}.{node.attr.spelling}"
    return _spelling(node) if isinstance(node, Py.Name) else None


def _named(schemas: Stores.Store, name: str, module: Py.Module, where: str = "") -> Any:
    """The schema registered as `name`, or, where the module has a class of that name, one registered empty, to be
    filled when that class is read: a union or an intersection where the class says so (`KIND`), else an object schema.
    A name that is neither is refused: reading never makes up a schema."""
    if name not in schemas.names():
        cls = _definitions(module).get(name)
        if cls is None:
            raise ValueError(f"{where}: {name} is not a class of the module or a schema of the store")
        if isinstance(cls, Py.TypeAlias):
            return _alias_schema(schemas, module, name, cls)
        kind = _class_variables(cls).get("KIND")
        builder = {"union": S.OfUnion.Builder, "intersection": S.OfIntersection.Builder}.get(kind, S.OfObject.Builder)
        schemas.register(builder().name(name).create())
    return schemas.registered(name)


def _aliased(alias: Any) -> tuple[Any, dict[str, Any]]:
    """What a type alias holds, and its `Annotated` metadata."""
    value = alias.value
    if isinstance(value, Py.Subscript) and isinstance(value.value, Py.Name) and _spelling(value.value) == "Annotated":
        return value.slice.elts[0], _literal(value.slice.elts[1])
    return value, {}


_READING: set[str] = set()
"""The named lists being read, so that one that holds itself through aliases alone is refused."""


def _alias_schema(schemas: Stores.Store, module: Py.Module, name: str, alias: Any) -> Any:
    """The schema a type alias's value says, registered as `name`: of `A | B`, a flat union, registered empty and filled
    when its alias is read, since its branches may name classes not read yet; of a native's name, a named native, and of
    `list[...]` or `dict[...]`, a named list, each read in full now, with its description. Anything else is refused."""
    value, metadata = _aliased(alias)
    if isinstance(value, Py.BinOp) and value.op == "|":
        schemas.register(S.OfUnion.Builder().name(name).flat().create())
        return schemas.registered(name)
    native = isinstance(value, Py.Name) and _spelling(value) in NATIVES
    if not native and not (isinstance(value, Py.Subscript) and _head(value.value) in ("list", "dict", MAP)):
        raise ValueError(f"{name}: cannot read the alias of {Python312.print(value).strip()}")
    if name in _READING:
        raise ValueError(f"{name}: a list that holds itself through aliases alone has no Python form")
    _READING.add(name)
    try:
        held = _type(schemas, value, name, module)
    finally:
        _READING.discard(name)
    builder = (S.OfNative.Builder().name(name).token(held.token.format, held.token.name) if native
               else S.OfIndexed.Builder().name(name).of(held.item))
    builder = builder.key(held.key) if not native and held.key is not None else builder
    schemas.register(_faceted(builder.create(), metadata).update())
    return schemas.registered(name)


def _optional(annotation: Any) -> Any:
    """`T` of `T | None`."""
    if isinstance(annotation, Py.BinOp) and annotation.op == "|" and isinstance(annotation.right, Py.Constant) and (
            annotation.right.spelling == "None"):
        return annotation.left
    return annotation


def _unquoted(spelling: str) -> str:
    """The text of a string literal in double or single quotes, or triple ones."""
    quote = spelling[:3] if spelling[:3] in ('"""', "'''") else spelling[0]
    inner = spelling[len(quote):-len(quote)]
    return re.sub(r"\\(.)", lambda m: "\n" if m.group(1) == "n" else m.group(1), inner, flags=re.DOTALL)


def _property(field: str) -> str:
    """A field's name as a property's: a keyword's trailing underscore dropped."""
    return field[:-1] if field.endswith("_") and field[:-1] in KEYWORDS else field


def _keywords(decorator: Any) -> dict[str, str]:
    return {kw.arg.spelling: kw.value.spelling for kw in decorator.keywords} if isinstance(decorator, Py.Call) else {}




def _literal(node: Any) -> Any:
    """The value of a literal the steps write: text, an int, or a tuple, list or dict of literals."""
    node = node.value if isinstance(node, Py.Parenthesized) else node
    if isinstance(node, Py.Dict):
        return {_literal(item.key): _literal(item.value) for item in node.items}
    if isinstance(node, (Py.Tuple, Py.List)):
        return [_literal(item) for item in node.elts]
    return _unquoted(node.spelling) if node.spelling[0] in "'\"" else int(node.spelling)


def _field_metadata(field: Any) -> dict[str, Any]:
    """A field's metadata: `field(..., metadata={...})`'s, or none."""
    if not isinstance(field.value, Py.Call):
        return {}
    return next((_literal(kw.value) for kw in field.value.keywords if kw.arg.spelling == "metadata"), {})


def _described(builder: Any, description: str | None) -> Any:
    return builder if description is None else builder.description(description)


def _class_variables(cls: Any) -> dict[str, Any]:
    """The values of a class's `ClassVar`s, by name: text, or tuples, lists and dicts of them."""
    return {_spelling(statement.target): _literal(statement.value) for statement in cls.body
            if isinstance(statement, Py.AnnAssign) and isinstance(statement.annotation, Py.Subscript)
            and isinstance(statement.annotation.value, Py.Name) and _spelling(statement.annotation.value) == "ClassVar"}


def _fields(cls: Any) -> list[Any]:
    """A class's fields: its annotated names but its `ClassVar`s."""
    variables = _class_variables(cls)
    return [statement for statement in cls.body
            if isinstance(statement, Py.AnnAssign) and _spelling(statement.target) not in variables]


def _entry_class(module: Py.Module, name: str) -> Any:
    """The entry class (with `LINKS`) named `name` in the module, if any."""
    found = _definitions(module).get(name)
    return found if isinstance(found, Py.ClassDef) and "LINKS" in _class_variables(found) else None


def _alternatives(node: Any) -> list[str]:
    """The names of `A | B | ...`, in order, dotted ones included."""
    if isinstance(node, Py.BinOp) and node.op == "|":
        return [*_alternatives(node.left), *_alternatives(node.right)]
    return [] if _head(node) is None else [_head(node)]


def _entries(annotation: Any) -> str | None:
    """The entry class `tuple[R, ...]` holds, or None for another annotation."""
    if isinstance(annotation, Py.Subscript) and isinstance(annotation.value, Py.Name) and (
            _spelling(annotation.value) == "tuple") and isinstance(annotation.slice, Py.Tuple) and len(
            annotation.slice.elts) == 2:
        return _head(annotation.slice.elts[0])
    return None


def _me(module: Py.Module, owner: str, field: Any, relation: str, where: str) -> str:
    """The link an adjacency field is from: its metadata's `me`, else the one link of its entry class typed by the owner."""
    if "me" in _field_metadata(field):
        return _field_metadata(field)["me"]
    entry = _entry_class(module, relation)
    links = _class_variables(entry)["LINKS"] if entry is not None else []
    typed = [link for statement in (_fields(entry) if entry is not None else []) for link in [_spelling(statement.target)]
             if link in links and owner in _alternatives(_optional(statement.annotation))]
    if len(typed) != 1:
        raise ValueError(f"{where}: cannot tell which link of {relation} it is from")
    return typed[0]


def _relation(schemas: Stores.Store, module: Py.Module, name: str, where: str) -> Any:
    """The relation registered as `name`, read from its entry class first where the module has it and it has no links."""
    if name not in schemas.names():
        schemas.register(S.OfRelation.Builder().name(name).create())
    relation = schemas.registered(name)
    entry = _entry_class(module, name)
    if not relation.links and entry is not None:
        _read_entry(schemas, module, entry)
    if not relation.links:
        raise ValueError(f"{where}: {name} is not a relation the module or the store holds")
    return relation


def _read_entry(schemas: Stores.Store, module: Py.Module, cls: Any) -> None:
    """Fills the relation an entry class describes: its links, its properties, its uniques and its description."""
    name = _qualified(module, cls)
    if name not in schemas.names():
        schemas.register(S.OfRelation.Builder().name(name).create())
    variables = _class_variables(cls)
    links = variables["LINKS"]
    properties = [lambda q, f=_property(_spelling(field.target)), y=_type(
        schemas, _optional(field.annotation), f"{name}.{_spelling(field.target)}", module),
        d=_field_metadata(field).get("description"): _described(q.name(f).of(y), d)
        for field in _fields(cls) if _spelling(field.target) not in links]
    builder = S.OfRelation.Builder(schemas.registered(name)).links(*links).properties(*properties)
    builder = functools.reduce(lambda built, unique: built.unique(*unique), variables.get("UNIQUES", []), builder)
    docstring = _docstring_of(cls)
    if docstring is not None:
        builder = builder.description(docstring)
    builder.update()


def _read_variants(schemas: Stores.Store, module: Py.Module, cls: Any, kind: str) -> None:
    """Fills the union or intersection a class describes (`KIND`): a branch or part per field, or, flat (`PARTS`), a
    part per entry of `PARTS`, a named object schema or an inline one of the properties it lists; and its
    description."""
    name = _qualified(module, cls)
    typed = {_property(_spelling(field.target)): _type(schemas, _optional(field.annotation),
                                                       f"{name}.{_spelling(field.target)}", module)
             for field in _fields(cls)}
    described = {_property(_spelling(field.target)): _field_metadata(field).get("description") for field in _fields(cls)}
    parts = _class_variables(cls).get("PARTS")
    if parts is None:
        members = [lambda q, f=f, y=y: _described(q.name(f).of(y), described[f]) for f, y in typed.items()]
    else:
        own = _class_variables(cls).get("DESCRIPTIONS", {})
        members = [lambda q, f=part, y=(_named(schemas, held, module, f"{name}.PARTS") if isinstance(held, str) else
                                        S.OfObject.Builder().properties(*[lambda r, g=g: _described(r.name(g).of(typed[g]), described[g])
                                                                          for g in held]).create()):
                   _described(q.name(f).of(y), own.get(f)) for part, held in parts.items()]
    data = _named(schemas, name, module)
    builder = (S.OfUnion.Builder(data).branches(*members) if kind == "union" else
               S.OfIntersection.Builder(data).parts(*members).flat(parts is not None))
    docstring = _docstring_of(cls)
    if docstring is not None:
        builder = builder.description(docstring)
    builder.update()


def _docstring_of(cls: Any) -> str | None:
    body = list(cls.body)
    if body and isinstance(body[0], Py.Expr) and isinstance(body[0].value, Py.Constant):
        return _unquoted(body[0].value.spelling)
    return None


def _read_class(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
    """Reads a class back; what the step wrote, by role: the schema."""
    cls = match["c"]
    schemas, module = _schemas(store), _module(store)
    name = _qualified(module, cls)
    if "LINKS" in _class_variables(cls):
        _read_entry(schemas, module, cls)
        return {"schema": schemas.registered(name)}
    kind = _class_variables(cls).get("KIND")
    if kind is not None:
        _read_variants(schemas, module, cls, kind)
        return {"schema": schemas.registered(name)}
    properties, adjacencies = [], []
    for field in _fields(cls):
        field_name, where = _property(_spelling(field.target)), f"{name}.{_spelling(field.target)}"
        relation_name = _entries(field.annotation)
        description = _field_metadata(field).get("description")
        if relation_name is None:
            properties.append(lambda q, f=field_name, y=_type(schemas, _optional(field.annotation), where, module),
                              d=description: _described(q.name(f).of(y), d))
        else:
            relation = _relation(schemas, module, relation_name, where)
            me = _me(module, name, field, relation_name, where)
            adjacencies.append(lambda q, f=field_name, rel=relation, me=me, d=description: _described(q.name(f).of(rel).me(me), d))
    builder = S.OfObject.Builder(_named(schemas, name, module)).properties(*properties).relations(*adjacencies)
    singleton = _class_variables(cls).get("SINGLETON")
    if singleton is not None:
        builder = builder.singleton(singleton)
    if any(_keywords(decorated).get("eq") == "False" for decorated in cls.decorator_list):
        builder = builder.ref()
    docstring = _docstring_of(cls)
    if docstring is not None:
        builder = builder.description(docstring)
    return {"schema": builder.update()}


def _branches(node: Any) -> list[Any]:
    """The types of `A | B | ...`, in order: names or subscripts."""
    if isinstance(node, Py.BinOp) and node.op == "|":
        return [*_branches(node.left), *_branches(node.right)]
    return [node]


def _named_convention(node: Any) -> str:
    """The name a branch has unless its alias says otherwise, from its annotation, as `_convention` from its type."""
    if isinstance(node, Py.Subscript) and isinstance(node.value, Py.Name) and _spelling(node.value) == "Annotated":
        return _named_convention(node.slice.elts[0])
    if isinstance(node, Py.Subscript):
        return "dict" if _head(node.value) == MAP else _spelling(node.value)
    name = _head(node)
    return name if name in NATIVES else _snake(name)


def _read_alias(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> dict[str, Any]:
    """Reads a type alias back as the schema its value says (see `_alias_schema`); what the step wrote: the schema."""
    alias = match["al"]
    schemas, module = _schemas(store), _module(store)
    name = _qualified(module, alias)
    value, metadata = _aliased(alias)
    schema = _named(schemas, name, module)
    if not isinstance(schema, S.OfUnion.Data):  # a native or a list, read in full when it was first named
        return {"schema": schema}
    nodes = _branches(value)
    names = metadata.get("branches", [_named_convention(node) for node in nodes])
    described = metadata.get("descriptions", {})
    builder = S.OfUnion.Builder(schema).branches(
        *[lambda q, f=f, node=node: _described(q.name(f).of(_type(schemas, node, f"{name}.{f}", module)), described.get(f))
          for f, node in zip(names, nodes)]).flat()
    if "description" in metadata:
        builder = builder.description(metadata["description"])
    return {"schema": builder.update()}


_ALIASED = functools.reduce(lambda either, other: E.operation("or", either, other), [
    P.Exists(lambda q, meta=meta, filled=filled: q.symbols({"t": meta, "o": _OutputSchema}).requires(
        P.Contains(o.defined, lambda e: e.node == al and e.name == t.name)).requires(t.has(filled)))
    for meta, filled in ((S.OfUnion.Schema, "branches"), (S.OfNative.Schema, "token"), (S.OfIndexed.Schema, "item"))])
"""Whether a schema named after the alias `al` has been read: a union with branches, a native with a token, or a list
with an item."""
AliasSchema = T.Transform("AliasSchema", _over({"al": Py.TypeAlias.Schema}, al.has("kind")),
                          _over({"al": Py.TypeAlias.Schema}, _ALIASED), rewrite=_read_alias)
"""A type alias of the module as a schema: of `A | B | ...`, a flat union, a branch per type, named after it or as its
`Annotated` metadata says; of a native's name, a named native; of `list[...]` or `dict[...]`, a named list; its
description, where it has one, from its `Annotated` metadata."""

Schema = T.Transform("Schema", _over({"c": Py.ClassDef.Schema}, _DECORATED),
                     _over({"c": Py.ClassDef.Schema}, _HAS_SCHEMA), rewrite=_read_class)
"""A dataclass of the module as an object schema, or an entry class (with `LINKS`) as a relation."""

TO_PYTHON = (Dataclass, Entry, Union, Intersection, Alias, NativeAlias, ListAlias)
FROM_PYTHON = (Schema, AliasSchema)
PLAIN = T.Policy(T.Clause("Dataclass", {"frozen": False}), T.Clause("Entry"), T.Clause("Union", {"frozen": False}),
                 T.Clause("Intersection", {"frozen": False}), T.Clause("Alias"), T.Clause("NativeAlias"), T.Clause("ListAlias"))
"""Classes that are not frozen, and every relation's entry class."""




def generate(schemas: Stores.Store, policy: T.Policy = PLAIN, earlier: Iterable[T.Step] = ()) -> T.Session:
    """A session that renders the schemas `schemas` registers, and those they refer to, as the dataclasses of a new
    module, run to the end: each decision an `earlier` step with its key took (`Dataclass(s=Contact)`) taken again, the
    others by `policy`; the module is its store's output (`text(session)`)."""
    session = T.Session(store(schemas, Py.LANGUAGE.Builders.Module().create()), list(TO_PYTHON), earlier=earlier)
    session.run(policy)
    return session


def read(module: Py.Module, schemas: Stores.Store | None = None) -> T.Session:
    """A session that reads the dataclasses of `module` as schemas registered in `schemas` (a new store if none), run to
    the end."""
    session = T.Session(store(Proxies.OfStore() if schemas is None else schemas, module), list(FROM_PYTHON))
    session.run(T.Policy(T.Clause("Schema"), T.Clause("AliasSchema")))
    return session


def missing(session: T.Session) -> list[Any]:
    """The object schemas, unions, intersections, relations, named natives and named lists of a generation's store that no
    class or alias renders, each kind in name order: those no transform renders (see their befores), whose names a field
    may still name (completeness, which mbse-patterns plans in general)."""
    classes = set(_definitions(_module(session.store)))
    return [schema for kind in ("Schemas.Object", "Schemas.Union", "Schemas.Intersection", "Schemas.Relation",
                                "Schemas.Native", "Schemas.Indexed")
            for schema in session.store.extent(kind) if schema.name not in classes]


def problems(session: T.Session) -> list[str]:
    """What makes a session's module invalid Python, by path (mbse-programs' validation): such as a name Python cannot
    spell, which `Dataclass` writes as the schema has it; and, by qualified name, a class nested in a dataclass under
    the name of one of its fields (`Codegen.Output` where `Codegen` has a field `Output`), which would replace it."""
    module = _module(session.store)
    clashes = [f"{name}.{_defined(nested)}: both a field and a class or alias nested in {name}"
               for name, defined in _definitions(module).items() if _is_dataclass(defined)
               for nested in defined.body if _defined(nested) is not None
               and _defined(nested) in {_spelling(item.target) for item in defined.body if isinstance(item, Py.AnnAssign)}]
    return Py.LANGUAGE.validate(module) + clashes


def text(session: T.Session) -> str:
    """The source of a session's module, as Python 3.12 prints it; `ValueError` listing its `problems` if it has any."""
    found = problems(session)
    if found:
        raise ValueError(f"the module is not valid Python: {'; '.join(found)}")
    return Python312.print(_module(session.store))
