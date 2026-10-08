"""Types: schemas as Python dataclasses, and dataclasses as schemas, step by step.

A session (mbse-patterns' `Transforms`) runs over one store, `store(schemas, module)`: the schemas a store registers and
those they refer to (mbse-schemas' `Reflection.of`), Python's syntax trees (mbse-programs), and the output, whose
singleton `Codegen.Output` holds the module written or read. Each step is one decision:

- `Dataclass` renders an object schema `s` as a class of the module, with a field per property, in order, each optional
  (`name: str | None = None`), then one per adjacency, named after it, holding its entries (`phones: tuple[Phones, ...]
  = ()`); its parameter `frozen` (a `bool`) is the decision. It applies where `s` is named, declares no parameters, every
  property's type renders (a basic native, a named object schema, or a list of them without an extent, positional or
  keyed by a basic native, nested `DEPTH` deep) and every adjacency is to a named relation. A reference object schema
  compares by identity (`eq=False`), and a schema's description is the class's docstring. Where a schema declares
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
- `FlatUnion` reads a type alias of the module back as a flat union, a branch per type of `A | B | ...`.

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
from mbse.Programs.Python import Python312, Syntax as Py
from mbse.Schemas.Framework import Bindings, Proxies, Reflection, Schemas as S, Stores

__all__ = ["OUTPUT", "NATIVES", "KEYWORDS", "DEPTH", "Output", "Generated", "store", "Dataclass", "Entry", "Union",
           "Intersection", "Alias", "Schema", "FlatUnion", "TO_PYTHON",
           "FROM_PYTHON", "PLAIN", "missing", "problems",
           "generate", "read", "text"]

OUTPUT = "Codegen.Output"
NATIVES = ("bool", "int", "float", "str", "bytes")
"""The basic natives' tokens, which are also Python's names for them."""
KEYWORDS = ("False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del",
            "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
            "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield")
"""Python's keywords: a field so named is written with a trailing underscore (`from_`), and read back without it."""
DEPTH = 4
"""How deeply lists nest in a field's type (`list[list[int]]` is 2)."""

Generated = S.OfRelation.Builder().name("Codegen.Generated").links("output", "module").create()
_OutputSchema = S.OfObject.Builder().name(OUTPUT).ref().singleton(OUTPUT).relations(
    lambda r: r.name("modules").of(Generated).me("output")).create()


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
    _OutputSchema, lambda output: Bindings.State(
        {}, {"modules": [Bindings.Entry({"module": m}) for m in ([] if output.module is None else [output.module])]}),
    lambda state: Output(*[e.links["module"] for e in state.entries.get("modules", [])]))


def store(schemas: Stores.Store, module: Py.Module) -> Stores.Combined:
    """The store a session runs over: the schemas `schemas` registers and those they refer to, Python's syntax trees,
    and the output, which holds `module`."""
    outputs = Bindings.OfStore([(_OutputSchema, lambda instance=None: Bindings.Builder(_BINDING, instance))], [Generated])
    outputs.singleton(OUTPUT).module = module
    return Stores.Combined(Reflection.of(schemas), Py.LANGUAGE.Builders, outputs)


def _module(store: Stores.Combined) -> Py.Module:
    return store.singleton(OUTPUT).module


def _schemas(store: Stores.Combined) -> Stores.Store:
    return store.stores[0].store


# --- Schemas to classes ---

s, c, n, k, t, p, x, r, a, b, u, y, w, d = (E.variable(name) for name in (
    "s", "c", "n", "k", "t", "p", "x", "r", "a", "b", "u", "y", "w", "d"))


def _basic(type_: E.Writer) -> E.Writer:
    return type_.get("native").get("format").eq("basic")


def _simple(type_: E.Writer) -> E.Writer:
    """A basic native, or a named object schema, union or intersection: each a class."""
    named = [P.Exists(lambda q, meta=meta: q.symbols({"x": meta}).requires(x.get("name").eq(type_.get("named").get("name"))))
             for meta in (S.OfObject.Schema, S.OfUnion.Schema, S.OfIntersection.Schema)]
    return _basic(type_).or_(E.operation("and", type_.has("named"), E.operation("or", named[0], E.operation(
        "or", named[1], named[2]))))


