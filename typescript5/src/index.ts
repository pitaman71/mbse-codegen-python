/** mbse-codegen-python: schemas as Python source and back.
 *
 * mbse-schemas' schemas are rendered as Python dataclasses through mbse-programs' Python syntax trees, step by step
 * with mbse-transforms' transforms, and Python source is read back into schemas (`Types`; see mbse-basis
 * [CAP-027: Python3 source generated from schemas](mbse:mbse-basis/docs/capabilities/CAP-027.md)).
 *
 * `Types` (`Types.ts`) is set aside until the port's stage 5, which ports it as the Python port's stages 1 to 4 do
 * ([the port proposal](mbse:mbse-codegen-python/docs/proposals/port/README.md#the-typescript-side)): it imports
 * mbse-patterns and mbse-programs 0.3, which this package no longer depends on, and nothing exports it.
 */

export {};
