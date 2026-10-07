<!-- nav -->
[Why the mbse repositories exist →](MBSE.md)

# mbse-codegen-python

`mbse-codegen-python` turns a specification's schemas into the Python an implementation is written in, and reads that
Python back, so that code and specification cannot drift: the dataclasses are generated from the schemas, step by
recorded step, and a hand edit to them reads back as a change to the schemas. It is part of the mbse repositories'
[executable specifications](MBSE.md).

It renders [mbse-schemas](https://github.com/pitaman71/mbse-schemas)' schemas as idiomatic Python dataclasses, through
[mbse-programs](https://github.com/pitaman71/mbse-programs)' Python syntax trees, with
[mbse-patterns](https://github.com/pitaman71/mbse-patterns)' transforms: each step is one decision (a class, a field, a
parameter such as whether a class is frozen), which a person or an agent takes, or a policy ranks. The steps are kept as
data, a trace that replays the generation.

Status: `Types`, schemas to dataclasses and back, is built (0.1); see [the design](docs/CODEGEN.md). Two equivalent
implementations exist, `python3/` and `typescript5/`, and both generate the same Python. Start with
[the skill](skills/mbse-codegen-python/SKILL.md).

---

<!-- nav -->
[Why the mbse repositories exist →](MBSE.md)