def _rendered(type_: E.Writer, depth: int = DEPTH) -> E.Writer:
    """A type `Dataclass` renders: a simple one, or a list without an extent of one it renders, positional or keyed by a
    basic native, nested `depth` deep at most."""
    if depth == 0:
        return _simple(type_)
    indexed = type_.get("indexed")
    keyed = indexed.has("key").not_().or_(_basic(indexed.get("key")))
    return _simple(type_).or_(type_.has("indexed").and_(indexed.has("extent").not_()).and_(keyed).and_(
        _rendered(indexed.get("item"), depth - 1)))


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
_HAS_CLASS = P.Exists(lambda q: q.symbols({"c": Py.ClassDef.Schema}).requires(
    P.Contains(c.children, lambda e: e.property == "name" and e.child.spelling == s.name)))


def _name(builder: Any, spelling: str) -> Any:
    return builder.Name().id(spelling)


def _annotation(type_: Any) -> Any:
    """The annotation of a type `Dataclass` renders."""
    if isinstance(type_, S.OfIndexed.Data) and type_.key is not None:
        return lambda b: b.Subscript().value(lambda x: _name(x, "dict")).slice(
            lambda x: x.Tuple().add_elts(_annotation(type_.key)).add_elts(_annotation(type_.item)))
    if isinstance(type_, S.OfIndexed.Data):
        return lambda b: b.Subscript().value(lambda x: _name(x, "list")).slice(_annotation(type_.item))
    return lambda b: _name(b, type_.token.name if type_.name is None else type_.name)


def _field(name: str) -> str:
    """A property's name as a field's: a keyword with a trailing underscore."""
    return f"{name}_" if name in KEYWORDS else name


def _quoted(text: str) -> str:
    """A string literal of `text`, in double quotes."""
    escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'




def _require(module: Py.Module, source: str, name: str) -> None:
    """Imports `name` from `source`, once, after `from __future__ import annotations`, the imports in the order
    `dataclasses`, `typing`, whichever step needs them first."""
    B = Py.LANGUAGE.Builders
    imports = [statement for statement in module.body if isinstance(statement, Py.ImportFrom)]
    if not imports:
        imports = [B.ImportFrom().module(lambda d: d.add_names("__future__")).add_names(
            lambda a: a.name(lambda d: d.add_names("annotations"))).create()]
        module.body.insert(0, imports[0])
    found = next((i for i in imports if i.module.names[0].spelling == source), None)
    if found is None:
        found = B.ImportFrom().module(lambda d: d.add_names(source)).create()
        position = 2 if source == "typing" else 1  # dataclasses is always needed first
        module.body.insert(position, found)
    names = [alias.name.names[0].spelling for alias in found.names]
    if name not in names:  # in name order, whichever step needs it first
        found.names.insert(sum(1 for other in names if other < name), B.Alias().name(lambda d: d.add_names(name)).create())


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
    return functools.reduce(lambda left, name: lambda b: b.BinOp().left(left).op("|").right(lambda x: _name(x, name)),
                            names[1:], lambda b: _name(b, names[0]))


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


def _optional_field(name: str, annotation: Any) -> Any:
    """`name: T | None = None`."""
    return Py.LANGUAGE.Builders.AnnAssign().target(lambda b: _name(b, _field(name))).annotation(
        lambda b: b.BinOp().left(annotation).op("|").right(lambda x: x.Constant().spelling("None"))).value(
        lambda b: b.Constant().spelling("None")).create()


def _docstring(description: str | None) -> list[Any]:
    return [] if description is None else [
        Py.LANGUAGE.Builders.Expr().value(lambda b: b.Constant().spelling(_quoted(description))).create()]


def _declarers(objects: list[Any], relation: Any, link: str) -> list[Any]:
    """The object schemas that declare an adjacency to `relation` via `link`, in name order: the link's types."""
    return [o for o in objects if any(a.relation is relation and a.me == link for a in o.adjacencies.values())]


