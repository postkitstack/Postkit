import {vi} from "vitest";

/**
 * Creates a mock file system state with helpers for common operations.
 *
 * Usage:
 *   const mockFs = createMockFileSystem({ '/path/file.txt': 'content' });
 *   // Then use mockFs.readFile, mockFs.writeFile, etc. as mock implementations
 */
export function createMockFileSystem(
  files: Record<string, string> = {},
  directories: Record<string, string[]> = {},
) {
  const state = {
    files: {...files},
    directories: {...directories},
    writtenFiles: {} as Record<string, string>,
    deletedFiles: new Set<string>(),
  };

  return {
    state,

    /** Mock for fs/promises.readFile */
    readFile: vi.fn(async (path: string | Buffer | URL): Promise<string | Buffer> => {
      const pathStr = path.toString();
      if (pathStr in state.files) return state.files[pathStr];
      const err = new Error(`ENOENT: no such file '${pathStr}'`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }),

    /** Mock for fs/promises.writeFile */
    writeFile: vi.fn(async (path: string | Buffer | URL, data: string | Buffer) => {
      const pathStr = path.toString();
      state.writtenFiles[pathStr] = data.toString();
      state.files[pathStr] = data.toString();
    }),

    /** Mock for fs/promises.readdir */
    readdir: vi.fn(async (path: string | Buffer | URL): Promise<string[]> => {
      const pathStr = path.toString();
      if (pathStr in state.directories) return state.directories[pathStr];
      const err = new Error(`ENOENT: no such directory '${pathStr}'`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }),

    /** Mock for fs/promises.unlink */
    unlink: vi.fn(async (path: string | Buffer | URL) => {
      const pathStr = path.toString();
      state.deletedFiles.add(pathStr);
      delete state.files[pathStr];
    }),

    /** Mock for fs/promises.mkdir */
    mkdir: vi.fn(async () => undefined),

    /** Mock for fs.existsSync */
    existsSync: vi.fn((path: string | Buffer | URL): boolean => {
      const pathStr = path.toString();
      return pathStr in state.files || pathStr in state.directories;
    }),

    /** Mock for fs.readFileSync */
    readFileSync: vi.fn((path: string | Buffer | URL): string => {
      const pathStr = path.toString();
      if (pathStr in state.files) return state.files[pathStr];
      throw new Error(`ENOENT: no such file '${pathStr}'`);
    }),

    /** Mock for fs.writeFileSync */
    writeFileSync: vi.fn((path: string | Buffer | URL, data: string) => {
      const pathStr = path.toString();
      state.writtenFiles[pathStr] = data;
      state.files[pathStr] = data;
    }),
  };
}
