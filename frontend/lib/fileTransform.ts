import { FileNode } from "@/types/ide";

export interface BackendFile {
  path: string;
  content: string;
}

/**
 * Transforms the new IDE file structure (fileContents with full paths)
 * into the format expected by the backend compiler.
 */
export function transformFilesForBackend(
  fileContents: Record<string, string>,
  activeContractName: string
): BackendFile[] {
  const files: BackendFile[] = [];

  // Add all files from fileContents
  for (const [path, content] of Object.entries(fileContents)) {
    // Skip non-contract files (like README at root)
    if (!path.includes("contracts/") && path !== "Cargo.toml") {
      continue;
    }
    
    // Normalize path - remove leading slash if present
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    files.push({ path: normalizedPath, content });
  }

  // Check if root Cargo.toml exists, if not generate it
  const hasRootCargo = files.some(f => f.path === "Cargo.toml");
  if (!hasRootCargo) {
    files.push({
      path: "Cargo.toml",
      content: generateRootCargoToml(activeContractName)
    });
  }

  return files;
}

/**
 * Generates the root workspace Cargo.toml for Soroban contracts
 */
export function generateRootCargoToml(contractName: string): string {
  return `[workspace]
resolver = "2"
members = [
  "contracts/${contractName}", 
]

[workspace.dependencies]
soroban-sdk = "*"
stellar-tokens = "=0.5.0"
stellar-access = "=0.5.0"
stellar-contract-utils = "=0.5.0"
stellar-macros = "=0.5.0"

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
`;
}

/**
 * Generates the contract-specific Cargo.toml
 */
export function generateContractCargoToml(contractName: string): string {
  return `[package]
name = "${contractName}"
version = "0.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }
`;
}

/**
 * Generates the default lib.rs for a new contract
 */
export function generateContractLibRs(contractName: string): string {
  const pascalName = contractName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return `#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, vec, Env, Symbol, Vec};

#[contract]
pub struct ${pascalName}Contract;

#[contractimpl]
impl ${pascalName}Contract {
    pub fn hello(env: Env, to: Symbol) -> Vec<Symbol> {
        vec![&env, symbol_short!("Hello"), to]
    }
}
`;
}

/**
 * Extracts the active contract name from the file structure.
 * Assumes structure: contracts/{contractName}/...
 */
export function getActiveContractName(activeFile: string | null): string {
  if (!activeFile) return "hello_world";
  
  // Match pattern: contracts/{name}/...
  const match = activeFile.match(/contracts\/([^/]+)/);
  return match ? match[1] : "hello_world";
}

/**
 * Creates the initial file structure for a new contract
 */
export function createContractFileStructure(contractName: string): {
  tree: FileNode[];
  contents: Record<string, string>;
} {
  const tree: FileNode[] = [
    {
      id: "contracts",
      name: "contracts",
      type: "folder",
      children: [
        {
          id: `contracts/${contractName}`,
          name: contractName,
          type: "folder",
          children: [
            {
              id: `contracts/${contractName}/src`,
              name: "src",
              type: "folder",
              children: [
                {
                  id: `contracts/${contractName}/src/lib.rs`,
                  name: "lib.rs",
                  type: "file"
                }
              ]
            },
            {
              id: `contracts/${contractName}/Cargo.toml`,
              name: "Cargo.toml",
              type: "file"
            }
          ]
        }
      ]
    },
    {
      id: "Cargo.toml",
      name: "Cargo.toml",
      type: "file"
    }
  ];

  const contents: Record<string, string> = {
    [`contracts/${contractName}/src/lib.rs`]: generateContractLibRs(contractName),
    [`contracts/${contractName}/Cargo.toml`]: generateContractCargoToml(contractName),
    "Cargo.toml": generateRootCargoToml(contractName)
  };

  return { tree, contents };
}