def _render(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> None:
    schema = match["s"]
    B = Py.LANGUAGE.Builders
    body = _docstring(schema.description) + [_optional_field(name, _annotation(prop.type))
                                             for name, prop in schema.properties.items()]
    needs_field = False
    for name, adjacency in schema.adjacencies.items():
        relation = adjacency.relation
        entries = lambda b, relation=relation: b.Subscript().value(lambda x: _name(x, "tuple")).slice(  # noqa: E731
            lambda x: x.Tuple().add_elts(lambda y: _name(y, relation.name)).add_elts(lambda y: y.Constant().spelling("...")))
        ambiguous = len({a.me for a in schema.adjacencies.values() if a.relation is relation}) > 1
        default = (lambda b: b.Tuple()) if not ambiguous else (
            lambda b, me=adjacency.me: b.Call().func(lambda x: _name(x, "field")).add_keywords(
                lambda kw: kw.arg("default").value(lambda x: x.Tuple())).add_keywords(
                lambda kw: kw.arg("metadata").value(lambda x: x.Dict().add_items(
                    lambda i: i.key(lambda k: k.Constant().spelling('"me"')).value(
                        lambda v: v.Constant().spelling(_quoted(me)))))))
        needs_field = needs_field or ambiguous
        body.append(B.AnnAssign().target(lambda b, name=name: _name(b, _field(name))).annotation(entries).value(
            default).create())
    built = B.ClassDef().name(schema.name).add_decorator_list(_decorator(schema, arguments["frozen"])).create()
    built.body = body or [B.Pass().create()]
    module = _module(store)
    _require(module, "dataclasses", "dataclass")
    if needs_field:
        _require(module, "dataclasses", "field")
    _place(module, built)


def _render_entry(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> None:
    relation = match["r"]
    B = Py.LANGUAGE.Builders
    objects = list(store.extent("Schemas.Object"))
    uniques = sorted(sorted(unique) for unique in relation.uniques)
    body = _docstring(relation.description) + [_class_variable("LINKS", 1, list(relation.links))]
    body += [_class_variable("UNIQUES", 2, uniques)] if uniques else []
    body += [_optional_field(link, _union([o.name for o in _declarers(objects, relation, link)]))
             for link in relation.links]
    body += [_optional_field(name, _annotation(prop.type)) for name, prop in relation.properties.items()]
    built = B.ClassDef().name(relation.name).add_decorator_list(
        lambda b: b.Call().func(lambda x: _name(x, "dataclass")).add_keywords(
            lambda kw: kw.arg("eq").value(lambda x: x.Constant().spelling("False")))).create()
    built.body = body
    module = _module(store)
    _require(module, "dataclasses", "dataclass")
    _require(module, "typing", "ClassVar")
    _place(module, built)


def _defined(statement: Any) -> str | None:
    """The name a class or a type alias defines, or None for another statement."""
    if isinstance(statement, Py.ClassDef):
        return statement.name.spelling
    return statement.name.id.spelling if isinstance(statement, Py.TypeAlias) else None


def _place(module: Py.Module, built: Any) -> None:
    """Places a class or a type alias among the module's in name order, so that the module does not depend on the order
    of the steps."""
    name = _defined(built)
    after = [i for i, statement in enumerate(module.body) if (_defined(statement) or "") > name]
    module.body.insert(after[0] if after else len(module.body), built)


Dataclass = T.Transform(
    "Dataclass", _over({"s": S.OfObject.Schema}, _RENDERABLE), _over({"s": S.OfObject.Schema}, _HAS_CLASS),
    [lambda q: q.name("frozen").of(lambda x: x.as_native(bool)).description("Whether the class is frozen")], _render)
"""An object schema as a dataclass of the module."""

Entry = T.Transform(
    "Entry", _over({"r": S.OfRelation.Schema}, _ENTRY_RENDERABLE), _over({"r": S.OfRelation.Schema}, P.Exists(
        lambda q: q.symbols({"c": Py.ClassDef.Schema}).requires(
            P.Contains(c.children, lambda e: e.property == "name" and e.child.spelling == r.name)))), rewrite=_render_entry)
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
    if isinstance(type_, S.OfIndexed.Data):
        return "list" if type_.key is None else "dict"
    return type_.token.name if type_.name is None else _snake(type_.name)


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _metadata(entries: dict[str, Any]) -> Any:
    """A dict literal of text, lists of text and dicts of them."""
    def literal(value: Any) -> Any:
        if isinstance(value, str):
            return lambda b: b.Constant().spelling(_quoted(value))
        if isinstance(value, list):
            return lambda b: functools.reduce(lambda built, item: built.add_elts(literal(item)), value, b.List())
        return lambda b: functools.reduce(lambda built, item: built.add_items(
            lambda i: i.key(literal(item[0])).value(literal(item[1]))), value.items(), b.Dict())
    return literal(entries)


def _render_alias(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> None:
    schema = match["s"]
    B = Py.LANGUAGE.Builders
    union = functools.reduce(lambda left, branch: lambda b: b.BinOp().left(left).op("|").right(_annotation(branch.type)),
                             schema.branches[1:], _annotation(schema.branches[0].type))
    metadata: dict[str, Any] = {}
    if [branch.name for branch in schema.branches] != [_convention(branch.type) for branch in schema.branches]:
        metadata["branches"] = [branch.name for branch in schema.branches]
    if schema.description is not None:
        metadata["description"] = schema.description
    value = union if not metadata else lambda b: b.Subscript().value(lambda x: _name(x, "Annotated")).slice(
        lambda x: x.Tuple().add_elts(union).add_elts(_metadata(metadata)))
    module = _module(store)
    if metadata:
        _require(module, "typing", "Annotated")
    _place(module, B.TypeAlias().name(lambda b: b.id(schema.name)).value(value).create())


def _render_variants(kind: str) -> Any:
    def render(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> None:
        schema = match["s"]
        B = Py.LANGUAGE.Builders
        members = getattr(schema, _MEMBERS[kind])
        body = _docstring(schema.description) + [Py.LANGUAGE.Builders.AnnAssign().target(lambda b: _name(b, "KIND")).annotation(
            lambda b: b.Subscript().value(lambda x: _name(x, "ClassVar")).slice(lambda x: _name(x, "str"))).value(
            lambda b: b.Constant().spelling(_quoted(kind))).create()]
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
            members = [prop for part in members for prop in S.structure(part.type).properties.values()]
        body += [_optional_field(member.name, _annotation(member.type)) for member in members]
        built = B.ClassDef().name(schema.name).add_decorator_list(_decorator(schema, arguments["frozen"])).create()
        built.body = body
        module = _module(store)
        _require(module, "dataclasses", "dataclass")
        _require(module, "typing", "ClassVar")
        _place(module, built)
    return render


def _variants(kind: str, meta: Any) -> T.Transform:
    renderable = _variants_renderable(kind, False)
    if kind == "intersection":
        renderable = E.operation("or", renderable, _variants_renderable(kind, True))
    return T.Transform(
        kind.capitalize(), _over({"s": meta}, renderable), _over({"s": meta}, _HAS_CLASS),
        [lambda q: q.name("frozen").of(lambda x: x.as_native(bool)).description("Whether the class is frozen")],
        _render_variants(kind))


al, nm = E.variable("al"), E.variable("nm")
_HAS_ALIAS = P.Exists(lambda q: q.symbols({"al": Py.TypeAlias.Schema, "nm": Py.Name.Schema}).requires(
    P.Contains(al.children, lambda e: e.property == "name" and e.child == nm)).requires(
    P.Contains(nm.children, lambda e: e.property == "id" and e.child.spelling == s.name)))
"""Whether the module has a type alias named after `s`."""


Union = _variants("union", S.OfUnion.Schema)
"""A named union as a class of a field per branch, of which one is set, as a proxy's union value reads it, its class
variable `KIND` `"union"`."""
Intersection = _variants("intersection", S.OfIntersection.Schema)
Alias = T.Transform("Alias", _over({"s": S.OfUnion.Schema}, _variants_renderable("union", True)),
                    _over({"s": S.OfUnion.Schema}, _HAS_ALIAS), rewrite=_render_alias)
"""A flat union as a type alias of its branches' types (`type Channel = Call | Mail`), as a proxy reads its value; its
branches' names and its description, where it has them, in `Annotated` metadata."""
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
_COUNTED = t.has("properties").and_(t.has("adjacencies")).and_(_PROPERTIES.add(_ADJACENCIES).eq(_FIELDS)).or_(
    t.has("properties").and_(t.has("adjacencies").not_()).and_(_PROPERTIES.eq(_FIELDS))).or_(
    t.has("properties").not_().and_(t.has("adjacencies")).and_(_ADJACENCIES.eq(_FIELDS))).or_(
    t.has("properties").not_().and_(t.has("adjacencies").not_()).and_(_FIELDS.eq(0)))
_HAS_SCHEMA = E.operation(
    "or", P.Exists(lambda q: q.symbols({"t": S.OfObject.Schema}).requires(
        P.Contains(c.children, lambda e: e.property == "name" and e.child.spelling == t.name)).requires(
        t.has("ref").eq(_UNEQUAL).and_(t.has("description").eq(_DOCUMENTED))).requires(_COUNTED)),
    E.operation("or", P.Exists(lambda q: q.symbols({"r": S.OfRelation.Schema}).requires(
        P.Contains(c.children, lambda e: e.property == "name" and e.child.spelling == r.name)).requires(
        r.has("links"))), E.operation("or", *[P.Exists(lambda q, meta=meta, members=members: q.symbols({"t": meta}).requires(
            P.Contains(c.children, lambda e: e.property == "name" and e.child.spelling == t.name)).requires(
            t.has(members))) for meta, members in ((S.OfUnion.Schema, "branches"), (S.OfIntersection.Schema, "parts"))])))
"""Whether the class `c` has been read: an object schema named after it, a reference object's where `c` is
`eq=False`, described where it has a docstring, with a property or an adjacency per field; or a relation named after it,
with its links; or a union or an intersection named after it, with its members."""


def _spelling(node: Any) -> str:
    return node.id.spelling


def _type(schemas: Stores.Store, annotation: Any, where: str, module: Py.Module) -> Any:
    """The type an annotation `Dataclass` writes names: a basic native, a named schema, or a list or dict of them."""
    if isinstance(annotation, Py.Name):
        name = _spelling(annotation)
        return S.OfNative.Data({"bool": bool, "int": int, "float": float, "str": str, "bytes": bytes}[name]) if (
            name in NATIVES) else _named(schemas, name, module, where)
    container = _spelling(annotation.value) if isinstance(annotation, Py.Subscript) and isinstance(
        annotation.value, Py.Name) else None
    if container == "list":
        return S.OfIndexed.Builder().of(_type(schemas, annotation.slice, where, module)).create()
    if container == "dict" and isinstance(annotation.slice, Py.Tuple) and len(annotation.slice.elts) == 2:
        key, item = (_type(schemas, element, where, module) for element in annotation.slice.elts)
        return S.OfIndexed.Builder().key(key).of(item).create()
    raise ValueError(f"{where}: cannot read the annotation {Python312.print(annotation).strip()}")


def _named(schemas: Stores.Store, name: str, module: Py.Module, where: str = "") -> Any:
    """The schema registered as `name`, or, where the module has a class of that name, one registered empty, to be
    filled when that class is read: a union or an intersection where the class says so (`KIND`), else an object schema.
    A name that is neither is refused: reading never makes up a schema."""
    if name not in schemas.names():
        cls = next((statement for statement in module.body if _defined(statement) == name), None)
        if cls is None:
            raise ValueError(f"{where}: {name} is not a class of the module or a schema of the store")
        if isinstance(cls, Py.TypeAlias):
            schemas.register(S.OfUnion.Builder().name(name).flat().create())
            return schemas.registered(name)
        kind = _class_variables(cls).get("KIND")
        builder = {"union": S.OfUnion.Builder, "intersection": S.OfIntersection.Builder}.get(kind, S.OfObject.Builder)
        schemas.register(builder().name(name).create())
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




def _class_variables(cls: Any) -> dict[str, Any]:
    """The values of a class's `ClassVar`s, by name: tuples of text, or of tuples of text."""
    def value(node: Any) -> Any:
        node = node.value if isinstance(node, Py.Parenthesized) else node
        if isinstance(node, Py.Dict):
            return {value(item.key): value(item.value) for item in node.items}
        return [value(item) for item in node.elts] if isinstance(node, (Py.Tuple, Py.List)) else _unquoted(node.spelling)
    return {_spelling(statement.target): value(statement.value) for statement in cls.body
            if isinstance(statement, Py.AnnAssign) and isinstance(statement.annotation, Py.Subscript)
            and isinstance(statement.annotation.value, Py.Name) and _spelling(statement.annotation.value) == "ClassVar"}


def _fields(cls: Any) -> list[Any]:
    """A class's fields: its annotated names but its `ClassVar`s."""
    variables = _class_variables(cls)
    return [statement for statement in cls.body
            if isinstance(statement, Py.AnnAssign) and _spelling(statement.target) not in variables]


def _entry_class(module: Py.Module, name: str) -> Any:
    """The entry class (with `LINKS`) named `name` in the module, if any."""
    return next((statement for statement in module.body if isinstance(statement, Py.ClassDef)
                 and statement.name.spelling == name and "LINKS" in _class_variables(statement)), None)


def _alternatives(node: Any) -> list[str]:
    """The names of `A | B | ...`, in order."""
    if isinstance(node, Py.BinOp) and node.op == "|":
        return [*_alternatives(node.left), *_alternatives(node.right)]
    return [_spelling(node)] if isinstance(node, Py.Name) else []


def _entries(annotation: Any) -> str | None:
    """The entry class `tuple[R, ...]` holds, or None for another annotation."""
    if isinstance(annotation, Py.Subscript) and isinstance(annotation.value, Py.Name) and (
            _spelling(annotation.value) == "tuple") and isinstance(annotation.slice, Py.Tuple) and len(
            annotation.slice.elts) == 2 and isinstance(annotation.slice.elts[0], Py.Name):
        return _spelling(annotation.slice.elts[0])
    return None


def _me(module: Py.Module, owner: str, field: Any, relation: str, where: str) -> str:
    """The link an adjacency field is from: its metadata's `me`, else the one link of its entry class typed by the owner."""
    if isinstance(field.value, Py.Call):
        metadata = next(kw.value for kw in field.value.keywords if kw.arg.spelling == "metadata")
        return _unquoted(next(item.value.spelling for item in metadata.items if _unquoted(item.key.spelling) == "me"))
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
    name = cls.name.spelling
    if name not in schemas.names():
        schemas.register(S.OfRelation.Builder().name(name).create())
    variables = _class_variables(cls)
    links = variables["LINKS"]
    properties = [lambda q, f=_property(_spelling(field.target)), y=_type(
        schemas, _optional(field.annotation), f"{name}.{_spelling(field.target)}", module): q.name(f).of(y)
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
    name = cls.name.spelling
    typed = {_property(_spelling(field.target)): _type(schemas, _optional(field.annotation),
                                                       f"{name}.{_spelling(field.target)}", module)
             for field in _fields(cls)}
    parts = _class_variables(cls).get("PARTS")
    if parts is None:
        members = [lambda q, f=f, y=y: q.name(f).of(y) for f, y in typed.items()]
    else:
        members = [lambda q, f=part, y=(_named(schemas, held, module, f"{name}.PARTS") if isinstance(held, str) else
                                        S.OfObject.Builder().properties(*[lambda r, g=g: r.name(g).of(typed[g])
                                                                          for g in held]).create()):
                   q.name(f).of(y) for part, held in parts.items()]
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


def _read_class(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> None:
    cls = match["c"]
    schemas, module, name = _schemas(store), _module(store), cls.name.spelling
    if "LINKS" in _class_variables(cls):
        _read_entry(schemas, module, cls)
        return
    kind = _class_variables(cls).get("KIND")
    if kind is not None:
        _read_variants(schemas, module, cls, kind)
        return
    properties, adjacencies = [], []
    for field in _fields(cls):
        field_name, where = _property(_spelling(field.target)), f"{name}.{_spelling(field.target)}"
        relation_name = _entries(field.annotation)
        if relation_name is None:
            properties.append(lambda q, f=field_name, y=_type(schemas, _optional(field.annotation), where, module): q.name(
                f).of(y))
        else:
            relation = _relation(schemas, module, relation_name, where)
            me = _me(module, name, field, relation_name, where)
            adjacencies.append(lambda q, f=field_name, rel=relation, me=me: q.name(f).of(rel).me(me))
    builder = S.OfObject.Builder(_named(schemas, name, module)).properties(*properties).relations(*adjacencies)
    if any(_keywords(decorated).get("eq") == "False" for decorated in cls.decorator_list):
        builder = builder.ref()
    docstring = _docstring_of(cls)
    if docstring is not None:
        builder = builder.description(docstring)
    builder.update()


def _branches(node: Any) -> list[Any]:
    """The types of `A | B | ...`, in order: names or subscripts."""
    if isinstance(node, Py.BinOp) and node.op == "|":
        return [*_branches(node.left), *_branches(node.right)]
    return [node]


def _named_convention(node: Any) -> str:
    """The name a branch has unless its alias says otherwise, from its annotation, as `_convention` from its type."""
    head = node.value if isinstance(node, Py.Subscript) else node
    name = _spelling(head)
    return name if name in NATIVES or isinstance(node, Py.Subscript) else _snake(name)


def _read_alias(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> None:
    alias = match["al"]
    schemas, module, name = _schemas(store), _module(store), alias.name.id.spelling
    value, metadata = alias.value, {}
    if isinstance(value, Py.Subscript) and isinstance(value.value, Py.Name) and _spelling(value.value) == "Annotated":
        value, held = value.slice.elts
        metadata = {_unquoted(item.key.spelling): (_unquoted(item.value.spelling) if isinstance(item.value, Py.Constant) else
                                                   [_unquoted(e.spelling) for e in item.value.elts]) for item in held.items}
    nodes = _branches(value)
    names = metadata.get("branches", [_named_convention(node) for node in nodes])
    builder = S.OfUnion.Builder(_named(schemas, name, module)).branches(
        *[lambda q, f=f, node=node: q.name(f).of(_type(schemas, node, f"{name}.{f}", module))
          for f, node in zip(names, nodes)]).flat()
    if "description" in metadata:
        builder = builder.description(metadata["description"])
    builder.update()


_ALIASED = P.Exists(lambda q: q.symbols({"t": S.OfUnion.Schema, "nm": Py.Name.Schema}).requires(
    P.Contains(al.children, lambda e: e.property == "name" and e.child == nm)).requires(
    P.Contains(nm.children, lambda e: e.property == "id" and e.child.spelling == t.name)).requires(t.has("branches")))
FlatUnion = T.Transform("FlatUnion", _over({"al": Py.TypeAlias.Schema}, al.has("kind")),
                        _over({"al": Py.TypeAlias.Schema}, _ALIASED), rewrite=_read_alias)
"""A type alias of the module as a flat union: a branch per type of `A | B | ...`, named after it, or as its
`Annotated` metadata says."""

Schema = T.Transform("Schema", _over({"c": Py.ClassDef.Schema}, _DECORATED),
                     _over({"c": Py.ClassDef.Schema}, _HAS_SCHEMA), rewrite=_read_class)
"""A dataclass of the module as an object schema, or an entry class (with `LINKS`) as a relation."""

TO_PYTHON = (Dataclass, Entry, Union, Intersection, Alias)
FROM_PYTHON = (Schema, FlatUnion)
PLAIN = T.Policy(T.Clause("Dataclass", {"frozen": False}), T.Clause("Entry"), T.Clause("Union", {"frozen": False}),
                 T.Clause("Intersection", {"frozen": False}), T.Clause("Alias"))
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
    session.run(T.Policy(T.Clause("Schema"), T.Clause("FlatUnion")))
    return session


def missing(session: T.Session) -> list[Any]:
    """The object schemas, unions, intersections and relations of a generation's store that no class renders, each kind
    in name order: those `Dataclass`, `Union`, `Intersection` or `Entry` does not render (see their befores), whose names
    a field may still name (completeness, which mbse-patterns plans in general)."""
    classes = {_defined(statement) for statement in _module(session.store).body}
    return [schema for kind in ("Schemas.Object", "Schemas.Union", "Schemas.Intersection", "Schemas.Relation")
            for schema in session.store.extent(kind) if schema.name not in classes]


def problems(session: T.Session) -> list[str]:
    """What makes a session's module invalid Python, by path (mbse-programs' validation): such as a name Python cannot
    spell, which `Dataclass` writes as the schema has it."""
    return Py.LANGUAGE.validate(_module(session.store))


def text(session: T.Session) -> str:
    """The source of a session's module, as Python 3.12 prints it; `ValueError` listing its `problems` if it has any."""
    found = problems(session)
    if found:
        raise ValueError(f"the module is not valid Python: {'; '.join(found)}")
    return Python312.print(_module(session.store))
