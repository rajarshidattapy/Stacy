import { FileNode } from "@/types/ide";

/**
 * Find a node in the file tree by path
 */
export function findNodeByPath(
  tree: FileNode[],
  targetPath: string
): { node: FileNode; parent: FileNode[] | null; index: number } | null {
  const parts = targetPath.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  let current: FileNode[] = tree;
  let parent: FileNode[] | null = null;
  let index = -1;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const found = current.find((n) => {
      // Match by name, but also check if the path matches
      // For files, we need to match the full path (node.id)
      if (n.type === "file") {
        return n.id === targetPath || n.name === part;
      }
      return n.name === part;
    });
    
    if (!found) return null;
    
    if (i === parts.length - 1) {
      // Found the target node
      index = current.indexOf(found);
      return { node: found, parent, index };
    }
    
    if (found.type === "file") return null; // Can't traverse into a file
    
    parent = current;
    current = found.children || [];
    index = parent.indexOf(found);
  }
  
  return null;
}

/**
 * Get the full path for a node
 */
export function getNodePath(node: FileNode, parentPath: string = ""): string {
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  return node.type === "file" ? currentPath : currentPath;
}

/**
 * Deep clone a file tree
 */
export function cloneFileTree(tree: FileNode[]): FileNode[] {
  return tree.map((node) => ({
    ...node,
    children: node.children ? cloneFileTree(node.children) : undefined,
  }));
}

/**
 * Add a file to the tree
 */
export function addFileToTree(
  tree: FileNode[],
  parentPath: string,
  fileName: string
): FileNode[] {
  const cloned = cloneFileTree(tree);
  
  if (!parentPath) {
    // Add to root
    const newFile: FileNode = {
      id: fileName,
      name: fileName,
      type: "file",
    };
    cloned.push(newFile);
    return cloned;
  }
  
  const result = findNodeByPath(cloned, parentPath);
  if (!result || result.node.type !== "folder") {
    return cloned; // Parent not found or not a folder
  }
  
  const newFile: FileNode = {
    id: parentPath ? `${parentPath}/${fileName}` : fileName,
    name: fileName,
    type: "file",
  };
  
  if (!result.node.children) {
    result.node.children = [];
  }
  result.node.children.push(newFile);
  
  return cloned;
}

/**
 * Add a folder to the tree
 */
export function addFolderToTree(
  tree: FileNode[],
  parentPath: string,
  folderName: string
): FileNode[] {
  const cloned = cloneFileTree(tree);
  
  if (!parentPath) {
    // Add to root
    const newFolder: FileNode = {
      id: folderName,
      name: folderName,
      type: "folder",
      children: [],
    };
    cloned.push(newFolder);
    return cloned;
  }
  
  const result = findNodeByPath(cloned, parentPath);
  if (!result || result.node.type !== "folder") {
    return cloned; // Parent not found or not a folder
  }
  
  const newFolder: FileNode = {
    id: parentPath ? `${parentPath}/${folderName}` : folderName,
    name: folderName,
    type: "folder",
    children: [],
  };
  
  if (!result.node.children) {
    result.node.children = [];
  }
  result.node.children.push(newFolder);
  
  return cloned;
}

/**
 * Rename a file or folder in the tree
 */
export function renameNodeInTree(
  tree: FileNode[],
  oldPath: string,
  newName: string
): FileNode[] {
  const cloned = cloneFileTree(tree);
  const result = findNodeByPath(cloned, oldPath);
  
  if (!result) return cloned;
  
  result.node.name = newName;
  
  // Update the ID to reflect new path
  const pathParts = oldPath.split("/").filter(Boolean);
  pathParts[pathParts.length - 1] = newName;
  result.node.id = pathParts.join("/");
  
  // If it's a folder, update all children IDs
  if (result.node.type === "folder" && result.node.children) {
    const updateChildIds = (children: FileNode[], basePath: string) => {
      children.forEach((child) => {
        child.id = `${basePath}/${child.name}`;
        if (child.type === "folder" && child.children) {
          updateChildIds(child.children, child.id);
        }
      });
    };
    updateChildIds(result.node.children, result.node.id);
  }
  
  return cloned;
}

/**
 * Delete a file or folder from the tree
 */
export function deleteNodeFromTree(
  tree: FileNode[],
  targetPath: string
): FileNode[] {
  const cloned = cloneFileTree(tree);
  const result = findNodeByPath(cloned, targetPath);
  
  if (!result) return cloned;
  
  if (result.parent === null) {
    // Root level - remove directly from root array
    const index = cloned.findIndex((n) => {
      // Match by id or by path
      return n.id === targetPath || (n.type === "file" && n.id === targetPath);
    });
    if (index !== -1) {
      cloned.splice(index, 1);
    }
  } else {
    // Remove from parent's children
    // Find the parent node in the tree
    const findParent = (nodes: FileNode[], targetId: string): FileNode | null => {
      for (const node of nodes) {
        if (node.type === "folder" && node.children) {
          if (node.children.some((c) => c.id === targetId)) {
            return node;
          }
          const found = findParent(node.children, targetId);
          if (found) return found;
        }
      }
      return null;
    };
    
    const parentNode = findParent(cloned, result.node.id);
    if (parentNode && parentNode.children) {
      const index = parentNode.children.findIndex((c) => c.id === result.node.id);
      if (index !== -1) {
        parentNode.children.splice(index, 1);
      }
    }
  }
  
  return cloned;
}

