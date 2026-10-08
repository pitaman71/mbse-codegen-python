---
name: mbse-codegen-python
description: Generate Python dataclasses from mbse-schemas schemas, and read dataclasses back into schemas, step by step with every decision recorded (mbse-patterns' transforms over mbse-programs' Python syntax trees), in Python or TypeScript. Use when an interface or model kept as mbse-schemas schemas must become Python source an implementation uses, when hand-written dataclasses must be read back as schemas, when a person or an agent must take the decisions of a generation one at a time with a policy for the rest, or when writing code that imports mbse.Codegen.Python or @mbse/codegen-python.
---

# mbse-codegen-python

Code generated from a specification keeps the two from drifting. `Types` renders the object schemas a store registers
(and those they refer to) as Python dataclasses, and reads a module's dataclasses back as schemas. Each is a session of
[mbse-patterns](https://github.com/pitaman71/mbse-patterns)' transforms, one step per decision, over one store: the
schemas, Python's syntax trees ([mbse-programs](https://github.com/pitaman71/mbse-programs)) and the output module.

```python
from mbse.Codegen.Python import Types
from mbse.Patterns import Transforms as T
from mbse.Programs.Python import Python312
from mbse.Schemas.Framework import Proxies, Schemas as S

Phone = S.OfObject.Builder().name("Phone").properties(lambda p: p.name("number").of(lambda t: t.as_native(str))).create()
Contact = S.OfObject.Builder().name("Contact").ref().properties(
    lambda p: p.name("name").of(lambda t: t.as_native(str)), lambda p: p.name("home").of(Phone)).create()
schemas = Proxies.OfStore()
schemas.register(Contact)  # Phone, which Contact refers to, is rendered too

# Every decision by a policy: here, no class is frozen.
assert Types.text(Types.generate(schemas)) == (
    "from __future__ import annotations\nfrom dataclasses import dataclass\n\n\n@dataclass(eq=False)\nclass Contact:\n"
    "    name: str | None = None\n    home: Phone | None = None\n\n\n@dataclass\nclass Phone:\n    number: str | None = None\n")

# Or one decision at a time: the caller takes a candidate, and a policy takes the rest.
session = T.Session(Types.store(schemas, Python312.parse("")), list(Types.TO_PYTHON))
session.take(next(c for c in session.candidates() if c.match["s"] is Phone and c.arguments["frozen"]))
session.run(Types.PLAIN)
assert "@dataclass(frozen=True)\nclass Phone:" in Types.text(session)
assert [(step.by, dict(step.arguments)) for step in session.steps] == [("caller", {"frozen": True}), ("policy", {"frozen": False})]

# Read the source back: the same schemas, frozen aside (the trace keeps it).
read = Types.read(Python312.parse(Types.text(session)))
contact = read.store.stores[0].store.registered("Contact")
assert contact.ref and list(contact.properties) == ["name", "home"]
```

```typescript
import { Types } from "@mbse/codegen-python";
import { Transforms as T } from "@mbse/patterns";
import { Python312 } from "@mbse/programs/Python";
import { Proxies, Schemas as S } from "@mbse/schemas/Framework";

const check = (condition: boolean, what: string) => {
  if (!condition) throw new Error(what);
};
const Phone = new S.OfObject.Builder().name("Phone").properties((p) => p.name("number").of((t) => t.as_native(String))).create();
const Contact = new S.OfObject.Builder().name("Contact").ref().properties(
  (p) => p.name("name").of((t) => t.as_native(String)), (p) => p.name("home").of(Phone)).create();
const schemas = new Proxies.OfStore();
schemas.register(Contact); // Phone, which Contact refers to, is rendered too

// Every decision by a policy: here, no class is frozen.
check(Types.text(Types.generate(schemas)) ===
  "from __future__ import annotations\nfrom dataclasses import dataclass\n\n\n@dataclass(eq=False)\nclass Contact:\n" +
  "    name: str | None = None\n    home: Phone | None = None\n\n\n@dataclass\nclass Phone:\n    number: str | None = None\n", "generated");

// Or one decision at a time: the caller takes a candidate, and a policy takes the rest.
const session = new T.Session(Types.store(schemas, Python312.parse("") as never), [...Types.TO_PYTHON]);
session.take(session.candidates().find((c) => c.match["s"] === Phone && c.arguments["frozen"] === true) as T.Candidate);
session.run(Types.PLAIN);
check(Types.text(session).includes("@dataclass(frozen=True)\nclass Phone:"), "frozen");
check(session.steps.map((step) => step.by).join() === "caller,policy", "decided");

// Read the source back: the same schemas, frozen aside (the trace keeps it).
const read = Types.read(Python312.parse(Types.text(session)) as never);
const contact = (read.store as any).stores[0].store.registered("Contact");
check(contact.ref && [...contact.properties.keys()].join() === "name,home", "read");
```

## Practices

1. **One step per decision.** `Dataclass` has one parameter, `frozen`; a policy (`T.Policy(T.Clause("Dataclass",
   {"frozen": False}))`, `Types.PLAIN`) ranks the candidates, and `session.take(candidate)` is the caller deciding.
   `session.steps` is the trace, and `session.trace(...)` writes it as data.
2. **What renders.** A named object schema without parameters, whose properties are basic natives, named
   object schemas, or lists of them (`list[T]`, `dict[K, V]` keyed by a basic native, nested up to `Types.DEPTH`),
   without extents. Names are written as the schemas have them (a keyword property becomes `from_`): one Python cannot
   spell is in `Types.problems(session)`, and `Types.text(session)` raises `ValueError` while any remain. A reference
   object schema is `@dataclass(eq=False)`; a description is the class's docstring. Every field is optional: `name: T | None
   = None`. Classes are in name order. A relation of two links is a container field from its first link: `set[E]`,
   `list[E]` (an `index: int`) or `dict[K, E]` (another native key), `E` the reference object classes at its second
   link, with `field(default=None, metadata={...})` keeping what is not as the field says (relation name, links, key,
   backs, uniques). `Types.missing(session)` lists the object schemas left without a class.
3. **What reads back.** A `@dataclass` class (`@dataclass(...)` too) whose annotations are written as `Dataclass`
   writes them, `| None` or not; anything else raises `ValueError` naming the field. Reading registers the schemas in
   the store given, and fills a schema a field names when its class is read.
4. **Regenerating.** `Types.generate(schemas, policy, earlier=session.steps)` takes each earlier decision again where
   its key (`Dataclass(s=Contact)`) still occurs: after the schemas change, only new schemas ask. `session.orphans` are
   decisions about schemas now gone; `Transforms.diff(earlier, later)` compares two generations.
5. **Round trips.** Schemas to source to schemas gives the same schemas; source to schemas to source gives the source as
   Python 3.12 prints it, given the same decisions. `frozen` is the one thing a schema does not hold.

The design, and what is not rendered yet (unions, parameters, relations): [CODEGEN.md](https://github.com/pitaman71/mbse-codegen-python/blob/main/docs/CODEGEN.md).
