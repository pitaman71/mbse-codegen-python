"""Types: schemas as Python dataclasses, and dataclasses as schemas, step by step.

A session (mbse-patterns' `Transforms`) runs over one store, `store(schemas, module)`: the schemas a store registers and
those they refer to (mbse-schemas' `Reflection.of`), Python's syntax trees (mbse-programs), and the output, whose
singleton `Codegen.Output` holds the module written or read. Each step is one decision:

- `Dataclass` renders an object schema `s` as a class of the module, with a field per property, in order, each optional
  (`name: str | None = None`); its parameter `frozen` (a `bool`) is the decision. It applies where `s` is named, declares
  no parameters and no adjacencies, and every property's type is a basic native, a named schema (by its name) or a
  positional list of either (`list[...]`). A reference object schema compares by identity (`eq=False`), and a schema's
  description is the class's docstring.
- `Schema` reads a `@dataclass` class `c` of the module back as an object schema, registered in the schemas' store; a
  class a field names before its own step is registered empty, and filled by that step. A field's annotation is
  read as `Dataclass` writes one, and any other is refused.

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

__all__ = ["OUTPUT", "NATIVES", "KEYWORDS", "DEPTH", "Output", "Generated", "store", "Dataclass", "Schema", "TO_PYTHON",
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

s, c, n, k, t, p, x = (E.variable(name) for name in ("s", "c", "n", "k", "t", "p", "x"))


def _basic(type_: E.Writer) -> E.Writer:
    return type_.get("native").get("format").eq("basic")


def _simple(type_: E.Writer) -> E.Writer:
    """A basic native, or a named object schema."""
    named = P.Exists(lambda q: q.symbols({"x": S.OfObject.Schema}).requires(
        x.get("name").eq(type_.get("named").get("name"))))
    return _basic(type_).or_(E.operation("and", type_.has("named"), named))


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


_RENDERABLE = s.has("name").and_(s.has("parameters").not_()).and_(s.has("adjacencies").not_()).and_(
    s.has("properties").not_().or_(s.get("properties").all("p", _rendered(p.get("type")))))
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


def _imports(module: Py.Module) -> None:
    """The imports a dataclass needs, once, at the top."""
    present = [statement for statement in module.body if isinstance(statement, Py.ImportFrom)]
    if not present:
        B = Py.LANGUAGE.Builders
        module.body[0:0] = [
            B.ImportFrom().module(lambda d: d.add_names("__future__")).add_names(
                lambda a: a.name(lambda d: d.add_names("annotations"))).create(),
            B.ImportFrom().module(lambda d: d.add_names("dataclasses")).add_names(
                lambda a: a.name(lambda d: d.add_names("dataclass"))).create()]


def _decorator(schema: Any, frozen: bool) -> Any:
    keywords = [(name, "False" if name == "eq" else "True") for name, on in (("eq", schema.ref), ("frozen", frozen)) if on]
    if not keywords:
        return lambda b: _name(b, "dataclass")
    return lambda b: functools.reduce(
        lambda built, keyword: built.add_keywords(
            lambda w: w.arg(keyword[0]).value(lambda x: x.Constant().spelling(keyword[1]))),
        keywords, b.Call().func(lambda x: _name(x, "dataclass")))


def _render(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> None:
    schema = match["s"]
    B = Py.LANGUAGE.Builders
    body = [B.Expr().value(lambda b: b.Constant().spelling(_quoted(schema.description))).create()] if (
        schema.description is not None) else []
    body += [B.AnnAssign().target(lambda b, name=name: _name(b, _field(name))).annotation(
                 lambda b, type_=prop.type: b.BinOp().left(_annotation(type_)).op("|").right(
                     lambda x: x.Constant().spelling("None"))).value(lambda b: b.Constant().spelling("None")).create()
             for name, prop in schema.properties.items()]
    built = B.ClassDef().name(schema.name).add_decorator_list(_decorator(schema, arguments["frozen"])).create()
    built.body = body or [B.Pass().create()]
    module = _module(store)
    _imports(module)
    _place(module, built)


def _place(module: Py.Module, built: Py.ClassDef) -> None:
    """Places a class among the module's classes in name order, so that the module does not depend on the order of the
    steps."""
    after = [i for i, statement in enumerate(module.body)
             if isinstance(statement, Py.ClassDef) and statement.name.spelling > built.name.spelling]
    module.body.insert(after[0] if after else len(module.body), built)


Dataclass = T.Transform(
    "Dataclass", _over({"s": S.OfObject.Schema}, _RENDERABLE), _over({"s": S.OfObject.Schema}, _HAS_CLASS),
    [lambda q: q.name("frozen").of(lambda x: x.as_native(bool)).description("Whether the class is frozen")], _render)
"""An object schema as a dataclass of the module."""

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
_HAS_SCHEMA = P.Exists(lambda q: q.symbols({"t": S.OfObject.Schema}).requires(
    P.Contains(c.children, lambda e: e.property == "name" and e.child.spelling == t.name)).requires(
    t.has("properties").and_(t.get("properties").count().eq(_FIELDS)).or_(
        t.has("properties").not_().and_(_FIELDS.eq(0)))))


def _spelling(node: Any) -> str:
    return node.id.spelling


def _type(schemas: Stores.Store, annotation: Any, where: str) -> Any:
    """The type an annotation `Dataclass` writes names: a basic native, a named schema, or a list or dict of them."""
    if isinstance(annotation, Py.Name):
        name = _spelling(annotation)
        return S.OfNative.Data({"bool": bool, "int": int, "float": float, "str": str, "bytes": bytes}[name]) if (
            name in NATIVES) else _named(schemas, name)
    container = _spelling(annotation.value) if isinstance(annotation, Py.Subscript) and isinstance(
        annotation.value, Py.Name) else None
    if container == "list":
        return S.OfIndexed.Builder().of(_type(schemas, annotation.slice, where)).create()
    if container == "dict" and isinstance(annotation.slice, Py.Tuple) and len(annotation.slice.elts) == 2:
        key, item = (_type(schemas, element, where) for element in annotation.slice.elts)
        return S.OfIndexed.Builder().key(key).of(item).create()
    raise ValueError(f"{where}: cannot read the annotation {Python312.print(annotation).strip()}")


def _named(schemas: Stores.Store, name: str) -> Any:
    """The schema registered as `name`, or one registered empty, to be filled when its class is read."""
    if name not in schemas.names():
        schemas.register(S.OfObject.Builder().name(name).create())
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


def _read_class(store: Stores.Combined, match: dict[str, Any], arguments: dict[str, Any]) -> None:
    cls = match["c"]
    schemas = _schemas(store)
    name = cls.name.spelling
    body = list(cls.body)
    docstring = body[0] if body and isinstance(body[0], Py.Expr) and isinstance(body[0].value, Py.Constant) else None
    fields = [(_property(_spelling(field.target)), _type(schemas, _optional(field.annotation),
                                                         f"{name}.{_spelling(field.target)}"))
              for field in body if isinstance(field, Py.AnnAssign)]
    schema = _named(schemas, name)
    builder = S.OfObject.Builder(schema).properties(*[lambda q, f=f, y=y: q.name(f).of(y) for f, y in fields])
    if any(_keywords(d).get("eq") == "False" for d in cls.decorator_list):
        builder = builder.ref()
    if docstring is not None:
        builder = builder.description(_unquoted(docstring.value.spelling))
    builder.update()


Schema = T.Transform("Schema", _over({"c": Py.ClassDef.Schema}, _DECORATED),
                     _over({"c": Py.ClassDef.Schema}, _HAS_SCHEMA), rewrite=_read_class)
"""A dataclass of the module as an object schema."""

TO_PYTHON = (Dataclass,)
FROM_PYTHON = (Schema,)
PLAIN = T.Policy(T.Clause("Dataclass", {"frozen": False}))
"""Classes that are not frozen."""


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
    session.run(T.Policy(T.Clause("Schema")))
    return session


def missing(session: T.Session) -> list[Any]:
    """The object schemas of a generation's store that no class renders, in name order: those `Dataclass` does not
    render (see its before), whose names a field may still name (completeness, which mbse-patterns plans in general)."""
    classes = {statement.name.spelling for statement in _module(session.store).body if isinstance(statement, Py.ClassDef)}
    return [schema for schema in session.store.extent("Schemas.Object") if schema.name not in classes]


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