/**
 * Get all file paths from a tree (for updating fileContents)
 */
export function getAllFilePaths(tree: FileNode[], basePath: string = ""): string[] {
  const paths: string[] = [];
  
  for (const node of tree) {
    const currentPath = basePath ? `${basePath}/${node.name}` : node.name;
    
    if (node.type === "file") {
      paths.push(node.id || currentPath);
    } else if (node.children) {
      paths.push(...getAllFilePaths(node.children, currentPath));
    }
  }
  
  return paths;
}

/**
 * Ensure a file path exists in the tree, creating any missing parent folders.
 */
export function ensureFilePathInTree(
  tree: FileNode[],
  filePath: string,
): FileNode[] {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length === 0) {
    return cloneFileTree(tree);
  }

  let nextTree = cloneFileTree(tree);
  let parentPath = "";

  for (const folderName of parts.slice(0, -1)) {
    const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    if (!pathExists(nextTree, folderPath)) {
      nextTree = addFolderToTree(nextTree, parentPath, folderName);
    }

    parentPath = folderPath;
  }

  if (!pathExists(nextTree, filePath)) {
    nextTree = addFileToTree(nextTree, parentPath, parts[parts.length - 1]);
  }

  return nextTree;
}

/**
 * Check if a path exists in the tree
 */
export function pathExists(tree: FileNode[], targetPath: string): boolean {
  return findNodeByPath(tree, targetPath) !== null;
}

/**
 * Get the parent path of a given path
 */
export function getParentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

/**
 * Get the name from a path (last segment)
 */
export function getNameFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

/**
 * Validate if a name is valid for a file/folder
 */
export function isValidName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Name cannot be empty" };
  }
  
  if (name.includes("/") || name.includes("\\")) {
    return { valid: false, error: "Name cannot contain path separators" };
  }
  
  // Check for invalid characters (Windows reserved names)
  const invalidNames = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
  if (invalidNames.includes(name.toUpperCase())) {
    return { valid: false, error: "Name is a reserved system name" };
  }
  
  // Check for invalid characters
  const invalidChars = /[<>:"|?*\x00-\x1F]/;
  if (invalidChars.test(name)) {
    return { valid: false, error: "Name contains invalid characters" };
  }
  
  if (name.trim() !== name) {
    return { valid: false, error: "Name cannot start or end with whitespace" };
  }
  
  return { valid: true };
}

/**
 * Check if a name already exists in a parent folder
 */
export function nameExistsInParent(
  tree: FileNode[],
  parentPath: string,
  name: string
): boolean {
  if (!parentPath) {
    // Check root level
    return tree.some((node) => node.name === name);
  }
  
  const result = findNodeByPath(tree, parentPath);
  if (!result || result.node.type !== "folder" || !result.node.children) {
    return false;
  }
  
  return result.node.children.some((child) => child.name === name);
}

/**
 * Move a file or folder to a new location
 */
export function moveNodeInTree(
  tree: FileNode[],
  sourcePath: string,
  targetParentPath: string,
  newName?: string
): FileNode[] {
  const cloned = cloneFileTree(tree);
  const sourceResult = findNodeByPath(cloned, sourcePath);
  
  if (!sourceResult) return cloned;
  
  const nodeToMove = sourceResult.node;
  const finalName = newName || nodeToMove.name;
  
  // Validate target parent exists and is a folder
  if (targetParentPath) {
    const targetResult = findNodeByPath(cloned, targetParentPath);
    if (!targetResult || targetResult.node.type !== "folder") {
      return cloned; // Invalid target
    }
  }
  
  // Check if name already exists in target
  if (nameExistsInParent(cloned, targetParentPath, finalName)) {
    return cloned; // Name conflict
  }
  
  // Remove from source location
  const treeAfterDelete = deleteNodeFromTree(cloned, sourcePath);
  
  // Update node name and ID
  nodeToMove.name = finalName;
  const newPath = targetParentPath ? `${targetParentPath}/${finalName}` : finalName;
  nodeToMove.id = newPath;
  
  // Update children IDs if it's a folder
  if (nodeToMove.type === "folder" && nodeToMove.children) {
    const updateChildIds = (children: FileNode[], basePath: string) => {
      children.forEach((child) => {
        child.id = `${basePath}/${child.name}`;
        if (child.type === "folder" && child.children) {
          updateChildIds(child.children, child.id);
        }
      });
    };
    updateChildIds(nodeToMove.children, nodeToMove.id);
  }
  
  // Add to target location
  if (!targetParentPath) {
    // Add to root
    treeAfterDelete.push(nodeToMove);
  } else {
    const targetResult = findNodeByPath(treeAfterDelete, targetParentPath);
    if (targetResult && targetResult.node.type === "folder") {
      if (!targetResult.node.children) {
        targetResult.node.children = [];
      }
      targetResult.node.children.push(nodeToMove);
    }
  }
  
  return treeAfterDelete;
}

/**
 * Get all nodes (files and folders) recursively
 */
export function getAllNodes(tree: FileNode[]): FileNode[] {
  const nodes: FileNode[] = [];
  
  for (const node of tree) {
    nodes.push(node);
    if (node.type === "folder" && node.children) {
      nodes.push(...getAllNodes(node.children));
    }
  }
  
  return nodes;
}

/**
 * Get the depth of a node in the tree
 */
export function getNodeDepth(tree: FileNode[], targetPath: string): number {
  const parts = targetPath.split("/").filter(Boolean);
  return parts.length;
}
