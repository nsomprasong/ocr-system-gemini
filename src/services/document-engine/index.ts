// document-engine/index.ts
// ---------------------------------------------------------------------------
// Entry point for the standalone document-engine module.
// This file re-exports the public API of the document processing pipeline.
// The real implementation will live in the numbered modules, but for now
// everything is just a typed placeholder so the project can compile.

export * from "./01_extractText";
export * from "./02_analyzeStructure";
export * from "./03_convertToRecords";
export * from "./04_validateRecords";
export * from "./05_exportExcel";

